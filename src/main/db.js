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

    CREATE TABLE IF NOT EXISTS kb_item_stock_tracking (
      ist_id integer PRIMARY KEY AUTOINCREMENT,
      ist_batch_number varchar(30) DEFAULT '',
      ist_serial_number varchar(30) DEFAULT '',
      ist_mrp double DEFAULT 0,
      ist_expiry_date datetime DEFAULT null,
      ist_manufacturing_date datetime DEFAULT null,
      ist_size varchar(100) DEFAULT '',
      ist_item_id integer DEFAULT null,
      ist_current_quantity double DEFAULT 0,
      ist_opening_quantity double DEFAULT 0,
      ist_type integer DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS STOCK_ITEM ON kb_item_stock_tracking (ist_item_id);
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
              COALESCE(i.item_stock_quantity, 0) as stock_qty,
              i.base_unit_id,
              COALESCE(u.unit_short_name, u.unit_name, '') as base_unit
       FROM kb_items i
       LEFT JOIN kb_tax_code t ON t.tax_code_id = i.item_tax_id
       LEFT JOIN kb_item_units u ON u.unit_id = i.base_unit_id
       ORDER BY i.item_id DESC`
    )
    .all();
}

function getItemDetails(itemId) {
  const db = getDb();
  const resolvedItemId = Number(itemId);
  if (!Number.isFinite(resolvedItemId) || resolvedItemId <= 0) {
    throw new Error('Invalid item id');
  }

  const item = db
    .prepare(
      `SELECT i.item_id as id,
              i.item_name as name,
              i.item_hsn_sac_code as hsn,
              COALESCE(t.tax_rate, 0) as gst_rate,
              COALESCE(i.item_sale_unit_price, i.item_purchase_unit_price, 0) as base_rate,
              COALESCE(i.item_stock_quantity, 0) as stock_qty,
              COALESCE(u.unit_short_name, u.unit_name, '') as base_unit
       FROM kb_items i
       LEFT JOIN kb_tax_code t ON t.tax_code_id = i.item_tax_id
       LEFT JOIN kb_item_units u ON u.unit_id = i.base_unit_id
       WHERE i.item_id = ?`
    )
    .get(resolvedItemId);
  if (!item) return null;

  const inventory = db
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(ist_current_quantity, 0)), 0) as batch_stock_qty,
              COUNT(*) as batches_count
       FROM kb_item_stock_tracking
       WHERE ist_item_id = ?`
    )
    .get(resolvedItemId);

  const movement = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN t.txn_type = 1 THEN COALESCE(l.quantity, 0) ELSE 0 END), 0) as sale_qty,
              COALESCE(SUM(CASE WHEN t.txn_type = 3 THEN COALESCE(l.quantity, 0) ELSE 0 END), 0) as purchase_qty,
              SUM(CASE WHEN t.txn_type = 3 AND lower(COALESCE(t.txn_description, '')) LIKE '%ocr import%' THEN 1 ELSE 0 END) as ocr_import_lines
       FROM kb_lineitems l
       JOIN kb_transactions t ON t.txn_id = l.lineitem_txn_id
       WHERE l.item_id = ?
         AND t.txn_type IN (1, 3)`
    )
    .get(resolvedItemId);

  const linkedOrders = db
    .prepare(
      `SELECT t.txn_id as order_id,
              t.txn_type,
              t.txn_date as order_date,
              t.txn_ref_number_char as invoice_no,
              COALESCE(n.full_name, '') as party_name,
              COALESCE(l.quantity, 0) as qty,
              COALESCE(l.priceperunit, 0) as rate,
              COALESCE(l.total_amount, 0) as line_total,
              COALESCE(l.lineitem_batch_number, '') as batch_no,
              COALESCE(l.lineitem_expiry_date, '') as expiry_date,
              COALESCE(t.txn_description, '') as notes
       FROM kb_lineitems l
       JOIN kb_transactions t ON t.txn_id = l.lineitem_txn_id
       LEFT JOIN kb_names n ON n.name_id = t.txn_name_id
       WHERE l.item_id = ?
         AND t.txn_type IN (1, 3)
       ORDER BY COALESCE(t.txn_date, '') DESC, t.txn_id DESC, l.lineitem_id DESC`
    )
    .all(resolvedItemId)
    .map((row) => ({
      order_id: row.order_id,
      order_type: row.txn_type === 3 ? 'purchase' : 'sale',
      order_date: row.order_date,
      invoice_no: row.invoice_no || '',
      party_name: row.party_name || '—',
      qty: Number(row.qty || 0),
      rate: Number(row.rate || 0),
      line_total: Number(row.line_total || 0),
      batch_no: row.batch_no || '',
      expiry_date: row.expiry_date || '',
      source: /ocr import/i.test(row.notes || '') ? 'ocr_import' : 'manual'
    }));

  return {
    item: {
      ...item,
      stock_qty: Number(item.stock_qty || 0),
      gst_rate: Number(item.gst_rate || 0),
      base_rate: Number(item.base_rate || 0)
    },
    inventory: {
      system_stock_qty: Number(item.stock_qty || 0),
      batch_stock_qty: Number(inventory?.batch_stock_qty || 0),
      batches_count: Number(inventory?.batches_count || 0),
      sale_qty: Number(movement?.sale_qty || 0),
      purchase_qty: Number(movement?.purchase_qty || 0),
      ocr_import_lines: Number(movement?.ocr_import_lines || 0)
    },
    batches: listBatches(resolvedItemId),
    linked_orders: linkedOrders
  };
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
    .prepare(
      `SELECT ist_id as id,
              ist_item_id as item_id,
              ist_batch_number as batch_no,
              ist_expiry_date as expiry_date,
              COALESCE(ist_mrp, 0) as mrp,
              COALESCE(ist_current_quantity, 0) as qty
       FROM kb_item_stock_tracking
       WHERE ist_item_id = ?
       ORDER BY ist_id DESC`
    )
    .all(itemId)
    .map((row) => ({
      id: row.id,
      item_id: row.item_id,
      batch_no: row.batch_no,
      expiry_date: row.expiry_date,
      mrp: row.mrp || 0,
      rate: 0,
      qty: row.qty || 0
    }));
}

function listBatchAvailability(itemId) {
  const db = getDb();
  const resolvedItemId = Number(itemId);
  if (!Number.isFinite(resolvedItemId) || resolvedItemId <= 0) return [];
  const rows = db
    .prepare(
      `
      SELECT
        COALESCE(m.batch_no, b.batch_no) as batch_no,
        COALESCE(b.expiry_date, null) as expiry_date,
        COALESCE(b.mrp, 0) as mrp,
        COALESCE(m.purchase_qty, 0) as purchase_qty,
        COALESCE(m.sale_qty, 0) as sale_qty,
        COALESCE(m.purchase_qty, 0) - COALESCE(m.sale_qty, 0) as available_qty
      FROM (
        SELECT
          COALESCE(l.lineitem_batch_number, '') as batch_no,
          SUM(CASE WHEN t.txn_type = 3 THEN COALESCE(l.quantity, 0) ELSE 0 END) as purchase_qty,
          SUM(CASE WHEN t.txn_type = 1 THEN COALESCE(l.quantity, 0) ELSE 0 END) as sale_qty
        FROM kb_lineitems l
        JOIN kb_transactions t ON t.txn_id = l.lineitem_txn_id
        WHERE l.item_id = @item_id
        GROUP BY COALESCE(l.lineitem_batch_number, '')
      ) m
      LEFT JOIN (
        SELECT
          COALESCE(ist_batch_number, '') as batch_no,
          MAX(ist_expiry_date) as expiry_date,
          MAX(COALESCE(ist_mrp, 0)) as mrp
        FROM kb_item_stock_tracking
        WHERE ist_item_id = @item_id
        GROUP BY COALESCE(ist_batch_number, '')
      ) b ON b.batch_no = m.batch_no

      UNION

      SELECT
        b.batch_no,
        b.expiry_date,
        b.mrp,
        0 as purchase_qty,
        0 as sale_qty,
        0 as available_qty
      FROM (
        SELECT
          COALESCE(ist_batch_number, '') as batch_no,
          MAX(ist_expiry_date) as expiry_date,
          MAX(COALESCE(ist_mrp, 0)) as mrp
        FROM kb_item_stock_tracking
        WHERE ist_item_id = @item_id
        GROUP BY COALESCE(ist_batch_number, '')
      ) b
      WHERE NOT EXISTS (
        SELECT 1
        FROM kb_lineitems l
        WHERE l.item_id = @item_id AND COALESCE(l.lineitem_batch_number, '') = b.batch_no
      )
      ORDER BY batch_no ASC
      `
    )
    .all({ item_id: resolvedItemId });

  return rows.map((row) => ({
    batch_no: row.batch_no,
    expiry_date: row.expiry_date,
    mrp: row.mrp || 0,
    purchase_qty: Number(row.purchase_qty || 0),
    sale_qty: Number(row.sale_qty || 0),
    available_qty: Number(row.available_qty || 0)
  }));
}

function exportDatabase(targetPath) {
  const db = getDb();
  const rawTarget = String(targetPath || '').trim();
  const downloadsPath =
    app && typeof app.getPath === 'function'
      ? app.getPath('downloads')
      : path.join(os.homedir(), 'Downloads');
  const timestamp = new Date();
  const ts = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(
    timestamp.getDate()
  ).padStart(2, '0')}_${String(timestamp.getHours()).padStart(2, '0')}${String(
    timestamp.getMinutes()
  ).padStart(2, '0')}${String(timestamp.getSeconds()).padStart(2, '0')}`;
  const defaultPath = path.join(downloadsPath, `vyapar_backup_${ts}.db`);
  let resolvedPath = rawTarget || defaultPath;
  const ext = path.extname(resolvedPath) || '.db';
  if (!path.extname(resolvedPath)) resolvedPath = `${resolvedPath}${ext}`;

  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const ensureUniquePath = (candidate) => {
    if (!fs.existsSync(candidate)) return candidate;
    const base = path.basename(candidate, ext);
    const parent = path.dirname(candidate);
    let counter = 1;
    let next = path.join(parent, `${base}_${counter}${ext}`);
    while (fs.existsSync(next)) {
      counter += 1;
      next = path.join(parent, `${base}_${counter}${ext}`);
    }
    return next;
  };

  const finalPath = ensureUniquePath(resolvedPath);
  db.exec('PRAGMA wal_checkpoint(FULL)');
  const escaped = finalPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  return { path: finalPath };
}

