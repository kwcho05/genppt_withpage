const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchListing: (itemNo) => ipcRenderer.invoke('fetch-listing', itemNo)
});
