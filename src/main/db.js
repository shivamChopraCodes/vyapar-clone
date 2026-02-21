const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');
const { app } = require('electron');

let db;
let currentDbPath;

function resolveDbPath() {
  if (process.env.VYAPAR_DB_PATH && fs.existsSync(process.env.VYAPAR_DB_PATH)) {
    return process.env.VYAPAR_DB_PATH;
  }
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'vyapar.db');
  }
  return path.join(os.homedir(), 'Library', 'Application Support', 'vyapar-clone', 'vyapar.db');
}

function getDb() {
  if (db) return db;
  const dbPath = resolveDbPath();
  currentDbPath = dbPath;
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initSchema();
  return db;
}

function initSchema() {
  const schema = `
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gst_number TEXT,
      drug_license TEXT,
      address TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kb_firms (
      firm_id INTEGER PRIMARY KEY AUTOINCREMENT,
      firm_name varchar(256),
      firm_email varchar(256),
      firm_phone varchar(20),
      firm_address varchar(256),
      firm_gstin_number varchar(32) DEFAULT '',
      firm_state varchar(32) DEFAULT '',
      firm_description varchar(256) DEFAULT '',
      firm_drug_license varchar(64) DEFAULT '',
      firm_other_details TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS kb_names (
      name_id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_created datetime DEFAULT CURRENT_TIMESTAMP,
      date_modified datetime DEFAULT CURRENT_TIMESTAMP,
      full_name varchar(50),
      phone_number varchar(11),
      email varchar(50),
      amount double,
      date_remindon datetime,
      date_sendsmson datetime,
      date_ignoretill datetime,
      address varchar(2000),
      name_type integer DEFAULT 1,
      name_group_id integer DEFAULT 1,
      name_tin_number varchar(20) DEFAULT '',
      name_gstin_number varchar(32) DEFAULT '',
      name_state varchar(32) DEFAULT '',
      name_shipping_address varchar(2000) DEFAULT '',
      name_customer_type integer DEFAULT 0,
      is_party_details_sent integer DEFAULT 0,
      name_last_txn_date datetime DEFAULT null,
      name_expense_type varchar(32) DEFAULT null,
      name_verified_gstin integer DEFAULT 0,
      created_by INTEGER DEFAULT NULL,
      updated_by INTEGER DEFAULT NULL,
      pincode varchar(10) DEFAULT '',
      name_shipping_pincode varchar(10) DEFAULT '',
      credit_limit integer DEFAULT null,
      credit_limit_enabled integer DEFAULT 0,
      frequency_of_payment_reminder INTEGER DEFAULT 1,
      name_is_active INTEGER NOT NULL DEFAULT 1,
      party_billing_name VARCHAR(50) DEFAULT NULL,
      name_sub_type INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS kb_tax_code (
      tax_code_id integer PRIMARY KEY AUTOINCREMENT,
      tax_code_name varchar(32) UNIQUE,
      tax_rate double,
      tax_code_type integer DEFAULT 0,
      tax_rate_type integer DEFAULT 4,
      tax_code_date_created datetime DEFAULT CURRENT_TIMESTAMP,
      tax_code_date_modified datetime DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kb_items (
      item_id integer PRIMARY KEY AUTOINCREMENT,
      item_name varchar(256),
      item_sale_unit_price double,
      item_purchase_unit_price double,
      item_stock_quantity double DEFAULT 0,
      item_min_stock_quantity double DEFAULT 0,
      item_location varchar(256) DEFAULT '',
      item_stock_value double DEFAULT 0,
      item_date_created datetime DEFAULT CURRENT_TIMESTAMP,
      item_date_modified datetime DEFAULT CURRENT_TIMESTAMP,
      item_type integer DEFAULT 1,
      category_id integer DEFAULT 1,
      item_code varchar(32) DEFAULT null UNIQUE,
      base_unit_id integer,
      secondary_unit_id integer,
      unit_mapping_id integer,
      item_hsn_sac_code varchar(32) DEFAULT '',
      item_tax_id integer DEFAULT null,
      item_tax_type integer DEFAULT 2,
      item_additional_cess_per_unit double DEFAULT null,
      item_description varchar(256) DEFAULT '',
      item_is_active integer DEFAULT 1,
      item_tax_type_purchase integer DEFAULT 2,
      item_catalogue_status integer DEFAULT 0,
      item_catalogue_sale_unit_price double DEFAULT 0,
      item_catalogue_description varchar(256) DEFAULT '',
      item_ist_type integer DEFAULT 0,
      item_discount_type integer DEFAULT 1,
      item_discount double DEFAULT 0,
      created_by INTEGER DEFAULT NULL,
      updated_by INTEGER DEFAULT NULL,
      item_mrp double DEFAULT null,
      item_dis_on_mrp_for_sp double DEFAULT null,
      item_dis_on_mrp_for_wp double DEFAULT null,
      item_wholesale_price double DEFAULT null,
      item_min_wholesale_qty double DEFAULT null,
      item_tax_type_wholesale_price integer DEFAULT 2,
      item_catalogue_stock_status integer NOT NULL DEFAULT 1,
      service_reminder_status INTEGER DEFAULT NULL,
      service_period INTEGER DEFAULT NULL,
      icf_values VARCHAR DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS kb_party_item_rate (
      party_item_rate_id integer PRIMARY KEY AUTOINCREMENT,
      party_item_rate_item_id integer,
      party_item_rate_party_id integer,
      party_item_rate_sale_price double DEFAULT 0,
      party_item_rate_purchase_price double DEFAULT 0,
      UNIQUE(party_item_rate_item_id, party_item_rate_party_id) ON CONFLICT REPLACE
    );

    CREATE TABLE IF NOT EXISTS kb_udf_fields (
      udf_field_id integer PRIMARY KEY AUTOINCREMENT,
      udf_field_name varchar(150) DEFAULT '',
      udf_field_type integer DEFAULT 0,
      udf_field_data_type integer DEFAULT 0,
      udf_field_data_format integer DEFAULT 0,
      udf_print_on_invoice integer DEFAULT 0,
      udf_txn_type integer DEFAULT 0,
      udf_field_no integer DEFAULT 0,
      udf_field_status integer DEFAULT 0,
      udf_firm_id integer DEFAULT null,
      UNIQUE(udf_firm_id, udf_field_type, udf_txn_type, udf_field_no)
    );

    CREATE TABLE IF NOT EXISTS kb_udf_values (
      udf_value_id integer PRIMARY KEY AUTOINCREMENT,
      udf_value_field_id integer,
      udf_ref_id integer DEFAULT 0,
      udf_value varchar(150) DEFAULT '',
      udf_value_field_type integer DEFAULT 0,
      UNIQUE(udf_value_field_id, udf_ref_id)
    );

    CREATE TABLE IF NOT EXISTS kb_transactions (
      txn_id integer PRIMARY KEY AUTOINCREMENT,
      txn_date_created datetime DEFAULT CURRENT_TIMESTAMP,
      txn_date_modified datetime DEFAULT CURRENT_TIMESTAMP,
      txn_name_id INTEGER,
      txn_cash_amount double,
      txn_balance_amount double,
      txn_type INTEGER,
      txn_date date,
      txn_discount_percent double,
      txn_tax_percent double,
      txn_discount_amount double,
      txn_tax_amount double,
      txn_due_date date,
      txn_description varchar(1024),
      txn_image_path varchar(256),
      txn_payment_type_id INTEGER DEFAULT 1,
      txn_payment_reference varchar(50) DEFAULT '',
      txn_ref_number_char varchar(50) DEFAULT '',
      txn_status INTEGER DEFAULT 1,
      txn_ac1_amount double DEFAULT 0,
      txn_ac2_amount double DEFAULT 0,
      txn_ac3_amount double DEFAULT 0,
      txn_firm_id INTEGER DEFAULT null,
      txn_sub_type INTEGER DEFAULT 0,
      txn_invoice_prefix varchar(10) DEFAULT null,
      txn_image_id INTEGER DEFAULT null,
      txn_tax_id INTEGER DEFAULT null,
      txn_custom_field TEXT DEFAULT '',
      txn_display_name varchar(256) DEFAULT '',
      txn_reverse_charge INTEGER DEFAULT 0,
      txn_place_of_supply varchar(256) DEFAULT '',
      txn_round_off_amount double DEFAULT 0,
      txn_itc_applicable INTEGER DEFAULT 0,
      txn_po_date date DEFAULT null,
      txn_po_ref_number varchar(50) DEFAULT '',
      txn_return_date datetime DEFAULT null,
      txn_return_ref_number varchar(50) DEFAULT '',
      txn_eway_bill_number varchar(50) DEFAULT '',
      txn_current_balance double DEFAULT 0,
      txn_payment_status INTEGER DEFAULT 1,
      txn_payment_term_id INTEGER DEFAULT null,
      txn_prefix_id INTEGER DEFAULT null,
      txn_tax_inclusive INTEGER DEFAULT 2,
      txn_billing_address TEXT DEFAULT '',
      txn_shipping_address TEXT DEFAULT '',
      txn_eway_bill_api_generated INTEGER DEFAULT 0,
      txn_eway_bill_generated_date DATETIME DEFAULT NULL,
      txn_category_id INTEGER DEFAULT null,
      txn_time INTEGER NOT NULL DEFAULT 0,
      txn_online_order_id varchar(50) DEFAULT null
    );

    CREATE TABLE IF NOT EXISTS kb_lineitems (
      lineitem_id integer PRIMARY KEY AUTOINCREMENT,
      lineitem_txn_id integer,
      item_id integer,
      quantity double,
      priceperunit double,
      total_amount double,
      lineitem_tax_amount double DEFAULT 0,
      lineitem_discount_amount double DEFAULT 0,
      lineitem_unit_id integer,
      lineitem_unit_mapping_id integer,
      lineitem_tax_id integer DEFAULT null,
      lineitem_mrp double DEFAULT null,
      lineitem_batch_number varchar(30) DEFAULT '',
      lineitem_expiry_date datetime DEFAULT null,
      lineitem_manufacturing_date datetime DEFAULT null,
      lineitem_serial_number varchar(30) DEFAULT '',
      lineitem_count double DEFAULT null,
      lineitem_description varchar(100) DEFAULT '',
      lineitem_additional_cess double DEFAULT null,
      lineitem_total_amount_edited INTEGER DEFAULT 0,
      lineitem_itc_applicable INTEGER DEFAULT 0,
      lineitem_ist_id INTEGER DEFAULT null,
      lineitem_size varchar(100) DEFAULT '',
      lineitem_free_quantity double DEFAULT 0,
      lineitem_discount_percent double DEFAULT 0,
      lineitem_is_serialized INTEGER DEFAULT 0,
      lineitem_fa_cost_price double DEFAULT 0,
      lineitem_discount_type INTEGER DEFAULT 0,
      lineitem_ref_id varchar(10),
      lineitem_txn_po_ref_number VARCHAR(50) DEFAULT NULL,
      icf_values VARCHAR DEFAULT NULL
    );
  `;
  db.exec(schema);
  ensureFirmColumns();
  backfillPlaceOfSupplyFromPartyState();
}

