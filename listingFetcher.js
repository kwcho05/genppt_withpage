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

  const imageUrls = [...new Set(
    Array.from(document.querySelectorAll('img'))
      .map((i) => i.src)
      .filter((s) => s.includes('/gallery/'))
  )];

  return { title, fields, description, imageUrls };
})()
`;

const DOWNLOAD_IMAGES_SCRIPT = (urlsJson) => `
(async function () {
  const urls = ${urlsJson};
  const results = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      results.push(dataUrl);
    } catch (e) {
      results.push(null);
    }
  }
  return results;
})()
`;

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

    let images = [];
    if (data.imageUrls && data.imageUrls.length) {
      images = await win.webContents.executeJavaScript(
        DOWNLOAD_IMAGES_SCRIPT(JSON.stringify(data.imageUrls))
      );
      images = images.filter(Boolean);
    }

    return {
      title: data.title,
      fields: data.fields,
      description: data.description,
      images
    };
  } finally {
    win.destroy();
  }
}

module.exports = { fetchListingData };
