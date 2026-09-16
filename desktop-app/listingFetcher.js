const { BrowserWindow } = require('electron');

const EXTRACT_SCRIPT = `
(function () {
  const titleEl = document.querySelector('.info_title');
  if (!titleEl) return { notFound: true };

  const title = titleEl.textContent.trim();

  const fields = {};
  document.querySelectorAll('#basic_tab td[data-td]').forEach((td) => {
    const label = td.getAttribute('data-td');
    fields[label] = td.innerText.replace(/\\s+/g, ' ').trim();
  });

  let description = '';
  const descTab = document.querySelector('#detail_tab');
  if (descTab) {
    description = descTab.innerText
      .replace(/^\\s*매물\\s*설명\\s*/, '')
      .trim();
  }

  return { title, fields, description };
})()
`;

// 사진은 관리자 매물사진첩의 "워터마크 제외 이미지"로 별도로 받아온다 (adminPhotoFetcher.js 참고).
async function fetchListingData(itemNo) {
  const cleanNo = String(itemNo).trim().replace(/[^0-9]/g, '');
  if (!cleanNo) throw new Error('매물번호를 올바르게 입력해주세요.');

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  try {
    await win.loadURL(`https://www.xn--2q1bn0kotckrem1i.com/item/view/${cleanNo}`);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const data = await win.webContents.executeJavaScript(EXTRACT_SCRIPT);
    if (!data || data.notFound) {
      throw new Error('해당 매물번호를 찾을 수 없습니다. 번호를 다시 확인해주세요.');
    }

    return {
      title: data.title,
      fields: data.fields,
      description: data.description
    };
  } finally {
    win.destroy();
  }
}

module.exports = { fetchListingData };