function ensureFirmColumns() {
  const columns = db.prepare("PRAGMA table_info('kb_firms')").all();
  const hasDrug = columns.some((column) => column.name === 'firm_drug_license');
  const hasOther = columns.some((column) => column.name === 'firm_other_details');
  const hasState = columns.some((column) => column.name === 'firm_state');
  if (!hasDrug) {
    db.exec('ALTER TABLE kb_firms ADD COLUMN firm_drug_license varchar(64) DEFAULT \"\"');
  }
  if (!hasOther) {
    db.exec('ALTER TABLE kb_firms ADD COLUMN firm_other_details TEXT DEFAULT \"\"');
  }
  if (!hasState) {
    db.exec('ALTER TABLE kb_firms ADD COLUMN firm_state varchar(32) DEFAULT \"\"');
  }
}

function backfillPlaceOfSupplyFromPartyState() {
  const hasNames = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kb_names'")
    .get();
  const hasTransactions = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kb_transactions'")
    .get();
  if (!hasNames || !hasTransactions) return;

  db.prepare(
    `UPDATE kb_transactions
     SET txn_place_of_supply = (
       SELECT COALESCE(n.name_state, '')
       FROM kb_names n
       WHERE n.name_id = kb_transactions.txn_name_id
     )
     WHERE COALESCE(TRIM(txn_place_of_supply), '') = ''
       AND COALESCE(TRIM((SELECT name_state FROM kb_names n WHERE n.name_id = kb_transactions.txn_name_id)), '') <> ''`
  ).run();
}

