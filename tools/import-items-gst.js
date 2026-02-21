const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error('Usage: node tools/import-items-gst.js /path/to/dump.sql|dump.db');
  process.exit(1);
}
if (!fs.existsSync(dumpPath)) {
  console.error('Dump file not found:', dumpPath);
  process.exit(1);
}

const header = fs.readFileSync(dumpPath, { encoding: 'utf8', flag: 'r' }).slice(0, 16);
const isSqlite = header.includes('SQLite format 3');

let sourceDb;
let tempPath = null;

if (isSqlite) {
  sourceDb = new Database(dumpPath, { readonly: true });
} else {
  tempPath = path.join(os.tmpdir(), `vyapar_items_${Date.now()}.db`);
  const tempDb = new Database(tempPath);
  tempDb.pragma('foreign_keys = OFF');
  let dumpSql = fs.readFileSync(dumpPath, 'utf8');
  dumpSql = dumpSql.replace(/\u0000/g, '');

  const tables = ['kb_tax_code', 'kb_items'];
  const createStatements = [];
  const insertStatements = [];

  for (const table of tables) {
    const createMatch = dumpSql.match(
      new RegExp(`CREATE TABLE IF NOT EXISTS \\"${table}\\"[\\s\\S]*?;`, 'i')
    );
    if (createMatch) createStatements.push(createMatch[0]);
    const insertMatches = dumpSql.match(
      new RegExp(`INSERT INTO \\"${table}\\"[\\s\\S]*?;`, 'gi')
    );
    if (insertMatches) insertStatements.push(...insertMatches);
  }

  const sanitizeCreate = (stmt) => {
    const lines = stmt.split('\n').filter((line) => !line.includes('FOREIGN KEY'));
    let cleaned = lines.join('\n');
    cleaned = cleaned.replace(/,\s*\)/g, '\n)');
    return cleaned;
  };

  createStatements.forEach((stmt) => tempDb.exec(sanitizeCreate(stmt)));
  insertStatements.forEach((stmt) => tempDb.exec(stmt));
  sourceDb = tempDb;
}

const hasTax = sourceDb
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kb_tax_code'")
  .get();
const hasItems = sourceDb
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kb_items'")
  .get();

if (!hasItems) {
  console.error('kb_items table not found in dump.');
  sourceDb.close();
  if (tempPath) fs.unlinkSync(tempPath);
  process.exit(1);
}

const taxRows = hasTax ? sourceDb.prepare('SELECT tax_code_id, tax_rate FROM kb_tax_code').all() : [];
const taxMap = new Map(taxRows.map((row) => [row.tax_code_id, row.tax_rate || 0]));

const itemRows = sourceDb
  .prepare(
    `SELECT item_id, item_name, item_hsn_sac_code, item_sale_unit_price, item_purchase_unit_price, item_tax_id
     FROM kb_items`
  )
  .all();

const appDb = new Database(path.join(os.homedir(), 'Library', 'Application Support', 'vyapar-clone', 'vyapar.db'));
appDb.pragma('journal_mode = WAL');
appDb.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    hsn TEXT,
    gst_rate REAL DEFAULT 0,
    base_rate REAL DEFAULT 0,
    base_unit TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const upsert = appDb.prepare(
  `INSERT INTO items (id, name, hsn, gst_rate, base_rate)
   VALUES (@id, @name, @hsn, @gst_rate, @base_rate)
   ON CONFLICT(id) DO UPDATE SET
     name = excluded.name,
     hsn = excluded.hsn,
     gst_rate = excluded.gst_rate,
     base_rate = excluded.base_rate`
);

let count = 0;
appDb.transaction(() => {
  itemRows.forEach((row) => {
    if (!row.item_id || !row.item_name) return;
    const taxRate = taxMap.get(row.item_tax_id) || 0;
    const baseRate = row.item_sale_unit_price ?? row.item_purchase_unit_price ?? 0;
    upsert.run({
      id: row.item_id,
      name: row.item_name,
      hsn: row.item_hsn_sac_code || '',
      gst_rate: taxRate,
      base_rate: baseRate
    });
    count += 1;
  });
})();

sourceDb.close();
if (tempPath) fs.unlinkSync(tempPath);
appDb.close();

console.log('Items updated:', count);
