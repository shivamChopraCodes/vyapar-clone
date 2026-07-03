# Vyapar Clone — Architecture & Design Overview

A desktop billing / inventory application for Indian SMBs (modeled on Vyapar, with a
pharma-distribution slant: batches, expiry, HSN, GST). It manages parties, items,
sales & purchase invoices, party-wise rates, GST reporting (GSTR-1), and two
"smart" data-entry paths: **OCR/AI invoice import** and **bulk synthetic sales
generation**. It reads and writes a real Vyapar-compatible SQLite schema (`kb_*`
tables), so it can operate directly on exported Vyapar backups.

---

## 1. High-Level Architecture

The app is an **Electron** application with a strict three-process split:

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Electron App                                 │
│                                                                       │
│  ┌────────────────────┐   IPC (contextBridge)   ┌──────────────────┐  │
│  │  Renderer Process   │  ───────────────────▶  │   Main Process    │  │
│  │  (Chromium + React) │  ◀───────────────────  │   (Node.js)       │  │
│  │                     │   window.vyapar.*       │                  │  │
│  │  - React 18 SPA     │                         │  - better-sqlite3 │  │
│  │  - react-router     │                         │  - OCR service    │  │
│  │  - Tailwind CSS     │                         │  - Gemini service │  │
│  │  - Vite dev server  │                         │  - Matching svc   │  │
│  └────────────────────┘                         └────────┬─────────┘  │
│                                                           │            │
└───────────────────────────────────────────────────────────┼──────────┘
                                                            │
                       ┌────────────────────────────────────┼───────────────┐
                       ▼                  ▼                   ▼               ▼
                 SQLite (vyapar.db)  Tesseract.js     Google Vision API  Gemini API
                 + WAL + snapshots   (local OCR)      (cloud OCR)        (cloud AI)
                                          ▲
                                     poppler/sips (PDF→PNG)
```

### Process responsibilities

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Renderer** | `src/renderer/` | All UI. React SPA with hash/path routes, Tailwind styling. No direct DB or filesystem access. |
| **Preload** | `src/preload/preload.js` | The security boundary. Uses `contextBridge` to expose a single typed `window.vyapar` API of IPC-invokers. Nothing else crosses. |
| **Main** | `src/main/` | All privileged work: SQLite access, OCR, PDF conversion, cloud AI calls, file export, snapshot management. |
| **Tools** | `tools/` | Standalone Node scripts for one-off data import from Vyapar dumps / spreadsheets (run outside the app). |

### Key technology choices

- **Electron 30** — desktop shell so the app can own a local SQLite file and shell out to native tools (`pdftoppm`, `sips`, `open`).
- **better-sqlite3** — synchronous, in-process SQLite. Chosen for simplicity: handlers are straight-line transactional code with no async DB plumbing, and `db.transaction()` gives atomicity for multi-table writes (order + line items + stock).
- **React 18 + react-router-dom 6** — conventional SPA. Pages map 1:1 to feature areas.
- **Vite 5** — dev server + bundler for the renderer only. Main/preload run as plain CommonJS Node, unbundled.
- **Tailwind CSS 3** — utility-first styling.
- **tesseract.js** (local) / **Google Vision** (cloud) / **@google/genai** (Gemini) — pluggable OCR/extraction engines.

---

## 2. Data Flow

### 2.1 The IPC contract (the only channel)

Every renderer→main interaction is a request/response over `ipcMain.handle` /
`ipcRenderer.invoke`, surfaced to React as promise-returning methods on
`window.vyapar`. Example chain for creating a party:

```
Parties.jsx
  └─ window.vyapar.createParty(payload)          // preload
       └─ ipcRenderer.invoke('party:create', …)
            └─ ipcMain.handle('party:create', …)  // main/main.js
                 ├─ db.createSnapshot('Before: party:create', …, auto)
                 └─ db.upsertParty(payload)        // main/db.js → SQLite