function listCompanies() {
  return getDb()
    .prepare(
      `SELECT firm_id as id,
              firm_name as name,
              firm_gstin_number as gst_number,
              firm_state as state,
              firm_drug_license as drug_license,
              firm_address as address,
              firm_phone as phone,
              firm_email as email,
              firm_other_details as other_details
       FROM kb_firms
       ORDER BY firm_id DESC`
    )
    .all();
}

function upsertCompany(data) {
  const stmt = getDb().prepare(
    `INSERT INTO kb_firms (firm_name, firm_gstin_number, firm_state, firm_drug_license, firm_address, firm_phone, firm_other_details)
     VALUES (@name, @gst_number, @state, @drug_license, @address, @phone, @other_details)`
  );
  const info = stmt.run(data);
  return getDb()
    .prepare(
      `SELECT firm_id as id,
              firm_name as name,
              firm_gstin_number as gst_number,
              firm_state as state,
              firm_drug_license as drug_license,
              firm_address as address,
              firm_phone as phone,
              firm_email as email,
              firm_other_details as other_details
       FROM kb_firms WHERE firm_id = ?`
    )
    .get(info.lastInsertRowid);
}

function listParties() {
  const rows = getDb()
    .prepare(
      `SELECT name_id as id,
              full_name as name,
              phone_number as phone,
              address,
              name_gstin_number as gst_number,
              name_tin_number as tin_number,
              name_state as state_of_supply
       FROM kb_names
       WHERE name_is_active = 1
       ORDER BY name_id DESC`
    )
    .all();

  const db = getDb();
  const hasUdfFields = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kb_udf_fields'")
    .get();
  const hasUdfValues = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kb_udf_values'")
    .get();
  if (!hasUdfFields || !hasUdfValues) {
    return rows.map((row) => ({
      ...row,
      dl_number: row.tin_number || '',
      extra_properties: {}
    }));
  }

  const customRows = db
    .prepare(
      `SELECT v.udf_ref_id as party_id,
              TRIM(COALESCE(f.udf_field_name, '')) as field_name,
              TRIM(COALESCE(v.udf_value, '')) as field_value
       FROM kb_udf_values v
       JOIN kb_udf_fields f ON f.udf_field_id = v.udf_value_field_id
       WHERE COALESCE(v.udf_value_field_type, f.udf_field_type) = 2
         AND TRIM(COALESCE(v.udf_value, '')) <> ''`
    )
    .all();

  const propertyMap = new Map();
  customRows.forEach((row) => {
    const partyKey = String(row.party_id || '');
    if (!partyKey) return;
    const key = row.field_name || 'Custom Field';
    const value = row.field_value || '';
    if (!value) return;
    if (!propertyMap.has(partyKey)) propertyMap.set(partyKey, new Map());
    const fieldMap = propertyMap.get(partyKey);
    if (!fieldMap.has(key)) fieldMap.set(key, new Set());
    fieldMap.get(key).add(value);
  });

  return rows.map((row) => {
    const fieldMap = propertyMap.get(String(row.id)) || new Map();
    const extra_properties = {};
    Array.from(fieldMap.entries()).forEach(([key, values]) => {
      const merged = Array.from(values).join(', ');
      if (merged) extra_properties[key] = merged;
    });

    let dlNumber = row.tin_number || '';
    if (!dlNumber) {
      const dlEntry = Object.entries(extra_properties).find(([key]) =>
        /(^|[^a-z])d\.?\s*l\.?\s*no([^a-z]|$)/i.test(key)
      );
      if (dlEntry) dlNumber = dlEntry[1];
    }

    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      gst_number: row.gst_number,
      state_of_supply: row.state_of_supply,
      tin_number: row.tin_number || '',
      dl_number: dlNumber,
      extra_properties
    };
  });
}

function upsertParty(data) {
  const stmt = getDb().prepare(
    `INSERT INTO kb_names (full_name, phone_number, address, name_gstin_number, name_state, name_type, name_is_active)
     VALUES (@name, @phone, @address, @gst_number, @state_of_supply, 1, 1)`
  );
  const info = stmt.run(data);
  const row = getDb()
    .prepare(
      `SELECT name_id as id,
              full_name as name,
              phone_number as phone,
              address,
              name_gstin_number as gst_number,
              name_tin_number as tin_number,
              name_state as state_of_supply
       FROM kb_names WHERE name_id = ?`
    )
    .get(info.lastInsertRowid);
  if (!row) return null;
  return {
    ...row,
    dl_number: row.tin_number || '',
    extra_properties: {}
  };
}

