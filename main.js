const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { fetchListingData } = require('./listingFetcher');
const { fetchAdminPhotos } = require('./adminPhotoFetcher');

let mainWindow = null;

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
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
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

// 명예부동산.com 매물 상세페이지에서 텍스트 정보를, 관리자 매물사진첩에서 워터마크 없는 사진을 읽어온다.
ipcMain.handle('fetch-listing', async (event, itemNo) => {
  const data = await fetchListingData(itemNo);

  let images = [];
  let photoWarning = null;
  try {
    images = await fetchAdminPhotos(itemNo);
  } catch (e) {
    photoWarning = e.message;
  }

  return { ...data, images, photoWarning };
});

// PPT와 동일한 구조/이미지로 만든 HTML을 PDF로 인쇄해서 저장한다.
ipcMain.handle('generate-pdf', async (event, { html, fileName }) => {
  const tmpFile = path.join(os.tmpdir(), `ppt-generator-pdf-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf-8');

  const pdfWin = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  try {
    await pdfWin.loadFile(tmpFile);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      landscape: false,
      pageSize: { width: 254000, height: 142875 }, // 10in x 5.625in (microns)
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'PDF 저장',
      defaultPath: fileName || '매물소개.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, pdfBuffer);
    return { canceled: false, filePath: result.filePath };
  } finally {
    pdfWin.destroy();
    try {
      fs.unlinkSync(tmpFile);
    } catch (e) {}
  }
});
