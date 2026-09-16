const { list } = require('@vercel/blob');

module.exports = async (req, res) => {
  try {
    const { blobs } = await list();
    const sorted = blobs
      .slice()
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    res.status(200).json({
      files: sorted.map((b) => ({
        url: b.url,
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