function listItems() {
  return getDb()
    .prepare(
      `SELECT i.item_id as id,
              i.item_name as name,
              i.item_hsn_sac_code as hsn,
              COALESCE(t.tax_rate, 0) as gst_rate,
              COALESCE(i.item_sale_unit_price, i.item_purchase_unit_price, 0) as base_rate,
              i.base_unit_id,
              COALESCE(u.unit_short_name, u.unit_name, '') as base_unit
       FROM kb_items i
       LEFT JOIN kb_tax_code t ON t.tax_code_id = i.item_tax_id
       LEFT JOIN kb_item_units u ON u.unit_id = i.base_unit_id
       ORDER BY i.item_id DESC`
    )
    .all();
}

function listUnits() {
  return getDb()
    .prepare(
      `SELECT unit_id as id,
              unit_name as name,
              unit_short_name as short_name
       FROM kb_item_units
       ORDER BY unit_name ASC, unit_id ASC`
    )
    .all();
}

function listTaxCodes() {
  return getDb()
    .prepare(
      `SELECT tax_code_id as id,
              tax_code_name as name,
              COALESCE(tax_rate, 0) as rate
       FROM kb_tax_code
       ORDER BY rate ASC, id ASC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name || '',
      rate: Number(row.rate || 0)
    }));
}

function upsertItem(data) {
  const db = getDb();
  let taxId = null;
  if (data.gst_rate && Number(data.gst_rate) > 0) {
    const existing = db
      .prepare('SELECT tax_code_id FROM kb_tax_code WHERE tax_rate = ? LIMIT 1')
      .get(Number(data.gst_rate));
    if (existing) {
      taxId = existing.tax_code_id;
    } else {
      const info = db
        .prepare(
          `INSERT INTO kb_tax_code (tax_code_name, tax_rate)
           VALUES (@name, @rate)`
        )
        .run({ name: `GST@${Number(data.gst_rate)}%`, rate: Number(data.gst_rate) });
      taxId = info.lastInsertRowid;
    }
  }

  const stmt = db.prepare(
    `INSERT INTO kb_items (item_name, item_hsn_sac_code, item_sale_unit_price, item_purchase_unit_price, item_tax_id)
     VALUES (@name, @hsn, @base_rate, @base_rate, @tax_id)`
  );
  const info = stmt.run({
    name: data.name,
    hsn: data.hsn || '',
    base_rate: Number(data.base_rate || 0),
    tax_id: taxId
  });
  return db
    .prepare(
      `SELECT i.item_id as id,
              i.item_name as name,
              i.item_hsn_sac_code as hsn,
              COALESCE(t.tax_rate, 0) as gst_rate,
              COALESCE(i.item_sale_unit_price, i.item_purchase_unit_price, 0) as base_rate,
              i.base_unit_id,
              COALESCE(u.unit_short_name, u.unit_name, '') as base_unit
       FROM kb_items i
       LEFT JOIN kb_tax_code t ON t.tax_code_id = i.item_tax_id
       LEFT JOIN kb_item_units u ON u.unit_id = i.base_unit_id
       WHERE i.item_id = ?`
    )
    .get(info.lastInsertRowid);
}

function listBatches(itemId) {
  return getDb()
    .prepare('SELECT * FROM kb_lineitems WHERE item_id = ? ORDER BY lineitem_id DESC')
    .all(itemId)
    .map((row) => ({
      id: row.lineitem_id,
      item_id: row.item_id,
      batch_no: row.lineitem_batch_number,
      expiry_date: row.lineitem_expiry_date,
      mrp: row.lineitem_mrp || 0,
      rate: row.priceperunit || 0,
      qty: row.quantity || 0
    }));
}

function upsertBatch(_data) {
  throw new Error('Batch updates are not supported for the Vyapar schema yet.');
}

function listPartyRates(partyId) {
  return getDb()
    .prepare(
      `SELECT pr.party_item_rate_id as id,
              pr.party_item_rate_sale_price as rate,
              i.item_name as item_name,
              i.item_hsn_sac_code as hsn,
              COALESCE(t.tax_rate, 0) as gst_rate,
              i.item_id as item_id
       FROM kb_party_item_rate pr
       JOIN kb_items i ON i.item_id = pr.party_item_rate_item_id
       LEFT JOIN kb_tax_code t ON t.tax_code_id = i.item_tax_id
       WHERE pr.party_item_rate_party_id = ?
       ORDER BY i.item_name ASC`
    )
    .all(partyId);
}

function upsertPartyRate(data) {
  const stmt = getDb().prepare(
    `INSERT INTO kb_party_item_rate (party_item_rate_party_id, party_item_rate_item_id, party_item_rate_sale_price)
     VALUES (@party_id, @item_id, @rate)
     ON CONFLICT(party_item_rate_item_id, party_item_rate_party_id)
     DO UPDATE SET party_item_rate_sale_price = excluded.party_item_rate_sale_price`
  );
  stmt.run({
    party_id: data.party_id,
    item_id: data.item_id,
    rate: Number(data.rate || 0)
  });
  return listPartyRates(data.party_id);
}

function listOrders() {
  return getDb()
    .prepare(
      `SELECT t.txn_id as id,
              t.txn_type,
              t.txn_date as order_date,
              t.txn_description as notes,
              t.txn_name_id as party_id,
              t.txn_ref_number_char as ref_number,
              t.txn_invoice_prefix as invoice_prefix,
              t.txn_place_of_supply as place_of_supply,
              n.full_name as party_name,
              COALESCE(t.txn_cash_amount, 0) as paid_amount,
              COALESCE(t.txn_balance_amount, 0) as outstanding_amount,
              COALESCE(t.txn_round_off_amount, 0) as round_off_amount,
              COALESCE(t.txn_tax_amount, 0) as tax_amount,
              COALESCE(t.txn_discount_amount, 0) as discount_amount,
              (COALESCE(t.txn_cash_amount, 0) + COALESCE(t.txn_balance_amount, 0) + COALESCE(t.txn_round_off_amount, 0)) as header_total
       FROM kb_transactions t
       LEFT JOIN kb_names n ON n.name_id = t.txn_name_id
       WHERE t.txn_type IN (1, 3)
       ORDER BY t.txn_id DESC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      order_type: row.txn_type === 1 ? 'sale' : 'purchase',
      party_id: row.party_id,
      party_name: row.party_name,
      order_date: row.order_date,
      notes: row.notes,
      place_of_supply: row.place_of_supply || '',
      ref_number: row.ref_number,
      invoice_prefix: row.invoice_prefix,
      paid_amount: Number(row.paid_amount || 0),
      outstanding_amount: Number(row.outstanding_amount || 0),
      round_off_amount: Number(row.round_off_amount || 0),
      tax_amount: Number(row.tax_amount || 0),
      discount_amount: Number(row.discount_amount || 0),
      header_total: Number(row.header_total || 0)
    }));
}

