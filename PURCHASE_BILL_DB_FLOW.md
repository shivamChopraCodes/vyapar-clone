# Purchase Bill DB Flow (Vyapar Clone)

This document captures how purchase bills are represented in the current database, what is missing in current app logic, and how to correctly push OCR-extracted bill data (item, batch, expiry, HSN, qty, amount) into DB while updating stock.

## Scope Reviewed

- Database file reviewed: `vyapar_db__t_2024_02_17_22_38_47_hy7m2.sql` (SQLite DB file)
- App logic reviewed: `src/main/db.js`

## Key Findings

1. Current order create/update logic writes only:
- `kb_transactions`
- `kb_lineitems`

2. Current order create/update logic does **not** update:
- `kb_item_stock_tracking` (batch-level stock)
- `kb_items.item_stock_quantity` (item-level stock total)

3. No DB trigger was found to auto-sync stock from line items, so stock mutation must be done in app code.

4. HSN is stored at item-master level:
- `kb_items.item_hsn_sac_code`
- Not in `kb_lineitems`

## Relevant Tables

### `kb_transactions` (bill header)
- `txn_id` (PK)
- `txn_type` (app maps purchase to `3`, sale to `1`)
- `txn_name_id` (party/supplier)
- `txn_date`
- `txn_ref_number_char` (invoice number)
- `txn_cash_amount`, `txn_balance_amount`
- `txn_description`

### `kb_lineitems` (bill lines)
- `lineitem_txn_id` -> `kb_transactions.txn_id`
- `item_id` -> `kb_items.item_id`
- `quantity`
- `priceperunit`
- `total_amount`
- `lineitem_tax_id`
- `lineitem_batch_number`
- `lineitem_expiry_date`
- `lineitem_mrp`
- `lineitem_ist_id` -> `kb_item_stock_tracking.ist_id`

### `kb_items` (item master)
- `item_id`
- `item_name`
- `item_hsn_sac_code`
- `item_purchase_unit_price`
- `item_stock_quantity` (aggregate stock)
- `item_tax_id`

### `kb_item_stock_tracking` (batch stock)
- `ist_id`
- `ist_item_id` -> `kb_items.item_id`
- `ist_batch_number`
- `ist_expiry_date`
- `ist_mrp`
- `ist_current_quantity`
- `ist_opening_quantity`

## Purchase Bill Ingestion from Image (Expected DB Flow)

When user shares purchase bill image and OCR extracts item name, batch, expiry, HSN, qty, amount:

1. Resolve/Create Supplier
- Find supplier in `kb_names` by normalized name (and optionally phone/GSTIN).
- Insert if not found.

2. Resolve/Create Item
- Find item in `kb_items` by reliable key (`item_code`) or normalized `item_name`.
- If not found, insert new item with:
  - `item_name`
  - `item_hsn_sac_code` (from OCR)
  - `item_purchase_unit_price` (from bill rate)
  - `item_tax_id` (derived from GST)
- If found and OCR HSN is trusted, update `item_hsn_sac_code` when missing/outdated.

3. Create Purchase Header
- Insert into `kb_transactions`:
  - `txn_type = 3`
  - `txn_name_id = supplier_id`
  - `txn_date = bill_date`
  - `txn_ref_number_char = supplier_invoice_no`
  - totals (`txn_cash_amount`, `txn_balance_amount`)

4. For Each OCR Bill Line
- Upsert/find batch row in `kb_item_stock_tracking` using:
  - `ist_item_id`
  - `ist_batch_number`
  - `ist_expiry_date`
  - `ist_mrp` (optional but recommended for uniqueness in practice)
- If row exists: increase `ist_current_quantity += qty`
- If row does not exist: insert row with `ist_current_quantity = qty`, `ist_opening_quantity = qty`
- Insert into `kb_lineitems` with:
  - `lineitem_txn_id = txn_id`
  - `item_id`
  - `quantity`, `priceperunit`, `total_amount`
  - `lineitem_batch_number`, `lineitem_expiry_date`, `lineitem_mrp`
  - `lineitem_ist_id = ist_id` (from stock tracking row)
- Update item-level stock:
  - `kb_items.item_stock_quantity += qty`

5. Commit as Single SQL Transaction
- Wrap full bill write in one DB transaction.
- Roll back fully if any line fails.

## Minimal Pseudocode (Atomic Write)

```sql
BEGIN;

-- 1) insert kb_transactions -> :txn_id

-- 2) for each bill line
-- 2a) resolve/insert item -> :item_id
-- 2b) upsert stock tracking row -> :ist_id
-- 2c) update kb_item_stock_tracking.ist_current_quantity += :qty
-- 2d) insert kb_lineitems with lineitem_ist_id = :ist_id
-- 2e) update kb_items.item_stock_quantity += :qty

COMMIT;
```

## Current Code Gap (Actionable)

In current `src/main/db.js`:
- `createOrder()` and `updateOrder()` insert/update transaction + lines.
- They do not perform batch stock upsert or item stock increments/decrements.

So image-to-purchase-bill ingestion is incomplete until stock update logic is added.

## Implementation Status

Implemented in code:
- Purchase create/update now mutates:
  - `kb_item_stock_tracking.ist_current_quantity`
  - `kb_items.item_stock_quantity`
  - `kb_lineitems.lineitem_ist_id`
- Batch upsert API now supported (`upsertBatch`).
- OCR purchase import service added:
  - DB function: `importPurchaseBillFromOcr(payload)`
  - IPC channel: `order:importPurchaseBillOcr`
  - Preload API: `window.vyapar.importPurchaseBillOcr(payload)`

## OCR Import Payload (Supported)

```json
{
  "supplier": {
    "id": 123,
    "name": "ABC Pharma",
    "phone": "9999999999",
    "gst_number": "07ABCDE1234F1Z5",
    "address": "Delhi",
    "state_of_supply": "Delhi"
  },
  "bill": {
    "order_date": "2026-02-26",
    "invoice_no": "INV-778",
    "notes": "OCR import",
    "place_of_supply": "Delhi",
    "balance_amount": 0
  },
  "items": [
    {
      "item_id": 10,
      "item_name": "Paracetamol 650",
      "hsn": "3004",
      "gst_rate": 12,
      "qty": 20,
      "rate": 45,
      "batch_no": "B-1001",
      "expiry_date": "2028-06-01",
      "mrp": 60
    }
  ]
}
```

Behavior:
- Supplier: resolve by `supplier.id`, else by exact trimmed name, else create.
- Item: resolve by `item_id`, else by exact trimmed name, else create.
- Existing item gets patched with OCR HSN/GST/purchase rate.
- Then a purchase order is created atomically with stock/batch updates.

## Data Quality Notes for OCR Bills

- Normalize item names before matching (`trim`, case-fold, collapse spaces).
- Validate expiry parsing to consistent date format (`YYYY-MM-DD`).
- Treat missing batch as explicit empty batch token only if business allows it.
- Keep confidence thresholds:
  - low confidence -> queue for manual review
  - high confidence -> auto-post

## Safety Checks Before Production

- Confirm transaction type semantics (`txn_type=3` purchase) on live DB.
- Add idempotency key per imported bill to avoid duplicate posting.
- Add reconciliation query:
  - sum of batch stock per item vs `kb_items.item_stock_quantity`
  - flag mismatches for repair.
