const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vyapar', {
  listCompanies: () => ipcRenderer.invoke('company:list'),
  createCompany: (payload) => ipcRenderer.invoke('company:create', payload),

  listParties: () => ipcRenderer.invoke('party:list'),
  createParty: (payload) => ipcRenderer.invoke('party:create', payload),
  updateParty: (id, payload) => ipcRenderer.invoke('party:update', id, payload),

  listItems: () => ipcRenderer.invoke('item:list'),
  getItemDetails: (itemId) => ipcRenderer.invoke('item:getDetails', itemId),
  listUnits: () => ipcRenderer.invoke('unit:list'),
  listTaxCodes: () => ipcRenderer.invoke('taxCode:list'),
  createItem: (payload) => ipcRenderer.invoke('item:create', payload),
  updateItem: (id, payload) => ipcRenderer.invoke('item:update', id, payload),
  updateItemName: (itemId, name) => ipcRenderer.invoke('item:updateName', itemId, name),

  listBatches: (itemId) => ipcRenderer.invoke('batch:list', itemId),
  listBatchAvailability: (itemId, asOfDate) => ipcRenderer.invoke('batch:availability', itemId, asOfDate),
  createBatch: (payload) => ipcRenderer.invoke('batch:create', payload),
  exportDatabase: (targetPath) => ipcRenderer.invoke('db:export', targetPath),

  listPartyRates: (partyId) => ipcRenderer.invoke('partyRate:list', partyId),
  listPartyRatesForOrder: (partyId, orderType) => ipcRenderer.invoke('partyRate:forOrder', partyId, orderType),
  upsertPartyRate: (payload) => ipcRenderer.invoke('partyRate:upsert', payload),

  listOrders: () => ipcRenderer.invoke('order:list'),
  getGstr1SalesReport: (range) => ipcRenderer.invoke('report:gstr1Sales', range),
  getGstr1FullReport: (range) => ipcRenderer.invoke('report:gstr1Full', range),
  listOrderItems: (orderId) => ipcRenderer.invoke('order:items', orderId),
  getOrder: (orderId) => ipcRenderer.invoke('order:get', orderId),
  createOrder: (payload) => ipcRenderer.invoke('order:create', payload),
  updateOrder: (orderId, payload) => ipcRenderer.invoke('order:update', orderId, payload),
  deleteOrder: (orderId) => ipcRenderer.invoke('order:delete', orderId),
  bulkGenerateSalesOrders: (payload) => ipcRenderer.invoke('order:bulkGenerateSales', payload),
  importPurchaseBillOcr: (payload) => ipcRenderer.invoke('order:importPurchaseBillOcr', payload),
  importSaleBillOcr: (payload) => ipcRenderer.invoke('order:importSaleBillOcr', payload),
  processInvoiceImage: (imagePath, engine) => ipcRenderer.invoke('ocr:processImage', imagePath, engine),
  matchInvoiceEntities: (ocrData) => ipcRenderer.invoke('ocr:matchEntities', ocrData),
  setOcrApiKey: (key) => ipcRenderer.invoke('ocr:setApiKey', key),
  getOcrApiKey: () => ipcRenderer.invoke('ocr:getApiKey'),
  getGeminiApiKey: () => ipcRenderer.invoke('gemini:getApiKey'),
  setGeminiApiKey: (key) => ipcRenderer.invoke('gemini:setApiKey', key),
  generateGemini: (payload) => ipcRenderer.invoke('gemini:generate', payload),
  getDbInfo: () => ipcRenderer.invoke('debug:dbInfo'),
  getDbMode: () => ipcRenderer.invoke('dbMode:get'),
  setDbMode: (mode) => ipcRenderer.invoke('dbMode:set', mode),
  resetDevDb: () => ipcRenderer.invoke('dbMode:resetDev'),
  getOrdersDiagnostics: () => ipcRenderer.invoke('debug:orders'),
  getUserDataPath: () => ipcRenderer.invoke('app:userDataPath'),
  importVyaparDump: (dumpPath) => ipcRenderer.invoke('import:vyaparDump', dumpPath),
  previewInvoiceInChrome: (payload) => ipcRenderer.invoke('invoice:previewChrome', payload),

  createSnapshot: (label) => ipcRenderer.invoke('snapshot:create', label),
  listSnapshots: () => ipcRenderer.invoke('snapshot:list'),
  deleteSnapshot: (id) => ipcRenderer.invoke('snapshot:delete', id),
  rollbackToSnapshot: (id) => ipcRenderer.invoke('snapshot:rollback', id)
});