function getOrder(orderId) {
  const row = getDb()
    .prepare(
      `SELECT t.txn_id as id,
              t.txn_type,
              t.txn_date as order_date,
              t.txn_description as notes,
              t.txn_name_id as party_id,
              t.txn_ref_number_char as ref_number,
              t.txn_place_of_supply as place_of_supply,
              COALESCE(t.txn_balance_amount, 0) as balance_amount
       FROM kb_transactions t
       WHERE t.txn_id = ?`
    )
    .get(orderId);
  if (!row) return null;
  return {
    id: row.id,
    order_type: row.txn_type === 1 ? 'sale' : 'purchase',
    party_id: row.party_id,
    order_date: row.order_date,
    notes: row.notes,
    ref_number: row.ref_number || '',
    place_of_supply: row.place_of_supply || '',
    balance_amount: Number(row.balance_amount || 0)
  };
}

function listOrderItems(orderId) {
  return getDb()
    .prepare(
      `SELECT l.lineitem_id as id,
              l.item_id,
              i.item_name as item_name,
              l.quantity as qty,
              l.priceperunit as rate,
              l.total_amount as line_total,
              COALESCE(t.tax_rate, 0) as gst_rate,
              l.lineitem_batch_number as batch_no,
              l.lineitem_expiry_date as expiry_date,
              COALESCE(NULLIF(l.lineitem_mrp, 0), i.item_mrp, 0) as mrp,
              COALESCE(l.lineitem_unit_id, i.base_unit_id) as unit_id,
              COALESCE(lu.unit_short_name, lu.unit_name, bu.unit_short_name, bu.unit_name, '') as unit
       FROM kb_lineitems l
       LEFT JOIN kb_items i ON i.item_id = l.item_id
       LEFT JOIN kb_tax_code t ON t.tax_code_id = l.lineitem_tax_id
       LEFT JOIN kb_item_units lu ON lu.unit_id = l.lineitem_unit_id
       LEFT JOIN kb_item_units bu ON bu.unit_id = i.base_unit_id
       WHERE l.lineitem_txn_id = ?
       ORDER BY l.lineitem_id ASC`
    )
    .all(orderId);
}

