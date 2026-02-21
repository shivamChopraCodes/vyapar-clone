const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error('Usage: node tools/import-vyapar.js /path/to/dump.sql');
  process.exit(1);
}
if (!fs.existsSync(dumpPath)) {
  console.error('Dump file not found:', dumpPath);
  process.exit(1);
}

const userDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'vyapar-clone');
fs.mkdirSync(userDataDir, { recursive: true });
const dbPath = path.join(userDataDir, 'vyapar.db');

const appDb = new Database(dbPath);
appDb.pragma('journal_mode = WAL');

appDb.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    gst_number TEXT,
    drug_license TEXT,
    address TEXT,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    gst_number TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    hsn TEXT,
    gst_rate REAL DEFAULT 0,
    base_rate REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL,
    batch_no TEXT,
    expiry_date TEXT,
    mrp REAL DEFAULT 0,
    rate REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES items(id)
  );

  CREATE TABLE IF NOT EXISTS party_rates (
    id INTEGER PRIMARY KEY,
    party_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    rate REAL DEFAULT 0,
    UNIQUE(party_id, item_id),
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    order_type TEXT NOT NULL,
    party_id INTEGER,
    order_date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (party_id) REFERENCES parties(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    batch_id INTEGER,
    qty REAL NOT NULL,
    rate REAL NOT NULL,
    gst_rate REAL NOT NULL,
    line_total REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (batch_id) REFERENCES batches(id)
  );
`);

const tempPath = path.join(os.tmpdir(), `vyapar_import_${Date.now()}.db`);
const tempDb = new Database(tempPath);
tempDb.pragma('foreign_keys = OFF');
const dumpSql = fs.readFileSync(dumpPath, 'utf8');

const tables = ['kb_tax_code', 'kb_items', 'kb_names', 'kb_party_item_rate'];
const createStatements = [];
const insertStatements = [];

tables.forEach((table) => {
  const createMatch = dumpSql.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS \\"${table}\\"[\\s\\S]*?;`, 'i')
  );
  if (createMatch) createStatements.push(createMatch[0]);
  const insertMatches = dumpSql.match(
    new RegExp(`INSERT INTO \\"${table}\\"[\\s\\S]*?;`, 'gi')
  );
  if (insertMatches) insertStatements.push(...insertMatches);
});

const sanitizeCreate = (stmt) => {
  const lines = stmt.split('\n').filter((line) => !line.includes('FOREIGN KEY'));
  let cleaned = lines.join('\n');
  cleaned = cleaned.replace(/,\s*\)/g, '\n)');
  return cleaned;
};

createStatements.forEach((stmt) => tempDb.exec(sanitizeCreate(stmt)));
insertStatements.forEach((stmt) => tempDb.exec(stmt));

const taxRows = tempDb.prepare('SELECT tax_code_id, tax_rate FROM kb_tax_code').all();
const taxMap = new Map(taxRows.map((row) => [row.tax_code_id, row.tax_rate || 0]));

const itemRows = tempDb
  .prepare(
    `SELECT item_id, item_name, item_hsn_sac_code, item_sale_unit_price, item_purchase_unit_price, item_tax_id
     FROM kb_items`
  )
  .all();

const partyRows = tempDb
  .prepare(
    `SELECT name_id, full_name, phone_number, address, name_gstin_number
     FROM kb_names`
  )
  .all();

const rateRows = tempDb
  .prepare(
    `SELECT party_item_rate_item_id, party_item_rate_party_id, party_item_rate_sale_price, party_item_rate_purchase_price
     FROM kb_party_item_rate`
  )
  .all();

const insertParty = appDb.prepare(
  `INSERT INTO parties (id, name, phone, address, gst_number)
   VALUES (@id, @name, @phone, @address, @gst_number)`
);
const insertItem = appDb.prepare(
  `INSERT INTO items (id, name, hsn, gst_rate, base_rate)
   VALUES (@id, @name, @hsn, @gst_rate, @base_rate)`
);
const insertRate = appDb.prepare(
  `INSERT INTO party_rates (party_id, item_id, rate)
   VALUES (@party_id, @item_id, @rate)`
);

const result = appDb.transaction(() => {
  appDb.exec('DELETE FROM party_rates;');
  appDb.exec('DELETE FROM batches;');
  appDb.exec('DELETE FROM order_items;');
  appDb.exec('DELETE FROM orders;');
  appDb.exec('DELETE FROM items;');
  appDb.exec('DELETE FROM parties;');

  const partyIds = new Set();
  partyRows.forEach((row) => {
    if (!row.name_id || !row.full_name) return;
    insertParty.run({
      id: row.name_id,
      name: row.full_name,
      phone: row.phone_number || '',
      address: row.address || '',
      gst_number: row.name_gstin_number || ''
    });
    partyIds.add(row.name_id);
  });

  const itemIds = new Set();
  itemRows.forEach((row) => {
    if (!row.item_id || !row.item_name) return;
    const taxRate = taxMap.get(row.item_tax_id) || 0;
    const baseRate =
      row.item_sale_unit_price ?? row.item_purchase_unit_price ?? 0;
    insertItem.run({
      id: row.item_id,
      name: row.item_name,
      hsn: row.item_hsn_sac_code || '',
      gst_rate: taxRate,
      base_rate: baseRate
    });
    itemIds.add(row.item_id);
  });

  let rateCount = 0;
  rateRows.forEach((row) => {
    if (!itemIds.has(row.party_item_rate_item_id)) return;
    if (!partyIds.has(row.party_item_rate_party_id)) return;
    const rate =
      row.party_item_rate_sale_price && row.party_item_rate_sale_price > 0
        ? row.party_item_rate_sale_price
        : row.party_item_rate_purchase_price || 0;
    insertRate.run({
      party_id: row.party_item_rate_party_id,
      item_id: row.party_item_rate_item_id,
      rate
    });
    rateCount += 1;
  });

  return {
    parties: partyIds.size,
    items: itemIds.size,
    partyRates: rateCount
  };
})();

tempDb.close();
fs.unlinkSync(tempPath);
appDb.close();

console.log('Import complete:', result);
console.log('DB:', dbPath);
