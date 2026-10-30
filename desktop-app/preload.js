const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchListing: (itemNo) => ipcRenderer.invoke('fetch-listing', itemNo),
  generatePdf: (payload) => ipcRenderer.invoke('generate-pdf', payload),
  onLoginRequired: (cb) => ipcRenderer.on('login-required', () => cb())
});
