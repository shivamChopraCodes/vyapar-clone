# Bulk Sales Order Generation — Design Approach

## Goal
Allow users to generate multiple sales orders in bulk by supplying:
- A party (customer)
- Number of invoices and date per invoice, or explicit invoice numbers and dates
- Total amount per invoice (optional)

The system should:
- Create sales orders for the specified dates and invoice numbers
- Auto-fill items and batches using purchase availability **up to each sale date**
- Reuse last known sales rates for items when available
- Adjust quantities so invoice totals match the desired amounts (cumulative fill)

## User Inputs
Minimum required:
- Party (customer)
- One of:
  - `count + dates[]` (count must match number of dates)
  - `invoices[]` with `{invoice_no, date}` entries
- Optional:
  - `total_amount` per invoice
  - Amount basis toggle: pre-tax or post-tax
  - `notes` or tags
  - Optional item filters:
    - `items_include[]`
    - `items_exclude[]`

Example input:
```
party_id: 123
invoices: [
  { invoice_no: "S-1001", date: "2026-02-14", total_amount: 4500, amount_basis: "pre_tax" },
  { invoice_no: "S-1002", date: "2026-02-16", total_amount: 3200, amount_basis: "post_tax" }
]
items_include: [101, 205, 333]
items_exclude: [404]
```

## Data Sources
- `kb_transactions` (sales + purchase orders)
- `kb_lineitems`
- `kb_items`
- `kb_item_stock_tracking`
- `kb_party_item_rate` (if used for last known sales rates)

## Core Rules
1. **Party selection**: All orders belong to the selected party.
2. **Invoice date constraint**: For a sales order dated `D`, only batches from purchases **on or before D** are eligible.
3. **Batch availability**: Available qty is computed from historical purchases - sales up to that date.
4. **Pricing**: Prefer last known sales rate for each item (from most recent sales order for that party; if none, from any sale for that item).
5. **Invoice total**: If total amount is provided, quantities should be adjusted to reach that total as closely as possible.
6. **Negative stock**: Allowed, but should be flagged if availability is insufficient for the required qty.
7. **Minimum item count**: Ensure at least 4 items per invoice (if possible).

## Assumptions
- Sales orders should not alter historical availability calculations for earlier invoices.
- Batch FIFO is based on purchase transaction date (tie-breaker: transaction id).
- If invoice numbers are not provided, they are auto-generated using the existing sales order numbering scheme.

## Availability Computation (as-of date)
For each item and batch:
- `purchase_qty = sum(qty) for purchases where txn_date <= D`
- `sale_qty = sum(qty) for sales where txn_date < D` (or `<= D` depending on business rule)
- `available_qty = purchase_qty - sale_qty`

Batch selection is constrained to those with purchase dates `<= D`.

## Rate Selection Strategy
1. If party-specific rate exists (last sales order with same party and item), use it.
2. Else, if item appears in any other sales order, use that last known rate.
3. Else, fall back to item base rate.
4. If invoice total needs adjustment, allow rate variance within ±10–20% to hit target.

## Item & Batch Filling Algorithm (per invoice)
High-level flow:
1. Determine eligible batches and availability as-of invoice date.
2. Select candidate items (input-controlled):
   - If `items_include[]` is provided, only use those items.
   - If `items_exclude[]` is provided, remove those items.
   - If neither is provided, randomly sample from available items.
3. Ensure at least 4 distinct items are chosen if possible.
4. For each candidate item:
   - Pick batch using FIFO (oldest purchase date first).
   - Apply rate from last sales order or item base rate.
   - Add qty until:
     - Batch availability is exhausted, or
     - Invoice total is reached.
5. Continue with next batch or item until total is matched or candidates exhausted.

If total amount is **not** provided:
- Use default qty per item (configurable), or
- Use available qty (configurable).

If total amount **is** provided:
- Respect `amount_basis`:
  - `pre_tax`: compute line items to match pre-tax total, then add tax.
  - `post_tax`: compute line items so totals (including tax) match the amount.
- Adjust final line quantity or rate within ±10–20% to match remaining amount (last line acts as balancing line).

## Handling Insufficient Stock
If available stock is insufficient:
- Allow negative stock by creating line items anyway.
- Flag order with a warning field (for UI notification).

## Generator Steps (Deterministic)
1. Normalize inputs into a list of `{date, invoice_no?, total_amount?, amount_basis?}`.
2. Resolve party and candidate item set.
3. For each invoice (sorted by date asc):
   - Build availability snapshot as-of date.
   - Select items (respect include/exclude; random sample with stable seed to keep outputs reproducible).
   - Construct line items using FIFO batch selection.
   - Balance to target amount if provided.
   - Validate totals and minimum item count.
4. Persist orders and line items in a single transaction per invoice.

## Persistence Plan
Create each sales order as a normal order:
- Insert into `kb_transactions`
- Insert line items into `kb_lineitems`
- Decrement stock tracking via existing sales flow

## Validation & Safety
Before committing:
- Verify invoice date format
- Verify party exists
- Verify invoice numbers are unique (or auto-generate)
- Validate computed totals vs provided totals (log warning if mismatch)

## Error Reporting
- Return per-invoice errors without aborting the whole batch.
- Include warnings for:
  - Negative stock
  - Invoice total mismatch beyond tolerance
  - Insufficient unique items to reach minimum count

## UI/UX Sketch
Bulk Sales Order screen:
- Party selector
- Input mode toggle:
  - Dates only (auto invoice numbers)
  - Invoice numbers + dates
- Optional total amount per invoice
- Amount basis toggle (pre-tax or post-tax)
- Item filters:
  - Include list
  - Exclude list
- “Preview” button to show generated line items per invoice
- “Generate” button to commit

## Open Questions
No open questions. Requirements are defined.

## Next Steps
1. Confirm input structure and UI flow.
2. Decide batch selection strategy (FIFO vs max-availability).
3. Implement availability query as-of date.
4. Implement generator and preview API.
5. Add preview warnings (negative stock, totals mismatch).