function updateOrder(orderId, order) {
  const db = getDb();
  const txnType = order.order_type === 'purchase' ? 3 : 1;

  const updateOrderStmt = db.prepare(
    `UPDATE kb_transactions
     SET txn_type = @txn_type,
         txn_name_id = @txn_name_id,
         txn_date = @txn_date,
         txn_ref_number_char = @txn_ref_number_char,
         txn_description = @txn_description,
         txn_place_of_supply = @txn_place_of_supply,
         txn_cash_amount = @txn_cash_amount,
         txn_balance_amount = @txn_balance_amount
     WHERE txn_id = @txn_id`
  );
  const deleteLines = db.prepare('DELETE FROM kb_lineitems WHERE lineitem_txn_id = ?');
  const insertLine = db.prepare(
    `INSERT INTO kb_lineitems (
        lineitem_txn_id,
        item_id,
        quantity,
        priceperunit,
        total_amount,
        lineitem_tax_id,
        lineitem_unit_id,
        lineitem_batch_number,
        lineitem_expiry_date,
        lineitem_mrp
     )
     VALUES (
        @lineitem_txn_id,
        @item_id,
        @quantity,
        @priceperunit,
        @total_amount,
        @lineitem_tax_id,
        @lineitem_unit_id,
        @lineitem_batch_number,
        @lineitem_expiry_date,
        @lineitem_mrp
     )`
  );

  const trx = db.transaction((payload) => {
    const invoiceTotal = (payload.items || []).reduce((sum, item) => {
      const qty = Number(item.qty || 0);
      const rate = Number(item.rate || 0);
      const gstRate = Number(item.gst_rate || 0);
      const baseAmount = qty * rate;
      return sum + baseAmount * (1 + gstRate / 100);
    }, 0);
    const requestedBalanceRaw = Number(payload.balance_amount || 0);
    const requestedBalance = Number.isFinite(requestedBalanceRaw) ? requestedBalanceRaw : 0;
    const clampedBalance = Math.min(Math.max(requestedBalance, 0), invoiceTotal);
    const cashAmount = invoiceTotal - clampedBalance;
    const partyState =
      payload.party_id !== undefined && payload.party_id !== null
        ? (
            db.prepare('SELECT name_state FROM kb_names WHERE name_id = ?').get(payload.party_id) || {}
          ).name_state
        : '';
    const placeOfSupply = payload.place_of_supply || partyState || '';

    updateOrderStmt.run({
      txn_id: orderId,
      txn_type: txnType,
      txn_name_id: payload.party_id || null,
      txn_date: payload.order_date,
      txn_ref_number_char: payload.invoice_no || '',
      txn_description: payload.notes || '',
      txn_place_of_supply: placeOfSupply,
      txn_cash_amount: cashAmount,
      txn_balance_amount: clampedBalance
    });

    deleteLines.run(orderId);

    payload.items.forEach((item) => {
      let taxId = null;
      if (item.gst_rate !== undefined && item.gst_rate !== null) {
        const rate = Number(item.gst_rate || 0);
        if (rate > 0) {
          const existing = db
            .prepare('SELECT tax_code_id FROM kb_tax_code WHERE tax_rate = ? LIMIT 1')
            .get(rate);
          if (existing) {
            taxId = existing.tax_code_id;
          } else {
            const name = `GST@${rate}%`;
            const info = db
              .prepare(
                `INSERT INTO kb_tax_code (tax_code_name, tax_rate, tax_code_type, tax_rate_type)
                 VALUES (?, ?, 0, 4)`
              )
              .run(name, rate);
            taxId = info.lastInsertRowid;
          }
        }
      }
      if (taxId === null) {
        const tax = db
          .prepare('SELECT item_tax_id FROM kb_items WHERE item_id = ?')
          .get(item.item_id);
        taxId = tax ? tax.item_tax_id : null;
      }
      const resolvedUnitId =
        item.unit_id !== undefined && item.unit_id !== null
          ? Number(item.unit_id)
          : (
              db.prepare('SELECT base_unit_id FROM kb_items WHERE item_id = ?').get(item.item_id) || {}
            ).base_unit_id;
      insertLine.run({
        lineitem_txn_id: orderId,
        item_id: item.item_id,
        quantity: item.qty,
        priceperunit: item.rate,
        total_amount: item.qty * item.rate,
        lineitem_tax_id: taxId,
        lineitem_unit_id: Number.isFinite(Number(resolvedUnitId)) ? Number(resolvedUnitId) : null,
        lineitem_batch_number: item.batch_no || null,
        lineitem_expiry_date: item.expiry_date || null,
        lineitem_mrp: item.mrp !== undefined && item.mrp !== null ? Number(item.mrp || 0) : null
      });
    });

    return orderId;
  });

  return trx(order);
}

function createOrder(order) {
  const db = getDb();
  const txnType = order.order_type === 'purchase' ? 3 : 1;

  const insertOrder = db.prepare(
    `INSERT INTO kb_transactions (
        txn_type, txn_name_id, txn_date, txn_ref_number_char, txn_description,
        txn_place_of_supply,
        txn_status, txn_payment_status, txn_tax_inclusive, txn_time,
        txn_cash_amount, txn_balance_amount
     )
     VALUES (
        @txn_type, @txn_name_id, @txn_date, @txn_ref_number_char, @txn_description,
        @txn_place_of_supply,
        1, 1, 2, @txn_time,
        @txn_cash_amount, @txn_balance_amount
     )`
  );
  const insertLine = db.prepare(
    `INSERT INTO kb_lineitems (
        lineitem_txn_id,
        item_id,
        quantity,
        priceperunit,
        total_amount,
        lineitem_tax_id,
        lineitem_unit_id,
        lineitem_batch_number,
        lineitem_expiry_date,
        lineitem_mrp
     )
     VALUES (
        @lineitem_txn_id,
        @item_id,
        @quantity,
        @priceperunit,
        @total_amount,
        @lineitem_tax_id,
        @lineitem_unit_id,
        @lineitem_batch_number,
        @lineitem_expiry_date,
        @lineitem_mrp
     )`
  );

  const trx = db.transaction((payload) => {
    const invoiceTotal = (payload.items || []).reduce((sum, item) => {
      const qty = Number(item.qty || 0);
      const rate = Number(item.rate || 0);
      const gstRate = Number(item.gst_rate || 0);
      const baseAmount = qty * rate;
      return sum + baseAmount * (1 + gstRate / 100);
    }, 0);
    const requestedBalanceRaw = Number(payload.balance_amount || 0);
    const requestedBalance = Number.isFinite(requestedBalanceRaw) ? requestedBalanceRaw : 0;
    const clampedBalance = Math.min(Math.max(requestedBalance, 0), invoiceTotal);
    const cashAmount = invoiceTotal - clampedBalance;
    const partyState =
      payload.party_id !== undefined && payload.party_id !== null
        ? (
            db.prepare('SELECT name_state FROM kb_names WHERE name_id = ?').get(payload.party_id) || {}
          ).name_state
        : '';
    const placeOfSupply = payload.place_of_supply || partyState || '';

    const info = insertOrder.run({
      txn_type: txnType,
      txn_name_id: payload.party_id || null,
      txn_date: payload.order_date,
      txn_ref_number_char: payload.invoice_no || '',
      txn_description: payload.notes || '',
      txn_place_of_supply: placeOfSupply,
      txn_time: 0,
      txn_cash_amount: cashAmount,
      txn_balance_amount: clampedBalance
    });
    const orderId = info.lastInsertRowid;

    payload.items.forEach((item) => {
      const tax = db
        .prepare('SELECT item_tax_id FROM kb_items WHERE item_id = ?')
        .get(item.item_id);
      const resolvedUnitId =
        item.unit_id !== undefined && item.unit_id !== null
          ? Number(item.unit_id)
          : (db.prepare('SELECT base_unit_id FROM kb_items WHERE item_id = ?').get(item.item_id) || {})
              .base_unit_id;
      insertLine.run({
        lineitem_txn_id: orderId,
        item_id: item.item_id,
        quantity: item.qty,
        priceperunit: item.rate,
        total_amount: item.qty * item.rate,
        lineitem_tax_id: tax ? tax.item_tax_id : null,
        lineitem_unit_id: Number.isFinite(Number(resolvedUnitId)) ? Number(resolvedUnitId) : null,
        lineitem_batch_number: item.batch_no || null,
        lineitem_expiry_date: item.expiry_date || null,
        lineitem_mrp: item.mrp !== undefined && item.mrp !== null ? Number(item.mrp || 0) : null
      });
    });

    return orderId;
  });

  const orderId = trx(order);
  return db
    .prepare('SELECT txn_id as id, txn_type, txn_date as order_date, txn_description as notes FROM kb_transactions WHERE txn_id = ?')
    .get(orderId);
}

