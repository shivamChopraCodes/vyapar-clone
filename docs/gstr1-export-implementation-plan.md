# GSTR-1 Export Implementation Plan (Phase 1 and Phase 2)

## Objective
Implement full multi-tab GSTR-1 workbook export from the app, with reliable GST classification, reconciliation checks, and production-ready sheet formatting.

## Current Baseline
- UI export trigger: `src/renderer/pages/Reports.jsx`
- Backend sales report source: `src/main/db.js` (`listGstr1SalesReport`)
- XLSX writer (single-sheet): `src/renderer/utils/xlsxExport.js`

---

## Phase 1: Functional Multi-Tab Export

### Scope
- Deliver all required tabs with accurate data and totals:
  - `GSTR1 Report`
  - `b2b,sez,de`
  - `b2cl`
  - `b2cs`
  - `cdnr`
  - `cdnur`
  - `exp`
  - `at`
  - `atadj`
  - `exemp`
  - `hsn(b2b)`
  - `hsn(b2c)`
  - `itemSummary`
  - `docs`
- Use correct GST grouping and tab routing rules.
- Include validation output (warnings) for reconciliation issues.

### Backend Changes (`src/main/db.js`)
1. Add a new builder function (or extend existing):
   - Input: `from_date`, `to_date`
   - Output:
     - `company` metadata
     - `tabs` object with rows for each GSTR-1 tab
     - `validations` array
2. Build a normalized invoice-line dataset:
   - Join transactions, line items, parties, tax codes, items.
   - Include per-line tax rate, taxable, tax amount, party GSTIN, place of supply, HSN/SAC, quantity/UQC.
3. Apply classification logic:
   - B2B if party GSTIN exists.
   - B2CS/B2CL for unregistered invoices per threshold + interstate logic.
   - Empty tabs must still export header/summary rows.
4. Build HSN summaries:
   - `hsn(b2b)`, `hsn(b2c)`, and item-level `itemSummary`.
5. Build `docs` summary:
   - Invoice count, cancelled count, serial from/to, and detect sequence gaps.
6. Add validation checks:
   - Taxable cross-check: B2B + B2CS + B2CL vs item summary.
   - Tax cross-check: IGST/CGST/SGST totals vs component totals.
   - Serial checks: gaps/missing invoice numbers.

### XLSX Export Changes (`src/renderer/utils/xlsxExport.js`)
1. Refactor workbook writer to support multiple sheets.
2. Add API:
   - `buildGstr1WorkbookBlob({ sheets })`
   - Each sheet receives `name` + `rows`.
3. Preserve tab order and exact names.
4. Keep values numeric where needed; headers/text as inline string.

### UI/IPC Changes
1. `src/main/main.js`:
   - Update `report:gstr1Sales` handler to return the expanded payload.
2. `src/preload/preload.js`:
   - Keep same IPC method, but update expected response type.
3. `src/renderer/pages/Reports.jsx`:
   - Consume `tabs` and `validations`.
   - Show warning banner if reconciliation issues are present.
   - Download workbook with all sheets.

### Phase 1 Deliverables
- Multi-sheet XLSX generation working end-to-end.
- All 14 tabs present and populated.
- Validation warnings shown in report screen.
- No styling requirements beyond readable structure.

### Phase 1 Acceptance Criteria
- Workbook opens in Excel/Sheets without repair prompt.
- Tab names and order match required list exactly.
- Key totals reconcile (except known ±0.01 rounding cases).
- Empty sections export with correct header blocks.

---

## Phase 2: Quality, Formatting, and Hardening

### Scope
- Improve output readability and trustworthiness.
- Add automated regression checks and edge-case handling.

### Formatting and UX
1. Add workbook polish:
   - Column widths per tab.
   - Header emphasis (bold-like style where possible in current writer; if not, migrate to a full XLSX lib).
   - Freeze first header row for large tabs.
2. Improve report preview in UI:
   - Tab-level totals card.
   - Validation severity labels (`error`, `warning`, `info`).

### Data Quality and Rules Hardening
1. Add stricter place-of-supply normalization:
   - State code/state name mapping.
2. Add configurable GST thresholds/rules:
   - Future-proof B2CL/B2CS logic.
3. Add explicit rounding strategy:
   - Round only at defined stages to reduce drift.
4. Improve document series logic:
   - Handle multiple invoice prefixes/series blocks.

### Testing and Observability
1. Add fixture-based tests:
   - Golden comparison for sheet names, header rows, key totals.
2. Add reconciliation unit tests:
   - B2B/B2C/HSN/doc checks with synthetic datasets.
3. Add export diagnostics:
   - Log generation duration and row counts per tab.

### Phase 2 Deliverables
- Formatted workbook output suitable for external sharing.
- Automated regression test coverage for report correctness.
- Stable handling of edge cases and future rule changes.

### Phase 2 Acceptance Criteria
- Consistent output across repeated runs for same input.
- Known edge cases pass test suite.
- Validation issues are visible and actionable in UI.

---

## Suggested Execution Order
1. Implement backend normalized dataset + classification.
2. Implement multi-sheet writer.
3. Wire UI download flow to new payload.
4. Add reconciliation warnings.
5. Add formatting and tests (Phase 2).

## Risks and Mitigations
- Risk: GST classification ambiguity from missing party data.
  - Mitigation: fallback rules + warning logs.
- Risk: rounding differences across summaries.
  - Mitigation: single shared rounding utility and test assertions with tolerance.
- Risk: custom XLSX writer feature limits for styling.
  - Mitigation: keep Phase 1 functional; evaluate migration in Phase 2 if needed.
