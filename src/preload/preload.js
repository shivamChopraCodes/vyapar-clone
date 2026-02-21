const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vyapar', {
  listCompanies: () => ipcRenderer.invoke('company:list'),
  createCompany: (payload) => ipcRenderer.invoke('company:create', payload),

  listParties: () => ipcRenderer.invoke('party:list'),
  createParty: (payload) => ipcRenderer.invoke('party:create', payload),

  listItems: () => ipcRenderer.invoke('item:list'),
  listUnits: () => ipcRenderer.invoke('unit:list'),
  listTaxCodes: () => ipcRenderer.invoke('taxCode:list'),
  createItem: (payload) => ipcRenderer.invoke('item:create', payload),

  listBatches: (itemId) => ipcRenderer.invoke('batch:list', itemId),
  createBatch: (payload) => ipcRenderer.invoke('batch:create', payload),

  listPartyRates: (partyId) => ipcRenderer.invoke('partyRate:list', partyId),
  upsertPartyRate: (payload) => ipcRenderer.invoke('partyRate:upsert', payload),

  listOrders: () => ipcRenderer.invoke('order:list'),
  listOrderItems: (orderId) => ipcRenderer.invoke('order:items', orderId),
  getOrder: (orderId) => ipcRenderer.invoke('order:get', orderId),
  createOrder: (payload) => ipcRenderer.invoke('order:create', payload),
  updateOrder: (orderId, payload) => ipcRenderer.invoke('order:update', orderId, payload),
  getDbInfo: () => ipcRenderer.invoke('debug:dbInfo'),
  getOrdersDiagnostics: () => ipcRenderer.invoke('debug:orders'),
  getUserDataPath: () => ipcRenderer.invoke('app:userDataPath'),
  importVyaparDump: (dumpPath) => ipcRenderer.invoke('import:vyaparDump', dumpPath),
  previewInvoiceInChrome: (payload) => ipcRenderer.invoke('invoice:previewChrome', payload)
});
