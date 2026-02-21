const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('Usage: node tools/import-from-sqlite.js /path/to/source.db');
  process.exit(1);
}
if (!fs.existsSync(sourcePath)) {
  console.error('Source DB not found:', sourcePath);
  process.exit(1);
}

const targetPath = path.join(os.homedir(), 'Library', 'Application Support', 'vyapar-clone', 'vyapar.db');
fs.mkdirSync(path.dirname(targetPath), { recursive: true });

const sourceDb = new Database(sourcePath, { readonly: true });
const targetDb = new Database(targetPath);

targetDb.pragma('journal_mode = WAL');
targetDb.pragma('foreign_keys = OFF');

targetDb.exec(`ATTACH DATABASE '${sourcePath.replace(/'/g, "''")}' AS src;`);

const tables = [
  'kb_firms',
  'kb_names',
  'kb_items',
  'kb_tax_code',
  'kb_party_item_rate',
  'kb_transactions',
  'kb_lineitems'
];

const result = targetDb.transaction(() => {
  tables.forEach((table) => {
    const schema = sourceDb
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!schema || !schema.sql) return;
    targetDb.exec(`DROP TABLE IF EXISTS ${table};`);
    targetDb.exec(schema.sql);
    targetDb.exec(`INSERT INTO ${table} SELECT * FROM src.${table};`);
  });

  return {
    firms: targetDb.prepare('SELECT COUNT(*) as c FROM kb_firms').get()?.c || 0,
    parties: targetDb.prepare('SELECT COUNT(*) as c FROM kb_names').get()?.c || 0,
    items: targetDb.prepare('SELECT COUNT(*) as c FROM kb_items').get()?.c || 0,
    orders: targetDb.prepare('SELECT COUNT(*) as c FROM kb_transactions').get()?.c || 0,
    orderItems: targetDb.prepare('SELECT COUNT(*) as c FROM kb_lineitems').get()?.c || 0
  };
})();

targetDb.exec('DETACH DATABASE src;');
sourceDb.close();
targetDb.close();

console.log('Import complete:', result);
console.log('Target DB:', targetPath);