function normalizeDateValue(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(value).trim() || null;
}

function normalizeBatchValue(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function upsertBatch(data) {
  const db = getDb();
  const itemId = Number(data.item_id);
  const qty = Number(data.qty || 0);
  const batchNo = normalizeBatchValue(data.batch_no);
  const expiryDate = normalizeDateValue(data.expiry_date);
  const mrp =
    data.mrp !== undefined && data.mrp !== null && data.mrp !== ''
      ? Number(data.mrp)
      : null;
  if (!Number.isFinite(itemId) || itemId <= 0) {
    throw new Error('Invalid item_id for batch update.');
  }
  if (!Number.isFinite(qty) || qty === 0) {
    throw new Error('Invalid qty for batch update.');
  }

  const findIst = db.prepare(
    `SELECT ist_id
     FROM kb_item_stock_tracking
     WHERE ist_item_id = @item_id
       AND COALESCE(ist_batch_number, '') = @batch_no
       AND (
         (@expiry_date IS NULL AND ist_expiry_date IS NULL)
         OR (@expiry_date IS NOT NULL AND date(ist_expiry_date) = date(@expiry_date))
       )
       AND (
         (@mrp IS NULL AND ist_mrp IS NULL)
         OR (@mrp IS NOT NULL AND COALESCE(ist_mrp, 0) = @mrp)
       )
     LIMIT 1`
  );
  const insertIst = db.prepare(
    `INSERT INTO kb_item_stock_tracking (
        ist_batch_number, ist_mrp, ist_expiry_date, ist_item_id, ist_current_quantity, ist_opening_quantity, ist_type
     ) VALUES (
        @batch_no, @mrp, @expiry_date, @item_id, @qty, @qty, 0
     )`
  );
  const updateIst = db.prepare(
    `UPDATE kb_item_stock_tracking
     SET ist_current_quantity = COALESCE(ist_current_quantity, 0) + @qty
     WHERE ist_id = @ist_id`
  );
  const updateItemStock = db.prepare(
    `UPDATE kb_items
     SET item_stock_quantity = COALESCE(item_stock_quantity, 0) + @qty
     WHERE item_id = @item_id`
  );

  return db.transaction(() => {
    const existing = findIst.get({ item_id: itemId, batch_no: batchNo, expiry_date: expiryDate, mrp });
    let istId;
    if (existing) {
      istId = Number(existing.ist_id);
      updateIst.run({ qty, ist_id: istId });
    } else {
      istId = Number(
        insertIst.run({ item_id: itemId, batch_no: batchNo, expiry_date: expiryDate, mrp, qty }).lastInsertRowid
      );
    }
    updateItemStock.run({ qty, item_id: itemId });
    return { id: istId, item_id: itemId, batch_no: batchNo, expiry_date: expiryDate, mrp: mrp || 0, qty };
  })();
}

function buildStockAdjusters(db) {
  const findIstByLine = db.prepare(
    `SELECT ist_id
     FROM kb_item_stock_tracking
     WHERE ist_item_id = @item_id
       AND COALESCE(ist_batch_number, '') = @batch_no
       AND (
         (@expiry_date IS NULL AND ist_expiry_date IS NULL)
         OR (@expiry_date IS NOT NULL AND date(ist_expiry_date) = date(@expiry_date))
       )
       AND (
         (@mrp IS NULL AND ist_mrp IS NULL)
         OR (@mrp IS NOT NULL AND COALESCE(ist_mrp, 0) = @mrp)
       )
     LIMIT 1`
  );
  const insertIst = db.prepare(
    `INSERT INTO kb_item_stock_tracking (
        ist_batch_number, ist_mrp, ist_expiry_date, ist_item_id, ist_current_quantity, ist_opening_quantity, ist_type
     ) VALUES (
        @batch_no, @mrp, @expiry_date, @item_id, @qty, @qty, 0
     )`
  );
  const updateIstQty = db.prepare(
    `UPDATE kb_item_stock_tracking
     SET ist_current_quantity = COALESCE(ist_current_quantity, 0) + @delta
     WHERE ist_id = @ist_id`
  );
  const updateItemQty = db.prepare(
    `UPDATE kb_items
     SET item_stock_quantity = COALESCE(item_stock_quantity, 0) + @delta
     WHERE item_id = @item_id`
  );

  const resolveIstId = (line, createIfMissing) => {
    const itemId = Number(line.item_id);
    if (!Number.isFinite(itemId) || itemId <= 0) return null;
    const batchNo = normalizeBatchValue(line.batch_no);
    const expiryDate = normalizeDateValue(line.expiry_date);
    const mrp =
      line.mrp !== undefined && line.mrp !== null && line.mrp !== '' ? Number(line.mrp) : null;
    const existing = findIstByLine.get({
      item_id: itemId,
      batch_no: batchNo,
      expiry_date: expiryDate,
      mrp
    });
    if (existing) return Number(existing.ist_id);
    if (!createIfMissing) return null;
    return Number(
      insertIst.run({
        batch_no: batchNo,
        mrp,
        expiry_date: expiryDate,
        item_id: itemId,
        qty: 0
      }).lastInsertRowid
    );
  };

  const applyPurchaseLineStock = (line) => {
    const qty = Number(line.qty || line.quantity || 0);
    const itemId = Number(line.item_id);
    if (!Number.isFinite(itemId) || itemId <= 0 || !Number.isFinite(qty) || qty === 0) {
      return null;
    }
    const istId = resolveIstId(line, true);
    if (istId) {
      updateIstQty.run({ delta: qty, ist_id: istId });
    }
    updateItemQty.run({ delta: qty, item_id: itemId });
    return istId;
  };

  const rollbackPurchaseLineStock = (line) => {
    const qty = Number(line.qty || line.quantity || 0);
    const itemId = Number(line.item_id);
    if (!Number.isFinite(itemId) || itemId <= 0 || !Number.isFinite(qty) || qty === 0) {
      return;
    }
    const explicitIstId =
      line.lineitem_ist_id !== undefined && line.lineitem_ist_id !== null ? Number(line.lineitem_ist_id) : null;
    const istId = Number.isFinite(explicitIstId) && explicitIstId > 0 ? explicitIstId : resolveIstId(line, false);
    if (istId) {
      updateIstQty.run({ delta: -qty, ist_id: istId });
    }
    updateItemQty.run({ delta: -qty, item_id: itemId });
  };

  const applySaleLineStock = (line) => {
    const qty = Number(line.qty || line.quantity || 0);
    const itemId = Number(line.item_id);
    if (!Number.isFinite(itemId) || itemId <= 0 || !Number.isFinite(qty) || qty === 0) {
      return null;
    }
    const istId = resolveIstId(line, false);
    if (istId) {
      updateIstQty.run({ delta: -qty, ist_id: istId });
    }
    updateItemQty.run({ delta: -qty, item_id: itemId });
    return istId;
  };

  return {
    applyPurchaseLineStock,
    rollbackPurchaseLineStock,
    applySaleLineStock
  };
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

function listPartyRatesForOrder(partyId, orderType = 'sale') {
  const db = getDb();
  const txnType = orderType === 'purchase' ? 3 : 1;
  const invoiceRates = db
    .prepare(
      `SELECT l.item_id as item_id,
              l.priceperunit as rate
       FROM kb_lineitems l
       JOIN kb_transactions t ON t.txn_id = l.lineitem_txn_id
       WHERE t.txn_name_id = ?
         AND t.txn_type = ?
         AND l.item_id IS NOT NULL
         AND COALESCE(l.priceperunit, 0) > 0
       ORDER BY COALESCE(t.txn_date, '') DESC, t.txn_id DESC, l.lineitem_id DESC`
    )
    .all(partyId, txnType);

  const rateByItem = new Map();
  invoiceRates.forEach((row) => {
    const key = Number(row.item_id);
    if (!Number.isFinite(key)) return;
    if (!rateByItem.has(key)) {
      rateByItem.set(key, Number(row.rate || 0));
    }
  });

  const savedRates = db
    .prepare(
      `SELECT party_item_rate_item_id as item_id,
              COALESCE(party_item_rate_sale_price, 0) as sale_rate,
              COALESCE(party_item_rate_purchase_price, 0) as purchase_rate
       FROM kb_party_item_rate
       WHERE party_item_rate_party_id = ?`
    )
    .all(partyId);

  savedRates.forEach((row) => {
    const key = Number(row.item_id);
    if (!Number.isFinite(key)) return;
    if (rateByItem.has(key)) return;
    const fallback = orderType === 'purchase' ? Number(row.purchase_rate || 0) : Number(row.sale_rate || 0);
    if (fallback > 0) rateByItem.set(key, fallback);
  });

  return Array.from(rateByItem.entries()).map(([item_id, rate]) => ({ item_id, rate }));
}

function upsertPartyRate(data) {
  const db = getDb();
  const isPurchase = data.order_type === 'purchase';
  const stmt = isPurchase
    ? db.prepare(
        `INSERT INTO kb_party_item_rate (
            party_item_rate_party_id, party_item_rate_item_id, party_item_rate_purchase_price
         )
         VALUES (@party_id, @item_id, @rate)
         ON CONFLICT(party_item_rate_item_id, party_item_rate_party_id)
         DO UPDATE SET party_item_rate_purchase_price = excluded.party_item_rate_purchase_price`
      )
    : db.prepare(
        `INSERT INTO kb_party_item_rate (
            party_item_rate_party_id, party_item_rate_item_id, party_item_rate_sale_price
         )
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

function upsertPartyRatesFromOrder(db, partyId, txnType, items) {
  if (!partyId || !Array.isArray(items) || !items.length) return;
  const isPurchase = txnType === 3;
  const stmt = isPurchase
    ? db.prepare(
        `INSERT INTO kb_party_item_rate (
            party_item_rate_party_id, party_item_rate_item_id, party_item_rate_purchase_price
         )
         VALUES (@party_id, @item_id, @rate)
         ON CONFLICT(party_item_rate_item_id, party_item_rate_party_id)
         DO UPDATE SET party_item_rate_purchase_price = excluded.party_item_rate_purchase_price`
      )
    : db.prepare(
        `INSERT INTO kb_party_item_rate (
            party_item_rate_party_id, party_item_rate_item_id, party_item_rate_sale_price
         )
         VALUES (@party_id, @item_id, @rate)
         ON CONFLICT(party_item_rate_item_id, party_item_rate_party_id)
         DO UPDATE SET party_item_rate_sale_price = excluded.party_item_rate_sale_price`
      );

  items.forEach((line) => {
    const itemId = Number(line.item_id);
    const rate = Number(line.rate || line.priceperunit || 0);
    if (!Number.isFinite(itemId) || itemId <= 0) return;
    if (!Number.isFinite(rate) || rate <= 0) return;
    stmt.run({ party_id: Number(partyId), item_id: itemId, rate });
  });
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

function listGstr1SalesReport(range = {}) {
  const db = getDb();
  const fromDate = String(range?.from_date || '').trim();
  const toDate = String(range?.to_date || '').trim();
  if (!fromDate || !toDate) {
    throw new Error('from_date and to_date are required');
  }

  const company = db
    .prepare(
      `SELECT COALESCE(firm_gstin_number, '') as gstin,
              COALESCE(firm_name, '') as legal_name,
              COALESCE(firm_state, '') as state
       FROM kb_firms
       ORDER BY firm_id DESC
       LIMIT 1`
    )
    .get() || { gstin: '', legal_name: '', state: '' };

  const rows = db
    .prepare(
      `SELECT t.txn_id as order_id,
              t.txn_date as invoice_date,
              t.txn_ref_number_char as invoice_no,
              COALESCE(n.name_gstin_number, '') as party_gstin,
              COALESCE(n.full_name, '') as party_name,
              COALESCE(NULLIF(TRIM(t.txn_place_of_supply), ''), n.name_state, '') as place_of_supply,
              COALESCE(tc.tax_rate, itax.tax_rate, 0) as gst_rate,
              SUM(COALESCE(l.total_amount, COALESCE(l.quantity, 0) * COALESCE(l.priceperunit, 0))) as taxable_value
       FROM kb_transactions t
       JOIN kb_lineitems l ON l.lineitem_txn_id = t.txn_id
       LEFT JOIN kb_names n ON n.name_id = t.txn_name_id
       LEFT JOIN kb_tax_code tc ON tc.tax_code_id = l.lineitem_tax_id
       LEFT JOIN kb_items i ON i.item_id = l.item_id
       LEFT JOIN kb_tax_code itax ON itax.tax_code_id = i.item_tax_id
       WHERE t.txn_type = 1
         AND date(t.txn_date) >= date(@from_date)
         AND date(t.txn_date) <= date(@to_date)
       GROUP BY t.txn_id,
                t.txn_date,
                t.txn_ref_number_char,
                n.name_gstin_number,
                n.full_name,
                place_of_supply,
                gst_rate
       ORDER BY date(t.txn_date) ASC, t.txn_id ASC`
    )
    .all({ from_date: fromDate, to_date: toDate })
    .map((row) => {
      const rate = Number(row.gst_rate || 0);
      const taxable = Number(row.taxable_value || 0);
      const taxAmount = taxable * (rate / 100);
      const invoiceValue = taxable + taxAmount;
      const isInterState =
        company.state &&
        row.place_of_supply &&
        String(company.state).trim().toLowerCase() !== String(row.place_of_supply).trim().toLowerCase();

      return {
        gstin_uin: row.party_gstin || '',
        party_name: row.party_name || '',
        transaction_type: 'Sale',
        invoice_no: row.invoice_no || String(row.order_id),
        invoice_date: row.invoice_date || '',
        invoice_value: Number(invoiceValue.toFixed(2)),
        rate: Number(rate.toFixed(2)),
        cess_rate: 0,
        taxable_value: Number(taxable.toFixed(2)),
        reverse_charge: 'N',
        integrated_tax_amount: isInterState ? Number(taxAmount.toFixed(2)) : 0,
        central_tax_amount: isInterState ? 0 : Number((taxAmount / 2).toFixed(2)),
        state_ut_tax_amount: isInterState ? 0 : Number((taxAmount / 2).toFixed(2)),
        cess_amount: 0,
        place_of_supply: row.place_of_supply || '',
        order_id: row.order_id
      };
    });

  return {
    company: {
      gstin: company.gstin || '',
      legal_name: company.legal_name || '',
      trade_name: ''
    },
    rows
  };
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
  const selectOrderTxnType = db.prepare('SELECT txn_type FROM kb_transactions WHERE txn_id = ?');
  const selectExistingLines = db.prepare(
    `SELECT item_id,
            quantity,
            lineitem_batch_number as batch_no,
            lineitem_expiry_date as expiry_date,
            lineitem_mrp as mrp,
            lineitem_ist_id
     FROM kb_lineitems
     WHERE lineitem_txn_id = ?`
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
        lineitem_ist_id,
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
        @lineitem_ist_id,
        @lineitem_batch_number,
        @lineitem_expiry_date,
        @lineitem_mrp
     )`
  );

  const trx = db.transaction((payload) => {
    const stockAdjusters = buildStockAdjusters(db);
    const existingOrder = selectOrderTxnType.get(orderId);
    if (!existingOrder) throw new Error('Order not found.');
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
    const companyState =
      (db.prepare('SELECT firm_state FROM kb_firms ORDER BY firm_id DESC LIMIT 1').get() || {}).firm_state || '';
    const partyState =
      payload.party_id !== undefined && payload.party_id !== null
        ? (
            db.prepare('SELECT name_state FROM kb_names WHERE name_id = ?').get(payload.party_id) || {}
          ).name_state
        : '';
    const placeOfSupply = payload.place_of_supply || partyState || '';
    const isInterState =
      companyState &&
      placeOfSupply &&
      String(companyState).trim().toLowerCase() !== String(placeOfSupply).trim().toLowerCase();

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

    if (existingOrder.txn_type === 3) {
      const oldLines = selectExistingLines.all(orderId);
      oldLines.forEach((line) => stockAdjusters.rollbackPurchaseLineStock(line));
    }

    deleteLines.run(orderId);

    payload.items.forEach((item) => {
      const taxRate = Number(item.gst_rate || 0);
      let taxId = resolveTaxCodeIdByRate(db, taxRate, isInterState);
      if (!taxId) {
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
      let lineIstId = null;
      if (txnType === 3) {
        lineIstId = stockAdjusters.applyPurchaseLineStock(item);
        const purchaseRate = Number(item.rate || 0);
        if (item.hsn && String(item.hsn).trim()) {
          db.prepare(
            `UPDATE kb_items
             SET item_hsn_sac_code = @hsn,
                 item_purchase_unit_price = CASE WHEN @purchase_rate > 0 THEN @purchase_rate ELSE item_purchase_unit_price END
             WHERE item_id = @item_id`
          ).run({
            hsn: String(item.hsn).trim(),
            purchase_rate: purchaseRate,
            item_id: item.item_id
          });
        } else if (purchaseRate > 0) {
          db.prepare('UPDATE kb_items SET item_purchase_unit_price = ? WHERE item_id = ?').run(
            purchaseRate,
            item.item_id
          );
        }
      } else if (txnType === 1) {
        lineIstId = stockAdjusters.applySaleLineStock(item);
      }
      const lineTaxId = taxId !== undefined && taxId !== null ? Number(taxId) : null;
      const resolvedUnitIdNum = Number.isFinite(Number(resolvedUnitId)) ? Number(resolvedUnitId) : null;
      const hasTaxId =
        lineTaxId !== null
          ? db.prepare('SELECT tax_code_id FROM kb_tax_code WHERE tax_code_id = ?').get(lineTaxId)
          : null;
      const hasUnitId =
        resolvedUnitIdNum !== null
          ? db.prepare('SELECT unit_id FROM kb_item_units WHERE unit_id = ?').get(resolvedUnitIdNum)
          : null;
      const hasIstId =
        lineIstId !== null && lineIstId !== undefined
          ? db.prepare('SELECT ist_id FROM kb_item_stock_tracking WHERE ist_id = ?').get(lineIstId)
          : null;

      insertLine.run({
        lineitem_txn_id: orderId,
        item_id: item.item_id,
        quantity: item.qty,
        priceperunit: item.rate,
        total_amount: item.qty * item.rate,
        lineitem_tax_id: hasTaxId ? lineTaxId : null,
        lineitem_unit_id: hasUnitId ? resolvedUnitIdNum : null,
        lineitem_ist_id: hasIstId ? lineIstId : null,
        lineitem_batch_number: item.batch_no || null,
        lineitem_expiry_date: item.expiry_date || null,
        lineitem_mrp: item.mrp !== undefined && item.mrp !== null ? Number(item.mrp || 0) : null
      });
    });
    upsertPartyRatesFromOrder(db, payload.party_id || null, txnType, payload.items || []);

    return orderId;
  });

  return trx(order);
}

function deleteOrder(orderId) {
  const db = getDb();
  const deleteLines = db.prepare('DELETE FROM kb_lineitems WHERE lineitem_txn_id = ?');
  const deleteOrderStmt = db.prepare('DELETE FROM kb_transactions WHERE txn_id = ?');
  const selectOrderTxnType = db.prepare('SELECT txn_type FROM kb_transactions WHERE txn_id = ?');
  const selectExistingLines = db.prepare(
    `SELECT item_id,
            quantity,
            lineitem_batch_number as batch_no,
            lineitem_expiry_date as expiry_date,
            lineitem_mrp as mrp,
            lineitem_ist_id
     FROM kb_lineitems
     WHERE lineitem_txn_id = ?`
  );

  const trx = db.transaction((id) => {
    const existingOrder = selectOrderTxnType.get(id);
    if (!existingOrder) throw new Error('Order not found.');
    const stockAdjusters = buildStockAdjusters(db);
    if (existingOrder.txn_type === 3) {
      const oldLines = selectExistingLines.all(id);
      oldLines.forEach((line) => stockAdjusters.rollbackPurchaseLineStock(line));
    }
    deleteLines.run(id);
    deleteOrderStmt.run(id);
    return { ok: true };
  });

  return trx(Number(orderId));
}

function getNextRefNumberByTxnType(db, txnType) {
  const row = db
    .prepare(
      `SELECT MAX(CAST(TRIM(txn_ref_number_char) AS INTEGER)) as max_ref
       FROM kb_transactions
       WHERE txn_type = @txn_type
         AND TRIM(COALESCE(txn_ref_number_char, '')) <> ''
         AND TRIM(txn_ref_number_char) NOT GLOB '*[^0-9]*'`
    )
    .get({ txn_type: txnType });
  const maxRef = Number(row?.max_ref || 0);
  return String((Number.isFinite(maxRef) ? maxRef : 0) + 1);
}

function resolveTaxCodeIdByRate(db, rateValue, isInterState) {
  const rate = Number(rateValue || 0);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const taxPrefix = isInterState ? 'IGST' : 'GST';
  const taxName = `${taxPrefix}@${rate}%`;
  const findByName = db.prepare('SELECT tax_code_id, tax_rate FROM kb_tax_code WHERE tax_code_name = ? LIMIT 1');
  const findByRate = db.prepare('SELECT tax_code_id FROM kb_tax_code WHERE tax_rate = ? LIMIT 1');
  const insertTax = db.prepare(
    `INSERT OR IGNORE INTO kb_tax_code (tax_code_name, tax_rate, tax_code_type, tax_rate_type)
     VALUES (?, ?, 0, 4)`
  );
  const patchTaxRate = db.prepare(
    'UPDATE kb_tax_code SET tax_rate = ?, tax_code_date_modified = CURRENT_TIMESTAMP WHERE tax_code_id = ?'
  );
  const existingByName = findByName.get(taxName);
  if (existingByName) {
    if (Number(existingByName.tax_rate || 0) !== rate) {
      patchTaxRate.run(rate, existingByName.tax_code_id);
    }
    return existingByName.tax_code_id;
  }
  insertTax.run(taxName, rate);
  const insertedByName = findByName.get(taxName);
  if (insertedByName) return insertedByName.tax_code_id;
  const existingByRate = findByRate.get(rate);
  return existingByRate ? existingByRate.tax_code_id : null;
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
        lineitem_ist_id,
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
        @lineitem_ist_id,
        @lineitem_batch_number,
        @lineitem_expiry_date,
        @lineitem_mrp
     )`
  );

  const trx = db.transaction((payload) => {
    const stockAdjusters = buildStockAdjusters(db);
    const manualInvoiceNo = String(payload.invoice_no || '').trim();
    const nextInvoiceNo = manualInvoiceNo || getNextRefNumberByTxnType(db, txnType);
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
    const companyState =
      (db.prepare('SELECT firm_state FROM kb_firms ORDER BY firm_id DESC LIMIT 1').get() || {}).firm_state || '';
    const partyState =
      payload.party_id !== undefined && payload.party_id !== null
        ? (
            db.prepare('SELECT name_state FROM kb_names WHERE name_id = ?').get(payload.party_id) || {}
          ).name_state
        : '';
    const placeOfSupply = payload.place_of_supply || partyState || '';
    const isInterState =
      companyState &&
      placeOfSupply &&
      String(companyState).trim().toLowerCase() !== String(placeOfSupply).trim().toLowerCase();

    const info = insertOrder.run({
      txn_type: txnType,
      txn_name_id: payload.party_id || null,
      txn_date: payload.order_date,
      txn_ref_number_char: nextInvoiceNo,
      txn_description: payload.notes || '',
      txn_place_of_supply: placeOfSupply,
      txn_time: 0,
      txn_cash_amount: cashAmount,
      txn_balance_amount: clampedBalance
    });
    const orderId = info.lastInsertRowid;

    payload.items.forEach((item) => {
      const taxRate = Number(item.gst_rate || 0);
      let taxId = resolveTaxCodeIdByRate(db, taxRate, isInterState);
      if (!taxId) {
        const tax = db
          .prepare('SELECT item_tax_id FROM kb_items WHERE item_id = ?')
          .get(item.item_id);
        taxId = tax ? tax.item_tax_id : null;
      }
      const resolvedUnitId =
        item.unit_id !== undefined && item.unit_id !== null
          ? Number(item.unit_id)
          : (db.prepare('SELECT base_unit_id FROM kb_items WHERE item_id = ?').get(item.item_id) || {})
              .base_unit_id;
      let lineIstId = null;
      if (txnType === 3) {
        lineIstId = stockAdjusters.applyPurchaseLineStock(item);
        const purchaseRate = Number(item.rate || 0);
        if (item.hsn && String(item.hsn).trim()) {
          db.prepare(
            `UPDATE kb_items
             SET item_hsn_sac_code = @hsn,
                 item_purchase_unit_price = CASE WHEN @purchase_rate > 0 THEN @purchase_rate ELSE item_purchase_unit_price END
             WHERE item_id = @item_id`
          ).run({
            hsn: String(item.hsn).trim(),
            purchase_rate: purchaseRate,
            item_id: item.item_id
          });
        } else if (purchaseRate > 0) {
          db.prepare('UPDATE kb_items SET item_purchase_unit_price = ? WHERE item_id = ?').run(
            purchaseRate,
            item.item_id
          );
        }
      } else if (txnType === 1) {
        lineIstId = stockAdjusters.applySaleLineStock(item);
      }
      try {
      const lineTaxId = taxId !== undefined && taxId !== null ? Number(taxId) : null;
      const resolvedUnitIdNum = Number.isFinite(Number(resolvedUnitId)) ? Number(resolvedUnitId) : null;
      const hasTaxId =
        lineTaxId !== null
          ? db.prepare('SELECT tax_code_id FROM kb_tax_code WHERE tax_code_id = ?').get(lineTaxId)
          : null;
      const hasUnitId =
        resolvedUnitIdNum !== null
          ? db.prepare('SELECT unit_id FROM kb_item_units WHERE unit_id = ?').get(resolvedUnitIdNum)
          : null;
      const hasIstId =
        lineIstId !== null && lineIstId !== undefined
          ? db.prepare('SELECT ist_id FROM kb_item_stock_tracking WHERE ist_id = ?').get(lineIstId)
          : null;

      insertLine.run({
        lineitem_txn_id: orderId,
        item_id: item.item_id,
        quantity: item.qty,
        priceperunit: item.rate,
        total_amount: item.qty * item.rate,
        lineitem_tax_id: hasTaxId ? lineTaxId : null,
        lineitem_unit_id: hasUnitId ? resolvedUnitIdNum : null,
        lineitem_ist_id: hasIstId ? lineIstId : null,
        lineitem_batch_number: item.batch_no || null,
        lineitem_expiry_date: item.expiry_date || null,
        lineitem_mrp: item.mrp !== undefined && item.mrp !== null ? Number(item.mrp || 0) : null
      });
      } catch (e) {
        try {
          const fkStatus = db.pragma('foreign_keys', { simple: true });
          const lineSchema = db
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kb_lineitems'")
            .get();
          const txnSchema = db
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kb_transactions'")
            .get();
          const itemSchema = db
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kb_items'")
            .get();
          const unitSchema = db
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kb_item_units'")
            .get();
          const istSchema = db
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kb_item_stock_tracking'")
            .get();
          const existingItem = db
            .prepare('SELECT item_id FROM kb_items WHERE item_id = ?')
            .get(item.item_id);
          const existingTxn = db
            .prepare('SELECT txn_id FROM kb_transactions WHERE txn_id = ?')
            .get(orderId);
          const existingUnit = Number.isFinite(Number(resolvedUnitId))
            ? db.prepare('SELECT unit_id FROM kb_item_units WHERE unit_id = ?').get(Number(resolvedUnitId))
            : null;
          const existingIst = lineIstId
            ? db.prepare('SELECT ist_id FROM kb_item_stock_tracking WHERE ist_id = ?').get(lineIstId)
            : null;
          console.error('OCR lineitem insert debug:', {
            db_path: currentDbPath,
            foreign_keys: fkStatus,
            lineitems_schema: lineSchema?.sql || null,
            transactions_schema: txnSchema?.sql || null,
            items_schema: itemSchema?.sql || null,
            item_units_schema: unitSchema?.sql || null,
            item_stock_schema: istSchema?.sql || null,
            order_id: orderId,
            item_id: item.item_id,
            unit_id: Number.isFinite(Number(resolvedUnitId)) ? Number(resolvedUnitId) : null,
            ist_id: lineIstId,
            exists_item: !!existingItem,
            exists_txn: !!existingTxn,
            exists_unit: !!existingUnit,
            exists_ist: !!existingIst,
            error: e.message
          });
        } catch (debugErr) {
          console.error('OCR lineitem insert debug failed:', debugErr?.message || debugErr);
        }
        throw e;
      }
    });
    upsertPartyRatesFromOrder(db, payload.party_id || null, txnType, payload.items || []);

    return orderId;
  });

  const orderId = trx(order);
  return db
    .prepare('SELECT txn_id as id, txn_type, txn_date as order_date, txn_description as notes FROM kb_transactions WHERE txn_id = ?')
    .get(orderId);
}

function importPurchaseBillFromOcr(payload) {
  const db = getDb();
  const rawSupplier = payload?.supplier || {};
  const rawBill = payload?.bill || {};
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  if (!rawItems.length) {
    throw new Error('At least one item is required.');
  }

  const findPartyById = db.prepare('SELECT name_id FROM kb_names WHERE name_id = ? LIMIT 1');
  const findPartyByName = db.prepare(
    `SELECT name_id
     FROM kb_names
     WHERE lower(trim(full_name)) = lower(trim(?))
     LIMIT 1`
  );
  const insertParty = db.prepare(
    `INSERT INTO kb_names (full_name, phone_number, address, name_gstin_number, name_state, name_type, name_is_active)
     VALUES (@name, @phone, @address, @gst_number, @state_of_supply, 1, 1)`
  );
  const patchParty = db.prepare(
    `UPDATE kb_names
     SET date_modified = CURRENT_TIMESTAMP,
         phone_number = CASE WHEN trim(COALESCE(phone_number, '')) = '' AND trim(COALESCE(@phone, '')) <> '' THEN @phone ELSE phone_number END,
         address = CASE WHEN trim(COALESCE(address, '')) = '' AND trim(COALESCE(@address, '')) <> '' THEN @address ELSE address END,
         name_gstin_number = CASE WHEN trim(COALESCE(name_gstin_number, '')) = '' AND trim(COALESCE(@gst_number, '')) <> '' THEN @gst_number ELSE name_gstin_number END,
         name_state = CASE WHEN trim(COALESCE(name_state, '')) = '' AND trim(COALESCE(@state_of_supply, '')) <> '' THEN @state_of_supply ELSE name_state END
     WHERE name_id = @party_id`
  );

  const findItemById = db.prepare('SELECT item_id FROM kb_items WHERE item_id = ? LIMIT 1');
  const findItemByName = db.prepare(
    `SELECT item_id
     FROM kb_items
     WHERE lower(trim(item_name)) = lower(trim(?))
     LIMIT 1`
  );
  const insertItem = db.prepare(
    `INSERT INTO kb_items (
        item_name,
        item_hsn_sac_code,
        item_sale_unit_price,
        item_purchase_unit_price,
        item_tax_id,
        category_id
     )
     VALUES (@name, @hsn, @base_rate, @base_rate, @tax_id, @category_id)`
  );
  const patchItem = db.prepare(
    `UPDATE kb_items
     SET item_date_modified = CURRENT_TIMESTAMP,
         item_hsn_sac_code = CASE WHEN trim(COALESCE(@hsn, '')) <> '' THEN @hsn ELSE item_hsn_sac_code END,
         item_purchase_unit_price = CASE WHEN @purchase_rate > 0 THEN @purchase_rate ELSE item_purchase_unit_price END,
         item_tax_id = CASE WHEN @tax_id IS NOT NULL THEN @tax_id ELSE item_tax_id END
     WHERE item_id = @item_id`
  );
  const findTaxByRate = db.prepare('SELECT tax_code_id FROM kb_tax_code WHERE tax_rate = ? LIMIT 1');
  const findTaxByName = db.prepare(
    'SELECT tax_code_id, tax_rate FROM kb_tax_code WHERE tax_code_name = ? LIMIT 1'
  );
  const patchTaxRate = db.prepare(
    'UPDATE kb_tax_code SET tax_rate = ?, tax_code_date_modified = CURRENT_TIMESTAMP WHERE tax_code_id = ?'
  );
  const insertTax = db.prepare(
    `INSERT OR IGNORE INTO kb_tax_code (tax_code_name, tax_rate, tax_code_type, tax_rate_type)
     VALUES (?, ?, 0, 4)`
  );
  const hasItemCategoryTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kb_item_categories' LIMIT 1")
    .get();
  const findAnyCategoryId = hasItemCategoryTable
    ? db.prepare('SELECT item_category_id FROM kb_item_categories ORDER BY item_category_id ASC LIMIT 1')
    : null;
  const findCategoryByName = hasItemCategoryTable
    ? db.prepare('SELECT item_category_id FROM kb_item_categories WHERE item_category_name = ? LIMIT 1')
    : null;
  const insertCategory = hasItemCategoryTable
    ? db.prepare('INSERT OR IGNORE INTO kb_item_categories (item_category_name) VALUES (?)')
    : null;
  const resolveCategoryId = () => {
    if (!hasItemCategoryTable) return null;
    const existing = findAnyCategoryId.get();
    if (existing) return existing.item_category_id;
    const name = 'General';
    insertCategory.run(name);
    const created = findCategoryByName.get(name);
    return created ? created.item_category_id : null;
  };

  const taxIdCache = new Map();
  const logOcrItemInsertError = (context) => {
    try {
      const fkStatus = db.pragma('foreign_keys', { simple: true });
      const itemsSchema = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kb_items'")
        .get();
      const taxSchema = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kb_tax_code'")
        .get();
      const taxById =
        context.tax_id !== null && context.tax_id !== undefined
          ? db
              .prepare(
                'SELECT tax_code_id, tax_code_name, tax_rate FROM kb_tax_code WHERE tax_code_id = ? LIMIT 1'
              )
              .get(context.tax_id)
          : null;
      const taxByRate = db
        .prepare(
          'SELECT tax_code_id, tax_code_name, tax_rate FROM kb_tax_code WHERE tax_rate = ? LIMIT 3'
        )
        .all(Number(context.gst || 0));
      const taxByName = db
        .prepare(
          'SELECT tax_code_id, tax_code_name, tax_rate FROM kb_tax_code WHERE tax_code_name = ? LIMIT 1'
        )
        .get(`GST@${Number(context.gst || 0)}%`);
      console.error('OCR item insert debug:', {
        db_path: currentDbPath,
        foreign_keys: fkStatus,
        items_schema: itemsSchema?.sql || null,
        tax_schema: taxSchema?.sql || null,
        tax_by_id: taxById || null,
        tax_by_rate: taxByRate || [],
        tax_by_name: taxByName || null
      });
    } catch (debugErr) {
      console.error('OCR item insert debug failed:', debugErr?.message || debugErr);
    }
  };
  const ensureTaxId = (rateValue) => {
    const rate = Number(rateValue || 0);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    if (taxIdCache.has(rate)) return taxIdCache.get(rate);
    const existing = findTaxByRate.get(rate);
    if (existing) {
      taxIdCache.set(rate, existing.tax_code_id);
      return existing.tax_code_id;
    }
    const taxName = `GST@${rate}%`;
    // INSERT OR IGNORE: if race/duplicate, the row just won't be inserted
    insertTax.run(taxName, rate);
    // Always re-fetch after insert to get the actual ID (handles OR IGNORE case too)
    const inserted = findTaxByRate.get(rate);
    if (inserted) {
      taxIdCache.set(rate, inserted.tax_code_id);
      return inserted.tax_code_id;
    }
    const byName = findTaxByName.get(taxName);
    if (byName) {
      if (Number(byName.tax_rate || 0) !== rate) {
        patchTaxRate.run(rate, byName.tax_code_id);
      }
      taxIdCache.set(rate, byName.tax_code_id);
      return byName.tax_code_id;
    }
    return null;
  };

  return db.transaction(() => {
    const supplierIdFromPayload =
      payload?.party_id ?? rawSupplier?.id ?? rawSupplier?.party_id ?? null;
    const supplierName =
      String(
        rawSupplier?.name ||
          rawSupplier?.full_name ||
          payload?.party_name ||
          payload?.supplier_name ||
          ''
      ).trim();
    if (!supplierIdFromPayload && !supplierName) {
      throw new Error('Supplier (party) is required.');
    }
    let partyId = null;
    if (supplierIdFromPayload !== null && supplierIdFromPayload !== undefined) {
      const found = findPartyById.get(Number(supplierIdFromPayload));
      if (found) partyId = Number(found.name_id);
    }
    if (!partyId && supplierName) {
      const found = findPartyByName.get(supplierName);
      if (found) partyId = Number(found.name_id);
    }
    if (!partyId) {
      partyId = Number(
        insertParty.run({
          name: supplierName,
          phone: String(rawSupplier?.phone || payload?.supplier_phone || '').trim(),
          address: String(rawSupplier?.address || payload?.supplier_address || '').trim(),
          gst_number: String(rawSupplier?.gst_number || rawSupplier?.name_gstin_number || '').trim(),
          state_of_supply: String(rawSupplier?.state_of_supply || rawSupplier?.name_state || '').trim()
        }).lastInsertRowid
      );
    } else {
      patchParty.run({
        party_id: partyId,
        phone: String(rawSupplier?.phone || payload?.supplier_phone || '').trim(),
        address: String(rawSupplier?.address || payload?.supplier_address || '').trim(),
        gst_number: String(rawSupplier?.gst_number || rawSupplier?.name_gstin_number || '').trim(),
        state_of_supply: String(rawSupplier?.state_of_supply || rawSupplier?.name_state || '').trim()
      });
    }

    const normalizedItems = rawItems.map((line) => {
      const qty = Number(line.qty ?? line.quantity ?? 0);
      const amount = Number(line.amount ?? line.total_amount ?? 0);
      const fallbackRate = qty > 0 && amount > 0 ? amount / qty : 0;
      const rate = Number(line.rate ?? line.priceperunit ?? fallbackRate ?? 0);
      const gstRate = Number(line.gst_rate ?? line.gst ?? line.tax_rate ?? 0);
      const hsn = String(line.hsn || line.hsn_sac_code || '').trim();
      const itemName = String(line.item_name || line.name || '').trim();
      const itemIdRaw = line.item_id ?? line.id ?? null;
      let itemId = null;
      if (itemIdRaw !== null && itemIdRaw !== undefined) {
        const foundById = findItemById.get(Number(itemIdRaw));
        if (foundById) itemId = Number(foundById.item_id);
      }
      if (!itemId && itemName) {
        const foundByName = findItemByName.get(itemName);
        if (foundByName) itemId = Number(foundByName.item_id);
      }
      if (!itemId) {
        if (!itemName) {
          throw new Error('Item name is required for new items.');
        }
        try {
          const taxIdRes = ensureTaxId(gstRate);
          const categoryId = resolveCategoryId();
          itemId = Number(
            insertItem.run({
              name: itemName,
              hsn,
              base_rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
              tax_id: taxIdRes,
              category_id: categoryId
            }).lastInsertRowid
          );
        } catch (e) {
          console.error('Error inserting item. ARGS:', {
            name: itemName,
            hsn,
            base_rate: rate,
            gst: gstRate,
            error: e.message
          });
          logOcrItemInsertError({
            name: itemName,
            hsn,
            base_rate: rate,
            gst: gstRate,
            tax_id: ensureTaxId(gstRate)
          });
          throw e;
        }
      } else {
        try {
          patchItem.run({
            item_id: itemId,
            hsn,
            purchase_rate: Number.isFinite(rate) ? rate : 0,
            tax_id: ensureTaxId(gstRate)
          });
        } catch (e) {
          console.error("Error patching item. ARGS:", { itemId, hsn, rate, gst: gstRate, error: e.message });
          throw e;
        }
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(`Invalid quantity for item ${itemName || itemId}.`);
      }
      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error(`Invalid rate for item ${itemName || itemId}.`);
      }

      return {
        item_id: itemId,
        unit_id: line.unit_id ?? null,
        hsn,
        batch_no: normalizeBatchValue(line.batch_no || line.batch || ''),
        expiry_date: normalizeDateValue(line.expiry_date || line.expiry || ''),
        mrp: line.mrp ?? null,
        gst_rate: Number.isFinite(gstRate) ? gstRate : 0,
        qty,
        rate
      };
    });

    const placeOfSupply =
      String(rawBill?.place_of_supply || payload?.place_of_supply || rawSupplier?.state_of_supply || '').trim();
    const orderPayload = {
      order_type: 'purchase',
      party_id: partyId,
      order_date: String(rawBill?.order_date || rawBill?.bill_date || payload?.order_date || '').trim(),
      invoice_no: String(rawBill?.invoice_no || rawBill?.bill_no || payload?.invoice_no || '').trim(),
      notes: String(rawBill?.notes || payload?.notes || '').trim(),
      place_of_supply: placeOfSupply,
      balance_amount: Number(rawBill?.balance_amount ?? payload?.balance_amount ?? 0),
      items: normalizedItems
    };
    if (!orderPayload.order_date) {
      const now = new Date();
      orderPayload.order_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;
    }

    const createdOrder = createOrder(orderPayload);
    return {
      order: createdOrder,
      party_id: partyId,
      items_count: normalizedItems.length
    };
  })();
}

function importSaleBillFromOcr(payload) {
  const db = getDb();
  const rawBuyer = payload?.buyer || payload?.supplier || {};
  const rawBill = payload?.bill || {};
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  if (!rawItems.length) {
    throw new Error('At least one item is required.');
  }

  const findPartyById = db.prepare('SELECT name_id FROM kb_names WHERE name_id = ? LIMIT 1');
  const findPartyByName = db.prepare(
    `SELECT name_id
     FROM kb_names
     WHERE lower(trim(full_name)) = lower(trim(?))
     LIMIT 1`
  );
  const insertParty = db.prepare(
    `INSERT INTO kb_names (full_name, phone_number, address, name_gstin_number, name_state, name_type, name_is_active)
     VALUES (@name, @phone, @address, @gst_number, @state_of_supply, 1, 1)`
  );
  const patchParty = db.prepare(
    `UPDATE kb_names
     SET date_modified = CURRENT_TIMESTAMP,
         phone_number = CASE WHEN trim(COALESCE(phone_number, '')) = '' AND trim(COALESCE(@phone, '')) <> '' THEN @phone ELSE phone_number END,
         address = CASE WHEN trim(COALESCE(address, '')) = '' AND trim(COALESCE(@address, '')) <> '' THEN @address ELSE address END,
         name_gstin_number = CASE WHEN trim(COALESCE(name_gstin_number, '')) = '' AND trim(COALESCE(@gst_number, '')) <> '' THEN @gst_number ELSE name_gstin_number END,
         name_state = CASE WHEN trim(COALESCE(name_state, '')) = '' AND trim(COALESCE(@state_of_supply, '')) <> '' THEN @state_of_supply ELSE name_state END
     WHERE name_id = @party_id`
  );

  const findItemById = db.prepare('SELECT item_id FROM kb_items WHERE item_id = ? LIMIT 1');
  const findItemByName = db.prepare(
    `SELECT item_id
     FROM kb_items
     WHERE lower(trim(item_name)) = lower(trim(?))
     LIMIT 1`
  );
  const insertItem = db.prepare(
    `INSERT INTO kb_items (
        item_name,
        item_hsn_sac_code,
        item_sale_unit_price,
        item_purchase_unit_price,
        item_tax_id,
        category_id
     )
     VALUES (@name, @hsn, @base_rate, @base_rate, @tax_id, @category_id)`
  );
  const patchItem = db.prepare(
    `UPDATE kb_items
     SET item_date_modified = CURRENT_TIMESTAMP,
         item_hsn_sac_code = CASE WHEN trim(COALESCE(@hsn, '')) <> '' THEN @hsn ELSE item_hsn_sac_code END,
         item_sale_unit_price = CASE WHEN @sale_rate > 0 THEN @sale_rate ELSE item_sale_unit_price END,
         item_tax_id = CASE WHEN @tax_id IS NOT NULL THEN @tax_id ELSE item_tax_id END
     WHERE item_id = @item_id`
  );
  const findTaxByRate = db.prepare('SELECT tax_code_id FROM kb_tax_code WHERE tax_rate = ? LIMIT 1');
  const findTaxByName = db.prepare(
    'SELECT tax_code_id, tax_rate FROM kb_tax_code WHERE tax_code_name = ? LIMIT 1'
  );
  const patchTaxRate = db.prepare(
    'UPDATE kb_tax_code SET tax_rate = ?, tax_code_date_modified = CURRENT_TIMESTAMP WHERE tax_code_id = ?'
  );
  const insertTax = db.prepare(
    `INSERT OR IGNORE INTO kb_tax_code (tax_code_name, tax_rate, tax_code_type, tax_rate_type)
     VALUES (?, ?, 0, 4)`
  );
  const hasItemCategoryTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kb_item_categories' LIMIT 1")
    .get();
  const findAnyCategoryId = hasItemCategoryTable
    ? db.prepare('SELECT item_category_id FROM kb_item_categories ORDER BY item_category_id ASC LIMIT 1')
    : null;
  const findCategoryByName = hasItemCategoryTable
    ? db.prepare('SELECT item_category_id FROM kb_item_categories WHERE item_category_name = ? LIMIT 1')
    : null;
  const insertCategory = hasItemCategoryTable
    ? db.prepare('INSERT OR IGNORE INTO kb_item_categories (item_category_name) VALUES (?)')
    : null;
  const resolveCategoryId = () => {
    if (!hasItemCategoryTable) return null;
    const existing = findAnyCategoryId.get();
    if (existing) return existing.item_category_id;
    const name = 'General';
    insertCategory.run(name);
    const created = findCategoryByName.get(name);
    return created ? created.item_category_id : null;
  };

  const ensureTaxId = (rateValue) => {
    const rate = Number(rateValue || 0);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const existing = findTaxByRate.get(rate);
    if (existing) return existing.tax_code_id;
    const taxName = `GST@${rate}%`;
    insertTax.run(taxName, rate);
    const inserted = findTaxByRate.get(rate);
    if (inserted) return inserted.tax_code_id;
    const byName = findTaxByName.get(taxName);
    if (byName) {
      if (Number(byName.tax_rate || 0) !== rate) {
        patchTaxRate.run(rate, byName.tax_code_id);
      }
      return byName.tax_code_id;
    }
    return null;
  };

  return db.transaction(() => {
    const buyerIdFromPayload =
      payload?.party_id ?? rawBuyer?.id ?? rawBuyer?.party_id ?? null;
    const buyerName =
      String(
        rawBuyer?.name ||
          rawBuyer?.full_name ||
          payload?.party_name ||
          payload?.buyer_name ||
          ''
      ).trim();
    if (!buyerIdFromPayload && !buyerName) {
      throw new Error('Buyer (party) is required.');
    }
    let partyId = null;
    if (buyerIdFromPayload !== null && buyerIdFromPayload !== undefined) {
      const found = findPartyById.get(Number(buyerIdFromPayload));
      if (found) partyId = Number(found.name_id);
    }
    if (!partyId && buyerName) {
      const found = findPartyByName.get(buyerName);
      if (found) partyId = Number(found.name_id);
    }
    if (!partyId) {
      partyId = Number(
        insertParty.run({
          name: buyerName,
          phone: String(rawBuyer?.phone || payload?.buyer_phone || '').trim(),
          address: String(rawBuyer?.address || payload?.buyer_address || '').trim(),
          gst_number: String(rawBuyer?.gst_number || rawBuyer?.name_gstin_number || '').trim(),
          state_of_supply: String(rawBuyer?.state_of_supply || rawBuyer?.name_state || '').trim()
        }).lastInsertRowid
      );
    } else {
      patchParty.run({
        party_id: partyId,
        phone: String(rawBuyer?.phone || payload?.buyer_phone || '').trim(),
        address: String(rawBuyer?.address || payload?.buyer_address || '').trim(),
        gst_number: String(rawBuyer?.gst_number || rawBuyer?.name_gstin_number || '').trim(),
        state_of_supply: String(rawBuyer?.state_of_supply || rawBuyer?.name_state || '').trim()
      });
    }

    const normalizedItems = rawItems.map((line) => {
      const qty = Number(line.qty ?? line.quantity ?? 0);
      const amount = Number(line.amount ?? line.total_amount ?? 0);
      const fallbackRate = qty > 0 && amount > 0 ? amount / qty : 0;
      const rate = Number(line.rate ?? line.priceperunit ?? fallbackRate ?? 0);
      const gstRate = Number(line.gst_rate ?? line.gst ?? line.tax_rate ?? 0);
      const hsn = String(line.hsn || line.hsn_sac_code || '').trim();
      const itemName = String(line.item_name || line.name || '').trim();
      const itemIdRaw = line.item_id ?? line.id ?? null;
      let itemId = null;
      if (itemIdRaw !== null && itemIdRaw !== undefined) {
        const foundById = findItemById.get(Number(itemIdRaw));
        if (foundById) itemId = Number(foundById.item_id);
      }
      if (!itemId && itemName) {
        const foundByName = findItemByName.get(itemName);
        if (foundByName) itemId = Number(foundByName.item_id);
      }
      if (!itemId) {
        if (!itemName) {
          throw new Error('Item name is required for new items.');
        }
        const categoryId = resolveCategoryId();
        itemId = Number(
          insertItem.run({
            name: itemName,
            hsn,
            base_rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
            tax_id: ensureTaxId(gstRate),
            category_id: categoryId
          }).lastInsertRowid
        );
      } else {
        patchItem.run({
          item_id: itemId,
          hsn,
          sale_rate: Number.isFinite(rate) ? rate : 0,
          tax_id: ensureTaxId(gstRate)
        });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(`Invalid quantity for item ${itemName || itemId}.`);
      }
      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error(`Invalid rate for item ${itemName || itemId}.`);
      }

      return {
        item_id: itemId,
        unit_id: line.unit_id ?? null,
        hsn,
        batch_no: normalizeBatchValue(line.batch_no || line.batch || ''),
        expiry_date: normalizeDateValue(line.expiry_date || line.expiry || ''),
        mrp: line.mrp ?? null,
        gst_rate: Number.isFinite(gstRate) ? gstRate : 0,
        qty,
        rate
      };
    });

    const placeOfSupply =
      String(rawBill?.place_of_supply || payload?.place_of_supply || rawBuyer?.state_of_supply || '').trim();
    const orderPayload = {
      order_type: 'sale',
      party_id: partyId,
      order_date: String(rawBill?.order_date || rawBill?.bill_date || payload?.order_date || '').trim(),
      invoice_no: String(rawBill?.invoice_no || rawBill?.bill_no || payload?.invoice_no || '').trim(),
      notes: String(rawBill?.notes || payload?.notes || '').trim(),
      place_of_supply: placeOfSupply,
      balance_amount: Number(rawBill?.balance_amount ?? payload?.balance_amount ?? 0),
      items: normalizedItems
    };
    if (!orderPayload.order_date) {
      const now = new Date();
      orderPayload.order_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    const createdOrder = createOrder(orderPayload);
    return {
      order: createdOrder,
      party_id: partyId,
      items_count: normalizedItems.length
    };
  })();
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
    'kb_item_stock_tracking',
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
  getItemDetails,
  listUnits,
  listTaxCodes,
  upsertItem,
  listBatches,
  listBatchAvailability,
  exportDatabase,
  upsertBatch,
  listPartyRates,
  listPartyRatesForOrder,
  upsertPartyRate,
  listOrders,
  listGstr1SalesReport,
  getOrder,
  listOrderItems,
  createOrder,
  updateOrder,
  deleteOrder,
  importPurchaseBillFromOcr,
  importSaleBillFromOcr,
  importFromVyaparDump,
  importFromVyaparSqlite,
  getDbInfo,
  getOrdersDiagnostics
};