```

`main.js` is a thin router: it wires channel names to `db.js` functions and (for
mutations) takes an automatic safety snapshot first. `db.js` holds all SQL.

### 2.2 Standard CRUD flow

1. A page calls a `window.vyapar.*` method on mount or user action.
2. Main looks up the handler, snapshots if it's a mutation, calls the `db.js` function.
3. `db.js` runs prepared statements against SQLite and **maps the raw `kb_*` schema
   to clean app-facing shapes** (e.g. `name_id → id`, `full_name → name`). The
   renderer never sees raw column names.
4. The result returns through the same chain as a resolved promise.

### 2.3 Order (invoice) creation flow

`createOrder` (`db.js`) is the core write path and shows the transactional design:

1. Resolve `txn_type` (1 = sale, 3 = purchase).
2. Open a `db.transaction()`.
3. Allocate the next invoice number (manual override or auto-increment per txn type).
4. Compute the invoice total from line items (`qty × rate × (1 + gst/100)`), apply
   optional round-off (sales only), and split into cash vs. balance (outstanding).
5. Derive **place of supply** and infer **inter-state vs. intra-state** by comparing
   the firm's state to the party/supply state — this drives IGST vs. CGST+SGST.
6. Insert the `kb_transactions` header, then each `kb_lineitems` row.
7. Adjust inventory via `buildStockAdjusters`: purchases **add** stock to the matching
   batch (`kb_item_stock_tracking`), sales **subtract** it; the item's aggregate
   `item_stock_quantity` is kept in sync.
8. Persist party-wise rates seen on the invoice (`upsertPartyRatesFromOrder`).

`updateOrder` replaces line items wholesale (delete + re-insert) and reverses prior
stock effects before re-applying; `deleteOrder` rolls back stock then removes the rows.

### 2.4 OCR / AI invoice import flow

This is the app's signature feature — turn a scanned bill into a draft purchase/sale order:

```
OcrImport.jsx
  1. processInvoiceImage(path, engine)        → main
       engine = 'tesseract' | 'google' | 'gemini'
       ├─ PDF? → pdftoppm/sips converts to PNG  (ocrService)
       ├─ 'tesseract'/'google' → OCR to raw text → regex/heuristic parser
       │                          (parseInvoiceText: header + line-item parsing)
       └─ 'gemini' → image sent to Gemini with a strict JSON schema prompt;
                     buyer/seller GST+name matched against the firm to decide
                     purchase vs. sale.
       ⇒ returns { rawText, parsed: { type, supplier, bill, items[] } }

  2. matchInvoiceEntities(parsed)             → main (matchingService)
       ├─ matchParty:  GST exact-match, else Dice-coefficient name similarity
       └─ matchItems:  per item, name similarity (+HSN boost), bucketed into
                       matched (≥0.85) / review (≥0.5) / create_new
       ⇒ user reviews & confirms mappings in the UI

  3. importPurchaseBillOcr / importSaleBillOcr(payload) → main
       creates parties/items as needed, then writes the order + lines + stock
       (auto-snapshot taken first).
```

Design intent: **OCR/AI is advisory, never authoritative.** Extraction and fuzzy
matching produce a *draft*; a human confirms before anything is persisted. Three
engines trade off cost/quality (local Tesseract → cloud Vision → Gemini structured
extraction).

### 2.5 Reporting flow (GSTR-1)

`Reports.jsx` calls `getGstr1SalesReport` / `getGstr1FullReport`. These run
read-only aggregation SQL over transactions + line items + tax codes, allocating
invoice-level values across lines and bucketing by GST rate / UQC / inter-state.
Output is rendered as tables and exported to XLSX client-side
(`renderer/utils/xlsxExport.js`).

### 2.6 Bulk synthetic sales generation

`BulkSales.jsx` → `bulkGenerateSalesOrders` generates many plausible sales invoices
across a date range, using a **seeded RNG** (deterministic/reproducible) to
distribute target amounts across invoices, parties, dates, and items while
respecting batch availability as of each date. Useful for backfilling/test data.

---

## 3. Data Layer & Schema

### Database

- **Engine:** SQLite via `better-sqlite3`, **WAL** journaling mode.
- **Location (resolution order):**
  1. `VYAPAR_DB_PATH` env var if it points to an existing file (used in `npm run dev`).
  2. `<userData>/vyapar.db` (Electron app data dir).
  3. `~/Library/Application Support/vyapar-clone/vyapar.db` (fallback).
- **Schema:** `initSchema()` creates tables `IF NOT EXISTS` and runs lightweight
  migrations (`ensureFirmColumns`, `backfillPlaceOfSupplyFromPartyState`) on every
  boot. This makes the app tolerant of older/real Vyapar databases.

### Core tables (Vyapar-compatible `kb_*` naming)

| Table | Role |
|-------|------|
| `kb_firms` | The user's own company/firm(s) — name, GSTIN, state, drug license. |
| `kb_names` | Parties (customers & suppliers). |
| `kb_items` | Products — price, HSN, tax id, aggregate stock. |
| `kb_tax_code` | GST rate definitions. |
| `kb_party_item_rate` | Negotiated per-party sale/purchase price per item. |
| `kb_transactions` | Invoice/order headers (`txn_type` 1=sale, 3=purchase). |
| `kb_lineitems` | Invoice line items (qty, price, batch, expiry, mrp, tax). |
| `kb_item_stock_tracking` | Per-batch inventory (batch no, expiry, mrp, quantity). |
| `kb_item_units` | Units of measure. |
| `kb_udf_fields` / `kb_udf_values` | User-defined custom fields (e.g. party D.L. no). |

Key relationships:

```
kb_firms ── (state drives IGST vs CGST/SGST)
kb_names ──┬─< kb_transactions >─┬── kb_lineitems >── kb_items ── kb_tax_code
           │                     │                       │
           └─< kb_party_item_rate ┘                       └──< kb_item_stock_tracking
