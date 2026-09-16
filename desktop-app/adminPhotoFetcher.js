const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');

const PARTITION = 'persist:myeongyeo-admin';
const ADMIN_HOME_URL = 'https://www.xn--2q1bn0kotckrem1i.com/admin';
const TEMP_BASE = path.join(os.tmpdir(), 'ppt-generator-photos');

let adminWin = null;

function getAdminWindow() {
  if (adminWin && !adminWin.isDestroyed()) return adminWin;
  adminWin = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    webPreferences: { partition: PARTITION }
  });
  adminWin.on('closed', () => {
    adminWin = null;
  });
  return adminWin;
}

// 관리자 로그인이 안 되어있으면 창을 보여주고 사용자가 직접 로그인할 때까지 기다린다.
async function ensureLoggedIn(win) {
  await win.loadURL(ADMIN_HOME_URL);
  await new Promise((resolve) => setTimeout(resolve, 800));

  const alreadyLoggedIn = await win.webContents.executeJavaScript(
    `!!document.querySelector('.admin_nav')`
  );
  if (alreadyLoggedIn) return;

  win.show();

  await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error('로그인 대기 시간이 초과되었습니다 (5분). 다시 시도해주세요.'));
    }, 5 * 60 * 1000);

    const interval = setInterval(async () => {
      if (win.isDestroyed()) {
        finish(new Error('관리자 로그인 창이 닫혔습니다. 다시 시도해주세요.'));
        return;
      }
      try {
        const ok = await win.webContents.executeJavaScript(`!!document.querySelector('.admin_nav')`);
        if (ok) finish(null);
      } catch (e) {
        // 페이지 전환 중 일시적 실행 오류는 무시하고 계속 폴링
      }
    }, 1000);

    function finish(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(interval);
      if (err) reject(err);
      else resolve();
    }
  });

  if (!win.isDestroyed()) win.hide();
}

function buildAlbumSearchUrl(itemNo) {
  const params = new URLSearchParams({
    page: '1',
    offset: '15',
    mobile_check: '0',
    align: '',
    keyword: String(itemNo),
    list_type: 'card',
    jibun_range1: '',
    jibun_range2: '',
    type: '',
    member_id: ''
  });
  return `https://www.xn--2q1bn0kotckrem1i.com/admin_item/item_album?${params.toString()}`;
}

// 매물사진첩에서 해당 매물번호의 "워터마크 제외 이미지" 버튼을 눌러 zip을 앱 전용 임시폴더로 받는다.
async function downloadPhotosZip(win, itemNo) {
  const cleanNo = String(itemNo).trim().replace(/[^0-9]/g, '');
  if (!cleanNo) throw new Error('매물번호를 올바르게 입력해주세요.');

  await win.loadURL(buildAlbumSearchUrl(cleanNo));
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const found = await win.webContents.executeJavaScript(`
    !!([...document.querySelectorAll('.card')].find((c) => c.textContent.includes(${JSON.stringify(cleanNo)})))
  `);
  if (!found) {
    throw new Error('매물사진첩에서 해당 매물번호를 찾을 수 없습니다. 번호를 다시 확인해주세요.');
  }

  const tmpDir = path.join(TEMP_BASE, `${cleanNo}-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const ses = win.webContents.session;

  const zipPath = await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      ses.removeListener('will-download', handler);
      clearTimeout(startTimeout);
      if (err) reject(err);
      else resolve(val);
    };

    const handler = (event, item) => {
      const filename = item.getFilename();
      // 안전장치: 우리가 요청한 매물번호로 시작하는 파일만 받는다.
      if (!filename.startsWith(`${cleanNo}_`)) {
        item.cancel();
        return;
      }
      const savePath = path.join(tmpDir, filename);
      item.setSavePath(savePath);
      item.once('done', (e, state) => {
        if (state === 'completed') finish(null, savePath);
        else finish(new Error('사진 zip 다운로드에 실패했습니다: ' + state));
      });
    };
    ses.on('will-download', handler);

    win.webContents
      .executeJavaScript(
        `
      (function(){
        const card = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes(${JSON.stringify(cleanNo)}));
        if (!card) return false;
        const btn = card.querySelector('.btn_download.origin');
        if (!btn) return false;
        btn.click();
        return true;
      })()
      `
      )
      .then((clicked) => {
        if (!clicked) finish(new Error('워터마크 제외 이미지 다운로드 버튼을 찾을 수 없습니다.'));
      })
      .catch((e) => finish(e));

    var startTimeout = setTimeout(() => {
      finish(new Error('사진 다운로드가 시간 내에 시작되지 않았습니다. (서버 응답 지연)'));
    }, 30000);
  });

  return { zipPath, tmpDir };
}

function extractLeadingNumber(name) {
  const base = path.basename(name);
  const m = base.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extractSortedImages(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && /\.(jpe?g|png)$/i.test(e.entryName));

  entries.sort((a, b) => {
    const na = extractLeadingNumber(a.entryName);
    const nb = extractLeadingNumber(b.entryName);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    return a.entryName.localeCompare(b.entryName, undefined, { numeric: true });
  });

  return entries.map((e) => {
    const buf = e.getData();
    const ext = path.extname(e.entryName).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  });
}

// tmpDir이 우리가 만든 전용 임시폴더(매물번호로 시작)인지 다시 한번 확인한 뒤에만 삭제한다.
function safeCleanup(tmpDir, itemNo) {
  const cleanNo = String(itemNo).trim().replace(/[^0-9]/g, '');
  const rel = path.relative(TEMP_BASE, tmpDir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('안전하지 않은 경로라 삭제를 건너뛰었습니다: ' + tmpDir);
  }
  if (!path.basename(tmpDir).startsWith(`${cleanNo}-`)) {
    throw new Error('매물번호가 일치하지 않아 삭제를 건너뛰었습니다: ' + tmpDir);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function fetchAdminPhotos(itemNo) {
  const win = getAdminWindow();
  await ensureLoggedIn(win);
  const { zipPath, tmpDir } = await downloadPhotosZip(win, itemNo);
  try {
    const images = extractSortedImages(zipPath);
    return images.slice(0, 7);
  } finally {
    try {
      safeCleanup(tmpDir, itemNo);
    } catch (e) {
      console.error(e);
    }
  }
}

module.exports = { fetchAdminPhotos };
