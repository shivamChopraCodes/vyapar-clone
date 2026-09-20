const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const db = require('./db');
const { processInvoiceFile } = require('./ocrService');
const { matchParty, matchItems } = require('./matchingService');
const { getGeminiApiKey, setGeminiApiKey, generateGeminiResponse } = require('./geminiService');

const isDev = !app.isPackaged;
const OCR_SETTINGS_FILE = 'ocr-settings.json';

function getOcrSettingsPath() {
  return path.join(app.getPath('userData'), OCR_SETTINGS_FILE);
}

function readOcrSettings() {
  const settingsPath = getOcrSettingsPath();
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (_error) {
    return {};
  }
}

function writeOcrSettings(next) {
  const settingsPath = getOcrSettingsPath();
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), 'utf8');
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('company:list', async () => db.listCompanies());
ipcMain.handle('company:create', async (_event, payload) => db.upsertCompany(payload));

ipcMain.handle('party:list', async () => db.listParties());
ipcMain.handle('party:create', async (_event, payload) => {
  db.createSnapshot('Before: party:create', 'party:create', true);
  return db.upsertParty(payload);
});
ipcMain.handle('party:update', async (_event, id, payload) => {
  db.createSnapshot('Before: party:update', 'party:update', true);
  return db.updateParty(id, payload);
});

ipcMain.handle('party:details', async (_event, partyId) => db.getPartyDetails(Number(partyId)));
ipcMain.handle('party:listInactive', async () => db.listInactiveParties());
ipcMain.handle('party:delete', async (_event, partyId, options) => {
  db.createSnapshot('Before: party:delete', 'party:delete', true);
  return db.deleteParty(Number(partyId), options || {});
});
ipcMain.handle('party:restore', async (_event, partyId) => {
  db.createSnapshot('Before: party:restore', 'party:restore', true);
  return db.restoreParty(Number(partyId));
});

ipcMain.handle('item:list', async () => db.listItems());
ipcMain.handle('item:getDetails', async (_event, itemId) => db.getItemDetails(Number(itemId)));
ipcMain.handle('unit:list', async () => db.listUnits());
ipcMain.handle('taxCode:list', async () => db.listTaxCodes());
ipcMain.handle('item:create', async (_event, payload) => {
  db.createSnapshot('Before: item:create', 'item:create', true);
  return db.upsertItem(payload);
});
ipcMain.handle('item:update', async (_event, id, payload) => {
  db.createSnapshot('Before: item:update', 'item:update', true);
  return db.updateItem(id, payload);
});
ipcMain.handle('item:updateName', async (_event, itemId, name) => {
  db.createSnapshot('Before: item:updateName', 'item:updateName', true);
  return db.updateItemName(Number(itemId), name);
});

ipcMain.handle('batch:list', async (_event, itemId) => db.listBatches(itemId));
ipcMain.handle('batch:availability', async (_event, itemId, asOfDate) => db.listBatchAvailability(itemId, asOfDate));
ipcMain.handle('batch:create', async (_event, payload) => {
  db.createSnapshot('Before: batch:create', 'batch:create', true);
  return db.upsertBatch(payload);
});
ipcMain.handle('db:export', async (_event, targetPath) => db.exportDatabase(targetPath));

ipcMain.handle('partyRate:list', async (_event, partyId) => db.listPartyRates(partyId));
ipcMain.handle('partyRate:forOrder', async (_event, partyId, orderType) =>
  db.listPartyRatesForOrder(Number(partyId), orderType)
);
ipcMain.handle('partyRate:upsert', async (_event, payload) => db.upsertPartyRate(payload));

