# GSTR-1 Multi-Sheet Report — Implementation Plan

Generate a full GSTR-1 Excel report matching the reference file's 14-sheet structure, using only existing database schema. Sheets that require new schema (cdnr, cdnur, exp, at, atadj) will be included as **empty placeholder sheets** with correct headers to maintain structural compatibility.

## Proposed Changes

### Backend — Data Layer

#### [MODIFY] [db.js](file:///Users/shivam/Documents/vyapar-clone/src/main/db.js)

Replace the current `listGstr1SalesReport` function (lines 1293–1379) with a new `buildGstr1FullReport` function that returns **all data sections** in a single response:

```js
// Returns { company, mainRows, b2bRows, b2clRows, b2cs, hsnB2B, hsnB2C, itemSummary, exemp, docs }
```

**Key queries to add:**

1. **Line-item-level query** — Extend the existing query to also return per-line-item: `item_hsn_sac_code`, `unit_short_name`, `quantity`, `item_name`. Currently the query groups by `(txn_id, gst_rate)` which loses item detail needed for HSN sheets. A new second query will fetch ungrouped line items.

2. **B2B / B2C classification** — Split existing rows:
   - `b2b`: `party_gstin IS NOT NULL AND party_gstin != ''`
   - `b2cl`: no GSTIN + inter-state + invoice_value > 250000
   - `b2cs`: everything else (aggregate by `place_of_supply, rate`)

3. **HSN aggregation** — Group line items by `(hsn, uqc, rate)`:
   - `hsn(b2b)` — line items from B2B invoices
   - `hsn(b2c)` — line items from non-B2B invoices
   - `itemSummary` — all line items combined

4. **UQC mapping** — Map `unit_short_name` → GST UQC format:
   | DB Unit | UQC Code |
   |---------|----------|
   | `PCS` / `Pcs` | `PCS-PIECES` |
   | `PAC` / `Pack` | `PAC-PACKS` |
   | `ROL` / `Roll` | `ROL-ROLLS` |
   | *(fallback)* | `OTH-OTHERS` |

5. **Exemp** — Query for 0% GST sales, cross with inter/intra-state and registered/unregistered.

6. **Docs** — `SELECT MIN(txn_ref_number_char), MAX(txn_ref_number_char), COUNT(*)` for the period.

**Export the new function** alongside the existing one (keep backward compat):
```js
module.exports = { ..., buildGstr1FullReport };
```

---

### Backend — IPC Wiring

#### [MODIFY] [main.js](file:///Users/shivam/Documents/vyapar-clone/src/main/main.js)

Add one new IPC handler at line ~111:
```js
ipcMain.handle('report:gstr1Full', async (_event, range) => db.buildGstr1FullReport(range || {}));
```

#### [MODIFY] [preload.js](file:///Users/shivam/Documents/vyapar-clone/src/preload/preload.js)

Add one new API method:
```js
getGstr1FullReport: (range) => ipcRenderer.invoke('report:gstr1Full', range),
```

---

### Frontend — XLSX Export

#### [MODIFY] [xlsxExport.js](file:///Users/shivam/Documents/vyapar-clone/src/renderer/utils/xlsxExport.js)

**Replace** `buildGstr1WorkbookBlob(rows)` with `buildGstr1MultiSheetBlob(sheets)`:

The function will accept an array of `{ name, rows }` objects instead of a single 2D array. Changes needed:

1. **`buildSheetXml(rows)`** — No change (already handles generic 2D arrays).

2. **New function `buildMultiSheetWorkbook(sheets)`**:
   - Generate `sheet{N}.xml` for each sheet
   - Build `[Content_Types].xml` with an `<Override>` for each sheet
   - Build `xl/workbook.xml` with `<sheet>` entries for each
   - Build `xl/_rels/workbook.xml.rels` with relationship entries for each
   - Zip them all together using the existing `zipStore`

3. **Keep** `buildGstr1WorkbookBlob` as a thin wrapper for backward compat.

---

### Frontend — Report Builder

#### [MODIFY] [Reports.jsx](file:///Users/shivam/Documents/vyapar-clone/src/renderer/pages/Reports.jsx)

Update the `downloadReport` function to:

1. Call `window.vyapar.getGstr1FullReport(range)` instead of `getGstr1SalesReport(range)`
2. Build 14 sheet data arrays from the response
3. Use the new `buildGstr1MultiSheetBlob(sheets)` for export

**Sheet assembly** (all done in the renderer — the backend returns classified raw data, the renderer formats rows into the sheet structure matching the reference):

| Sheet | Data Source | Format |
|-------|------------|--------|
| `GSTR1 Report` | `mainRows` | Header meta + data rows + **total row** |
| `b2b,sez,de` | `b2bRows` | Summary band + header + data |
| `b2cl` | `b2clRows` | Summary band + header + data |
| `b2cs` | `b2cs` (aggregated) | Summary band + header + data |
| `cdnr` | *(empty)* | Headers only |
| `cdnur` | *(empty)* | Headers only |
| `exp` | *(empty)* | Headers only |
| `at` | *(empty)* | Headers only |
| `atadj` | *(empty)* | Headers only |
| `exemp` | `exemp` | 4-row fixed structure |
| `hsn(b2b)` | `hsnB2B` | Summary band + header + data |
| `hsn(b2c)` | `hsnB2C` | Summary band + header + data |
| `itemSummary` | `itemSummary` | Summary band + header + data |
| `docs` | `docs` | Summary band + header + data |

> [!NOTE]
> The preview table in the UI will continue to use the existing `mainRows` (same data as today). Only the download output changes to multi-sheet.

---

## Open Questions

> [!IMPORTANT]
> **Invoice Value rounding**: The reference file shows whole-number invoice values (e.g. `362`, `13067`). The current code computes `taxable + tax` which gives decimals. Should we round invoice values to the nearest integer in the report? The reference seems to do this.

---

## Verification Plan

### Automated Tests
1. Download the generated XLSX
2. Use a Python script (`openpyxl`) to parse it and verify:
   - All 14 sheet names present
   - `b2b,sez,de` rows match parties with GSTIN
   - `b2cs` has aggregated rows (not per-invoice)
   - `hsn(b2b)` + `hsn(b2c)` = `itemSummary` totals
   - `docs` shows correct invoice number range and count
   - Main sheet has a totals row as the last data row

### Manual Verification
- Open the generated file in Excel/LibreOffice and visually compare against the reference file structure
