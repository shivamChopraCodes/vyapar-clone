const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const db = require('./db');

const isDev = !app.isPackaged;

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
ipcMain.handle('party:create', async (_event, payload) => db.upsertParty(payload));

ipcMain.handle('item:list', async () => db.listItems());
ipcMain.handle('unit:list', async () => db.listUnits());
ipcMain.handle('taxCode:list', async () => db.listTaxCodes());
ipcMain.handle('item:create', async (_event, payload) => db.upsertItem(payload));

ipcMain.handle('batch:list', async (_event, itemId) => db.listBatches(itemId));
ipcMain.handle('batch:create', async (_event, payload) => db.upsertBatch(payload));

ipcMain.handle('partyRate:list', async (_event, partyId) => db.listPartyRates(partyId));
ipcMain.handle('partyRate:upsert', async (_event, payload) => db.upsertPartyRate(payload));

ipcMain.handle('order:list', async () => db.listOrders());
ipcMain.handle('order:get', async (_event, orderId) => db.getOrder(Number(orderId)));
ipcMain.handle('order:items', async (_event, orderId) => db.listOrderItems(orderId));
ipcMain.handle('order:create', async (_event, payload) => db.createOrder(payload));
ipcMain.handle('order:update', async (_event, orderId, payload) => db.updateOrder(Number(orderId), payload));
ipcMain.handle('debug:dbInfo', async () => db.getDbInfo());
ipcMain.handle('debug:orders', async () => db.getOrdersDiagnostics());

ipcMain.handle('import:vyaparDump', async (_event, dumpPath) =>
  db.importFromVyaparDump(dumpPath)
);

ipcMain.handle('app:userDataPath', async () => app.getPath('userData'));

ipcMain.handle('invoice:previewChrome', async (_event, payload) => {
  const markup = payload?.markup ? String(payload.markup) : '';
  const css = payload?.css ? String(payload.css) : '';
  if (!markup.trim()) {
    throw new Error('Invoice preview markup is missing.');
  }

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
    <title>Invoice Preview</title>
    <style>${css}\n${previewCssOverride}</style>
  </head>
  <body>
    ${markup}
  </body>
</html>`;

  const filePath = path.join(os.tmpdir(), `vyapar_invoice_preview_${Date.now()}.html`);
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