function importFromVyaparDump(dumpPath) {
  if (!dumpPath || !fs.existsSync(dumpPath)) {
    throw new Error('Dump file not found');
  }

  const tempPath = path.join(os.tmpdir(), `vyapar_import_${Date.now()}.db`);
  const tempDb = new Database(tempPath);
  tempDb.pragma('foreign_keys = OFF');
  const dumpSql = fs.readFileSync(dumpPath, 'utf8');

  const tables = ['kb_tax_code', 'kb_items', 'kb_names', 'kb_party_item_rate', 'kb_udf_fields', 'kb_udf_values'];
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
      `SELECT name_id, full_name, phone_number, address, name_gstin_number, name_state
       FROM kb_names`
    )
    .all();

  const rateRows = tempDb
    .prepare(
      `SELECT party_item_rate_item_id, party_item_rate_party_id, party_item_rate_sale_price, party_item_rate_purchase_price
       FROM kb_party_item_rate`
    )
    .all();

  const tempTables = tempDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => row.name);
  const udfFieldRows = tempTables.includes('kb_udf_fields')
    ? tempDb
        .prepare(
          `SELECT udf_field_id, udf_field_name, udf_field_type, udf_field_data_type, udf_field_data_format,
                  udf_print_on_invoice, udf_txn_type, udf_field_no, udf_field_status, udf_firm_id
           FROM kb_udf_fields`
        )
        .all()
    : [];
  const udfValueRows = tempTables.includes('kb_udf_values')
    ? tempDb
        .prepare(
          `SELECT udf_value_id, udf_value_field_id, udf_ref_id, udf_value, udf_value_field_type
           FROM kb_udf_values`
        )
        .all()
    : [];

  const db = getDb();
  const insertParty = db.prepare(
    `INSERT INTO kb_names (name_id, full_name, phone_number, address, name_gstin_number, name_state, name_type, name_is_active)
     VALUES (@id, @name, @phone, @address, @gst_number, @state_of_supply, 1, 1)`
  );
  const insertItem = db.prepare(
    `INSERT INTO kb_items (item_id, item_name, item_hsn_sac_code, item_sale_unit_price, item_purchase_unit_price, item_tax_id)
     VALUES (@id, @name, @hsn, @base_rate, @base_rate, @tax_id)`
  );
  const insertRate = db.prepare(
    `INSERT INTO kb_party_item_rate (party_item_rate_party_id, party_item_rate_item_id, party_item_rate_sale_price, party_item_rate_purchase_price)
     VALUES (@party_id, @item_id, @sale_rate, @purchase_rate)`
  );
  const insertUdfField = db.prepare(
    `INSERT INTO kb_udf_fields (
        udf_field_id, udf_field_name, udf_field_type, udf_field_data_type, udf_field_data_format,
        udf_print_on_invoice, udf_txn_type, udf_field_no, udf_field_status, udf_firm_id
     )
     VALUES (
        @udf_field_id, @udf_field_name, @udf_field_type, @udf_field_data_type, @udf_field_data_format,
        @udf_print_on_invoice, @udf_txn_type, @udf_field_no, @udf_field_status, @udf_firm_id
     )`
  );
  const insertUdfValue = db.prepare(
    `INSERT INTO kb_udf_values (udf_value_id, udf_value_field_id, udf_ref_id, udf_value, udf_value_field_type)
     VALUES (@udf_value_id, @udf_value_field_id, @udf_ref_id, @udf_value, @udf_value_field_type)`
  );

  const result = db.transaction(() => {
    db.exec('DELETE FROM kb_party_item_rate;');
    db.exec('DELETE FROM kb_udf_values;');
    db.exec('DELETE FROM kb_udf_fields;');
    db.exec('DELETE FROM kb_items;');
    db.exec('DELETE FROM kb_names;');

    const partyIds = new Set();
    partyRows.forEach((row) => {
      if (!row.name_id || !row.full_name) return;
      insertParty.run({
        id: row.name_id,
        name: row.full_name,
        phone: row.phone_number || '',
        address: row.address || '',
        gst_number: row.name_gstin_number || '',
        state_of_supply: row.name_state || ''
      });
      partyIds.add(row.name_id);
    });

    const itemIds = new Set();
    itemRows.forEach((row) => {
      if (!row.item_id || !row.item_name) return;
      const taxRate = taxMap.get(row.item_tax_id) || 0;
      let taxId = null;
      if (taxRate > 0) {
        const existing = db
          .prepare('SELECT tax_code_id FROM kb_tax_code WHERE tax_rate = ? LIMIT 1')
          .get(taxRate);
        if (existing) {
          taxId = existing.tax_code_id;
        } else {
          const info = db
            .prepare(
              `INSERT INTO kb_tax_code (tax_code_name, tax_rate)
               VALUES (@name, @rate)`
            )
            .run({ name: `GST@${taxRate}%`, rate: taxRate });
          taxId = info.lastInsertRowid;
        }
      }

      const baseRate = row.item_sale_unit_price ?? row.item_purchase_unit_price ?? 0;
      insertItem.run({
        id: row.item_id,
        name: row.item_name,
        hsn: row.item_hsn_sac_code || '',
        base_rate: baseRate,
        tax_id: taxId
      });
      itemIds.add(row.item_id);
    });

    let rateCount = 0;
    rateRows.forEach((row) => {
      if (!itemIds.has(row.party_item_rate_item_id)) return;
      if (!partyIds.has(row.party_item_rate_party_id)) return;
      insertRate.run({
        party_id: row.party_item_rate_party_id,
        item_id: row.party_item_rate_item_id,
        sale_rate: row.party_item_rate_sale_price || 0,
        purchase_rate: row.party_item_rate_purchase_price || 0
      });
      rateCount += 1;
    });

    udfFieldRows.forEach((row) => {
      insertUdfField.run({
        udf_field_id: row.udf_field_id,
        udf_field_name: row.udf_field_name || '',
        udf_field_type: row.udf_field_type || 0,
        udf_field_data_type: row.udf_field_data_type || 0,
        udf_field_data_format: row.udf_field_data_format || 0,
        udf_print_on_invoice: row.udf_print_on_invoice || 0,
        udf_txn_type: row.udf_txn_type || 0,
        udf_field_no: row.udf_field_no || 0,
        udf_field_status: row.udf_field_status || 0,
        udf_firm_id: row.udf_firm_id || null
      });
    });

    let udfCount = 0;
    udfValueRows.forEach((row) => {
      insertUdfValue.run({
        udf_value_id: row.udf_value_id,
        udf_value_field_id: row.udf_value_field_id,
        udf_ref_id: row.udf_ref_id || 0,
        udf_value: row.udf_value || '',
        udf_value_field_type: row.udf_value_field_type || 0
      });
      udfCount += 1;
    });

    return {
      parties: partyIds.size,
      items: itemIds.size,
      partyRates: rateCount,
      partyCustomValues: udfCount
    };
  })();

  tempDb.close();
  fs.unlinkSync(tempPath);
  return result;
}