ipcMain.handle('order:list', async () => db.listOrders());
ipcMain.handle('report:gstr1Sales', async (_event, range) => db.listGstr1SalesReport(range || {}));
ipcMain.handle('report:gstr1Full', async (_event, range) => db.buildGstr1FullReport(range || {}));
ipcMain.handle('order:get', async (_event, orderId) => db.getOrder(Number(orderId)));
ipcMain.handle('order:items', async (_event, orderId) => db.listOrderItems(orderId));
ipcMain.handle('order:create', async (_event, payload) => {
  db.createSnapshot('Before: order:create', 'order:create', true);
  return db.createOrder(payload);
});
ipcMain.handle('order:update', async (_event, orderId, payload) => {
  db.createSnapshot('Before: order:update', 'order:update', true);
  return db.updateOrder(Number(orderId), payload);
});
ipcMain.handle('order:outstanding', async (_event, orderType) => db.listOutstanding(orderType));
ipcMain.handle('order:recordPayment', async (_event, orderId, amount) => {
  db.createSnapshot('Before: recordPayment', 'order:recordPayment', true);
  return db.recordPayment(Number(orderId), Number(amount));
});
ipcMain.handle('order:delete', async (_event, orderId) => {
  db.createSnapshot('Before: order:delete', 'order:delete', true);
  return db.deleteOrder(Number(orderId));
});
ipcMain.handle('order:bulkGenerateSales', async (_event, payload) => {
  db.createSnapshot('Before: bulkGenerateSales', 'order:bulkGenerateSales', true);
  return db.bulkGenerateSalesOrders(payload);
});
ipcMain.handle('order:importPurchaseBillOcr', async (_event, payload) => {
  db.createSnapshot('Before: importPurchaseBillOcr', 'order:importPurchaseBillOcr', true);
  return db.importPurchaseBillFromOcr(payload);
});
ipcMain.handle('order:importSaleBillOcr', async (_event, payload) => {
  db.createSnapshot('Before: importSaleBillOcr', 'order:importSaleBillOcr', true);
  return db.importSaleBillFromOcr(payload);
});

