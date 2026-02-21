# Vyapar DB Architecture (vyapar-clone)

This document describes the **SQLite schema** used by the app, how features map to tables/columns, and how transactions flow through the system.

## Database Location

Primary DB path (Electron):
- `~/Library/Application Support/vyapar-clone/vyapar.db`

Override:
- `VYAPAR_DB_PATH=/path/to/your.db`

## Core Tables

### Parties (Customers/Suppliers)
**Table:** `kb_names`

Key columns:
- `name_id` (PK)
- `full_name`
- `phone_number`
- `address`
- `name_gstin_number`
- `name_is_active`

Used by:
- Parties screen
- Orders (via `kb_transactions.txn_name_id`)
- Party-wise rates (`kb_party_item_rate.party_item_rate_party_id`)

### Items
**Table:** `kb_items`

Key columns:
- `item_id` (PK)
- `item_name`
- `item_hsn_sac_code`
- `item_sale_unit_price`
- `item_purchase_unit_price`
- `item_stock_quantity`
- `item_min_stock_quantity`
- `item_tax_id` (FK → `kb_tax_code.tax_code_id`)

Used by:
- Items screen
- Orders line items (`kb_lineitems.item_id`)
- Party-wise rates (`kb_party_item_rate.party_item_rate_item_id`)

### GST / Tax Codes
**Table:** `kb_tax_code`

Key columns:
- `tax_code_id` (PK)
- `tax_code_name`
- `tax_rate`

Used by:
- Item GST (`kb_items.item_tax_id`)
- Line item GST (`kb_lineitems.lineitem_tax_id`)

### Party-wise Item Rates
**Table:** `kb_party_item_rate`

Key columns:
- `party_item_rate_id` (PK)
- `party_item_rate_party_id` → `kb_names.name_id`
- `party_item_rate_item_id` → `kb_items.item_id`
- `party_item_rate_sale_price`
- `party_item_rate_purchase_price`
- Unique: (`party_item_rate_item_id`, `party_item_rate_party_id`)

Used by:
- Parties screen rate matrix

### Transactions (Orders)
**Table:** `kb_transactions`

Key columns:
- `txn_id` (PK)
- `txn_type` (1 = Sale, 3 = Purchase)
- `txn_name_id` → `kb_names.name_id`
- `txn_date`
- `txn_description` (notes)
- `txn_status`
- `txn_payment_status`
- `txn_tax_inclusive`

Used by:
- Orders listing
- Links to line items (`kb_lineitems.lineitem_txn_id`)

### Transaction Line Items
**Table:** `kb_lineitems`

Key columns:
- `lineitem_id` (PK)
- `lineitem_txn_id` → `kb_transactions.txn_id`
- `item_id` → `kb_items.item_id`
- `quantity`
- `priceperunit`
- `total_amount`
- `lineitem_tax_id` → `kb_tax_code.tax_code_id`
- `lineitem_batch_number`
- `lineitem_expiry_date`
- `lineitem_mrp` (if present in source data)

Used by:
- Order line items view
- Batch/expiry display for items (derived from transaction lines)

### Company Setup
**Table:** `kb_firms`

Key columns:
- `firm_id` (PK)
- `firm_name`
- `firm_address`
- `firm_phone`
- `firm_gstin_number`
- `firm_description`
- `firm_drug_license`
- `firm_other_details`

Used by:
- Company Setup screen

## Transaction Scheme (End-to-End)

1. **Create Order**
   - Insert into `kb_transactions` with:
     - `txn_type` (1 sale / 3 purchase)
     - `txn_name_id` (party)
     - `txn_date`
     - `txn_description`
2. **Add Line Items**
   - For each item:
     - Insert into `kb_lineitems` with:
       - `lineitem_txn_id` (order id)
       - `item_id`
       - `quantity`, `priceperunit`, `total_amount`
       - `lineitem_tax_id` (from `kb_items.item_tax_id`)
       - Optional: `lineitem_batch_number`, `lineitem_expiry_date`, `lineitem_mrp`
3. **Order Totals**
   - Order total is computed as:
     - `SUM(kb_lineitems.total_amount)` per transaction

4. **Edit Order**
   - Update `kb_transactions` fields:
     - `txn_type`, `txn_name_id`, `txn_date`, `txn_description`
   - Replace line items:
     - Delete existing `kb_lineitems` for the transaction
     - Insert updated line items with `item_id`, `quantity`, `priceperunit`, `total_amount`, `lineitem_tax_id`

## Inventory Notes

- The schema includes `kb_items.item_stock_quantity` and `item_min_stock_quantity`.
- The current app does not mutate stock directly; batch-like views are derived from `kb_lineitems`.

## Common Queries

Orders with totals:
```
SELECT t.txn_id, t.txn_type, t.txn_date, t.txn_description, n.full_name,
       COALESCE(SUM(l.total_amount), 0) as total_amount
FROM kb_transactions t
LEFT JOIN kb_names n ON n.name_id = t.txn_name_id
LEFT JOIN kb_lineitems l ON l.lineitem_txn_id = t.txn_id
WHERE t.txn_type IN (1, 3)
GROUP BY t.txn_id
ORDER BY t.txn_id DESC;
```

Order line items:
```
SELECT l.lineitem_id, i.item_name, l.quantity, l.priceperunit, l.total_amount,
       l.lineitem_batch_number, l.lineitem_expiry_date, t.tax_rate
FROM kb_lineitems l
LEFT JOIN kb_items i ON i.item_id = l.item_id
LEFT JOIN kb_tax_code t ON t.tax_code_id = l.lineitem_tax_id
WHERE l.lineitem_txn_id = ?
ORDER BY l.lineitem_id ASC;
```