function importFromVyaparSqlite(sqlitePath) {
  if (!sqlitePath || !fs.existsSync(sqlitePath)) {
    throw new Error('SQLite file not found');
  }

  const sourceDb = new Database(sqlitePath, { readonly: true });
  const targetDb = getDb();

  const tables = [
    'kb_firms',
    'kb_names',
    'kb_items',
    'kb_tax_code',
    'kb_party_item_rate',
    'kb_transactions',
    'kb_lineitems'
  ];

  const safePath = sqlitePath.replace(/'/g, "''");
  const result = targetDb.transaction(() => {
    targetDb.exec(`ATTACH DATABASE '${safePath}' AS src;`);
    tables.forEach((table) => {
      const schema = sourceDb
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      if (!schema || !schema.sql) return;
      targetDb.exec(`DROP TABLE IF EXISTS ${table};`);
      targetDb.exec(schema.sql);
      targetDb.exec(`INSERT INTO ${table} SELECT * FROM src.${table};`);
    });
    targetDb.exec('DETACH DATABASE src;');

    return {
      firms: targetDb.prepare('SELECT COUNT(*) as c FROM kb_firms').get()?.c || 0,
      parties: targetDb.prepare('SELECT COUNT(*) as c FROM kb_names').get()?.c || 0,
      items: targetDb.prepare('SELECT COUNT(*) as c FROM kb_items').get()?.c || 0,
      orders: targetDb.prepare('SELECT COUNT(*) as c FROM kb_transactions').get()?.c || 0,
      orderItems: targetDb.prepare('SELECT COUNT(*) as c FROM kb_lineitems').get()?.c || 0
    };
  })();

  sourceDb.close();
  return result;
}

function getDbInfo() {
  const db = getDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => row.name);
  const hasTransactions = tables.includes('kb_transactions');
  const ordersCount = hasTransactions
    ? db.prepare('SELECT COUNT(*) as c FROM kb_transactions').get().c
    : 0;
  return { path: currentDbPath, tablesCount: tables.length, hasTransactions, ordersCount };
}

function getOrdersDiagnostics() {
  const db = getDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => row.name);
  const hasTransactions = tables.includes('kb_transactions');
  const hasNames = tables.includes('kb_names');
  if (!hasTransactions) {
    return { error: 'kb_transactions not found', tablesCount: tables.length };
  }
  const total = db.prepare('SELECT COUNT(*) as c FROM kb_transactions').get().c;
  const byType = db.prepare('SELECT txn_type, COUNT(*) as c FROM kb_transactions GROUP BY txn_type ORDER BY txn_type').all();
  const sample = db
    .prepare(
      `SELECT t.txn_id, t.txn_type, t.txn_date, t.txn_description, t.txn_name_id
       FROM kb_transactions t
       ORDER BY t.txn_id DESC LIMIT 5`
    )
    .all();
  const withParties = hasNames
    ? db
        .prepare(
          `SELECT t.txn_id, t.txn_type, t.txn_date, n.full_name
           FROM kb_transactions t
           LEFT JOIN kb_names n ON n.name_id = t.txn_name_id
           ORDER BY t.txn_id DESC LIMIT 5`
        )
        .all()
    : [];
  return { total, byType, sample, withParties };
}

module.exports = {
  listCompanies,
  upsertCompany,
  listParties,
  upsertParty,
  listItems,
  listUnits,
  listTaxCodes,
  upsertItem,
  listBatches,
  upsertBatch,
  listPartyRates,
  upsertPartyRate,
  listOrders,
  getOrder,
  listOrderItems,
  createOrder,
  updateOrder,
  importFromVyaparDump,
  importFromVyaparSqlite,
  getDbInfo,
  getOrdersDiagnostics
};