// --- Snapshot management ---
ipcMain.handle('snapshot:create', async (_event, label) => db.createSnapshot(label, 'manual', false));
ipcMain.handle('snapshot:list', async () => db.listSnapshots());
ipcMain.handle('snapshot:delete', async (_event, id) => db.deleteSnapshot(id));
ipcMain.handle('snapshot:rollback', async (_event, id) => db.rollbackToSnapshot(id));
ipcMain.handle('ocr:processImage', async (_event, imagePath, engine = 'tesseract') => {
  if (engine === 'gemini') {
    const prompt = `You are an expert invoice data extractor. Extract the invoice details accurately from the provided image and return ONLY a valid JSON object matching exactly this structure with no markdown formatting or extra text:
{
  "seller": { "name": "", "phone": "", "gst_number": "", "address": "" },
  "buyer": { "name": "", "phone": "", "gst_number": "", "address": "" },
  "invoice_no": "",
  "order_date": "YYYY-MM-DD",
  "items": [
    { "item_name": "", "hsn": "", "qty": 0, "rate": 0, "amount": 0, "batch_no": "", "expiry_date": "YYYY-MM-DD", "mrp": 0, "gst_rate": 0, "pack": "", "discount_pct": 0 }
  ]
}`;
    const result = await generateGeminiResponse({ prompt, imagePath, model: 'gemini-2.5-flash' });
    let rawText = result.text;
    rawText = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    
    let extracted;
    try {
      extracted = JSON.parse(rawText);
    } catch (e) {
      throw new Error('Gemini did not return valid JSON: ' + rawText);
    }
    
    const companies = db.listCompanies();
    let isPurchase = true; 
    
    if (companies && companies.length > 0) {
      const buyerGst = (extracted.buyer?.gst_number || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      const buyerName = (extracted.buyer?.name || '').toLowerCase().trim();
      
      const matchedCompany = companies.find(c => {
        const cst = (c.gst_number || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
        const cname = (c.name || '').toLowerCase().trim();
        if (buyerGst && cst && buyerGst === cst) return true;
        if (buyerName && cname && cname.length > 3 && (buyerName.includes(cname) || cname.includes(buyerName))) return true;
        return false;
      });
      
      if (!matchedCompany) {
        const sellerGst = (extracted.seller?.gst_number || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
        const sellerName = (extracted.seller?.name || '').toLowerCase().trim();
        const matchedSeller = companies.find(c => {
          const cst = (c.gst_number || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
          const cname = (c.name || '').toLowerCase().trim();
          if (sellerGst && cst && sellerGst === cst) return true;
          if (sellerName && cname && cname.length > 3 && (sellerName.includes(cname) || cname.includes(sellerName))) return true;
          return false;
        });
        
        if (matchedSeller) {
          isPurchase = false;
        }
      }
    }
    
    const parsed = {
      type: isPurchase ? 'purchase' : 'sale',
      supplier: isPurchase ? extracted.seller : extracted.buyer,
      bill: {
        invoice_no: extracted.invoice_no || '',
        order_date: extracted.order_date || ''
      },
      items: extracted.items || []
    };
    
    return { rawText, parsed };
  }

  const settings = readOcrSettings();
  const res = await processInvoiceFile(String(imagePath || '').trim(), String(engine || 'tesseract').toLowerCase(), {
    apiKey: settings.googleVisionApiKey || ''
  });
  
  if (res && res.parsed) {
    res.parsed.type = 'purchase';
  }
  return res;
});
ipcMain.handle('ocr:matchEntities', async (_event, ocrData) => {
  const parsed = ocrData?.parsed || ocrData || {};
  const targetParty = parsed?.supplier || parsed?.seller || parsed?.buyer || {};
  const parties = db.listParties();
  const items = db.listItems();
  return {
    party_match: matchParty(targetParty, parties),
    item_matches: matchItems(parsed?.items || [], items),
    db_snapshot: {
      parties_count: parties.length,
      items_count: items.length
    }
  };
});
ipcMain.handle('ocr:setApiKey', async (_event, key = '') => {
  const settings = readOcrSettings();
  settings.googleVisionApiKey = String(key || '').trim();
  writeOcrSettings(settings);
  return { ok: true };
});
ipcMain.handle('ocr:getApiKey', async () => {
  const settings = readOcrSettings();
  return String(settings.googleVisionApiKey || '');
});
ipcMain.handle('gemini:getApiKey', async () => getGeminiApiKey());
ipcMain.handle('gemini:setApiKey', async (_event, key = '') => setGeminiApiKey(key));
ipcMain.handle('gemini:generate', async (_event, payload) => generateGeminiResponse(payload || {}));
ipcMain.handle('debug:dbInfo', async () => db.getDbInfo());
// --- Dev mode (sandbox database) ---
ipcMain.handle('dbMode:get', async () => db.getMode());
ipcMain.handle('dbMode:set', async (_event, mode) => {
  const result = db.setMode(mode);
  // Every page holds rows fetched from the previous database; that state must not survive
  // the swap, so reload the renderer rather than trying to invalidate each screen.
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.reload());
  return result;
});
ipcMain.handle('dbMode:resetDev', async () => {
  const result = db.resetDevDb();
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.reload());
  return result;
});
ipcMain.handle('debug:orders', async () => db.getOrdersDiagnostics());

ipcMain.handle('import:vyaparDump', async (_event, dumpPath) =>
  db.importFromVyaparDump(dumpPath)
);

ipcMain.handle('app:userDataPath', async () => app.getPath('userData'));

ipcMain.handle('invoice:previewChrome', async (_event, payload) => {
  const markup = payload?.markup ? String(payload.markup) : '';
  const css = payload?.css ? String(payload.css) : '';
  const rawInvoiceNo = String(payload?.invoice_no || '').trim();
  if (!markup.trim()) {
    throw new Error('Invoice preview markup is missing.');
  }
  const invoiceNo = rawInvoiceNo || 'NA';
  const baseName = `GST INVOICE_${invoiceNo}`;
  const safeName = baseName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim();

  const previewCssOverride = `
    .invoice-print-wrapper { display: block !important; }
    .invoice-print { margin: 16px auto; }
    body { background: #f5f5f5; margin: 0; padding: 20px; }
  `;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeName}</title>
    <style>${css}\n${previewCssOverride}</style>
  </head>
  <body>
    ${markup}
  </body>
</html>`;

  const filePath = path.join(os.tmpdir(), `${safeName}_${Date.now()}.html`);
  fs.writeFileSync(filePath, html, 'utf8');

  if (process.platform === 'darwin') {
    await new Promise((resolve, reject) => {
      execFile('open', ['-a', 'Google Chrome', filePath], (error) => {
        if (error) {
          reject(new Error('Could not open Google Chrome for preview.'));
          return;
        }
        resolve();
      });
    });
    return { ok: true, filePath };
  }

  await shell.openPath(filePath);
  return { ok: true, filePath };
});