```

Why the real Vyapar schema instead of a clean one? So the clone can **open and edit
genuine Vyapar backups** directly — the `tools/` importers and the in-app dump
importer load real data, and reports must match Vyapar's output.

---

## 4. Safety & Data-Protection Design

This is a notable design emphasis given the app mutates a single local DB file.

- **Automatic snapshots before every mutation.** Each mutating IPC handler calls
  `db.createSnapshot(...)` first. A snapshot is a `VACUUM INTO` copy of the DB into
  `<userData>/snapshots/`, tracked in `snapshots.json` with label/action/timestamp.
- **Retention:** auto-snapshots are capped at 50 (oldest pruned); manual snapshots kept.
- **Rollback:** `rollbackToSnapshot` takes a *safety* snapshot, closes the DB, copies
  the chosen snapshot over the live file (clearing WAL/SHM), and reopens — a full
  point-in-time restore, surfaced in the **Snapshots** page.
- **Export:** `exportDatabase` does a `wal_checkpoint(FULL)` + `VACUUM INTO` to a
  timestamped `.db` in Downloads (unique-name guarded).

Trade-off: snapshotting on every write is I/O-heavy but cheap insurance for a
single-user desktop app where the database *is* the user's business records.

---

## 5. Key Design Choices (summary)

1. **Vyapar-compatible schema** — interoperate with real exports rather than invent a
   clean model. Cost: verbose `kb_*` columns; benefit: drop-in on real data.
2. **DB-layer translation** — `db.js` maps ugly columns to clean app shapes so the UI
   stays decoupled from the storage schema.
3. **Thin main router, fat db module** — `main.js` only routes + snapshots; all SQL and
   business logic lives in `db.js`. Easy to find, easy to test the data layer.
4. **Synchronous SQLite** — `better-sqlite3` keeps handlers simple and transactional.
5. **Pluggable OCR/AI engines** — Tesseract (free/local), Google Vision (better cloud
   OCR), Gemini (structured JSON extraction). Selectable per import.
6. **Human-in-the-loop import** — AI proposes, fuzzy matcher ranks, user confirms; no
   silent writes from extraction.
7. **Snapshot-first mutations** — durability/undo without a full audit log or migration
   framework.
8. **Inventory as derived + tracked** — batch quantities maintained on write, with
   availability also reconstructable from line-item history (`listBatchAvailability`).
9. **Deterministic bulk generation** — seeded RNG for reproducible synthetic data.
10. **Strict context isolation** — `contextIsolation: true`, `nodeIntegration: false`,
    one curated `window.vyapar` surface; the renderer has zero direct system access.

---

## 6. Source Map

```
src/
  main/
    main.js            IPC router; registers all channels, auto-snapshots on mutations
    db.js              All SQLite access, schema, business logic, snapshots (~4.2k lines)
    ocrService.js      Tesseract/Google OCR + PDF→PNG + heuristic invoice text parser
    geminiService.js   Gemini API key mgmt + image→JSON structured extraction
    matchingService.js Dice-coefficient fuzzy matching for parties & items
  preload/
    preload.js         contextBridge: the entire window.vyapar API surface
  renderer/
    App.jsx            Routes
    pages/             Overview, Company, Parties, Items, Orders, OrderEdit,
                       OcrImport, BulkSales, Reports, GeminiPage, Snapshots
    components/        Sidebar, InvoicePrint, ui/* (Button, Input, Table, …)
    utils/             xlsxExport, numberToWords
    data/              gstRates, baseUnits
tools/                 Standalone importers (Vyapar dump / SQLite / GST items xlsx)
```

---

## 7. Build & Run

- **Dev:** `npm run dev` — Vite serves the renderer on `:5173`; Electron waits for it,
  then loads it and opens DevTools. `VYAPAR_DB_PATH` points at a working DB copy.
- **Build:** `npm run build` — Vite builds the renderer to `dist/`; in production
  Electron loads `dist/renderer/index.html`.
- **Native rebuild:** `postinstall` runs `electron-rebuild` for `better-sqlite3`.
- **External dependencies (optional):** `poppler` (`pdftoppm`) for reliable PDF OCR;
  Google Vision / Gemini API keys for cloud engines (stored in app settings / `.env`).
```
