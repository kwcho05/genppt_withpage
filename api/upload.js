const { put, list, del } = require('@vercel/blob');

const MAX_FILES = 5;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const filename = req.query && req.query.filename ? String(req.query.filename) : 'file';
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    let buffer;
    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    }

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: true
    });

    // 최대 개수를 넘으면 가장 오래된 파일부터 삭제
    const { blobs } = await list();
    const sorted = blobs.slice().sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
    const excess = sorted.length - MAX_FILES;
    if (excess > 0) {
      const toDelete = sorted.slice(0, excess).map((b) => b.url);
      await del(toDelete);
    }

    res.status(200).json({ url: blob.url, pathname: blob.pathname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
