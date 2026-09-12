const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fetchListingData } = require('./listingFetcher');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.loadFile('index.html');
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

// 명예부동산.com 매물 상세페이지에서 정보/사진을 읽어온다.
ipcMain.handle('fetch-listing', async (event, itemNo) => {
  return fetchListingData(itemNo);
});
