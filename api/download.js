const { head } = require('@vercel/blob');

// private 스토어의 blob은 URL을 그대로 링크할 수 없어서, 서버(이 함수)가
// 대신 인증된 상태로 받아와 그대로 클라이언트에 흘려보내준다.
module.exports = async (req, res) => {
  try {
    const url = req.query && req.query.url;
    if (!url || !/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//.test(url)) {
      res.status(400).json({ error: '잘못된 요청입니다.' });
      return;
    }

    // 우리 스토어에 실제 존재하는 blob인지 확인 (임의 URL 프록시 방지)
    const meta = await head(url);

    const upstream = await fetch(meta.url, {
      headers: process.env.BLOB_READ_WRITE_TOKEN
        ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
        : {}
    });
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({
        error: '파일을 가져오지 못했습니다.',
        debug: req.query.debug ? {
          hasToken: !!process.env.BLOB_READ_WRITE_TOKEN,
          tokenPrefix: process.env.BLOB_READ_WRITE_TOKEN ? process.env.BLOB_READ_WRITE_TOKEN.slice(0, 12) : null,
          upstreamStatus: upstream.status
        } : undefined
      });
      return;
    }

    const displayName = meta.pathname
      .split('/')
      .pop()
      .replace(/-[A-Za-z0-9_-]{15,}(\.[^./]+)$/, '$1');

    res.setHeader('Content-Type', meta.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(displayName)}`);

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
