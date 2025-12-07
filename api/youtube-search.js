// api/youtube-search.js

const PIPED_INSTANCE = 'https://pipedapi.tokhmi.xyz';

export default async function handler(req, res) {
  try {
    console.log('[youtube-search] handler start', req.query);

    const { q, limit = 8 } = req.query || {};

    if (!q) {
      console.log('[youtube-search] missing q');
      return res.status(400).json({ success: false, error: 'Missing q' });
    }

    const url = `${PIPED_INSTANCE}/search?q=${encodeURIComponent(
      q
    )}&filter=videos&region=US`;

    console.log('[youtube-search] fetching', url);

    const r = await fetch(url);
    console.log('[youtube-search] status', r.status);

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.error('[youtube-search] piped error status', r.status, text);
      return res
        .status(r.status)
        .json({ success: false, error: 'Piped search error' });
    }

    const data = await r.json();
    console.log('[youtube-search] data length', Array.isArray(data) ? data.length : 'not array');

    const results = (Array.isArray(data) ? data : [])
      .slice(0, limit)
      .map((item) => {
        let vid = '';
        if (item.url && item.url.includes('watch?v=')) {
          vid = item.url.split('v=')[1]?.split('&')[0];
        } else {
          vid = item.videoId || item.id;
        }
        return {
          title: item.title,
          author: { name: item.uploader || item.uploaderName || '' },
          duration: item.duration,
          videoId: vid,
        };
      });

    res.setHeader('Access-Control-Allow-Origin', '*');
    console.log('[youtube-search] success, results', results.length);
    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('[api/youtube-search] CRASH', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}