// api/youtube-search.js

const SOURCE_API = 'https://appmusic-phi.vercel.app';

const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

async function handler(req, res) {
  const { q, limit = 10 } = req.query || {};

  if (!q) {
    return res.status(400).json({ success: false, error: 'Missing query (q)' });
  }

  try {
    const targetUrl = `${SOURCE_API}/api/search?query=${encodeURIComponent(q)}`;
    console.log(`[proxy-search] Calling: ${targetUrl}`);
    
    const r = await fetch(targetUrl);
    if (!r.ok) {
        return res.status(r.status).json({ success: false, error: 'Source API error' });
    }

    const data = await r.json();
    
    // --- CORRECCIÓN BASADA EN TU CAPTURA ---
    // Ruta exacta: data -> songs -> results
    const rawResults = data.data?.songs?.results || [];

    const results = rawResults.slice(0, Number(limit)).map((item) => {
      // Corrección: Usamos .url en lugar de .link
      let thumb = '';
      if (Array.isArray(item.image)) {
          // Buscamos la imagen de 500x500 o la última disponible
          thumb = item.image.find(i => i.quality === '500x500')?.url || item.image[item.image.length - 1]?.url;
      } else {
          thumb = item.image;
      }

      return {
        title: item.title || item.name,
        author: { name: item.primaryArtists || item.artist || 'Unknown' },
        duration: item.duration || 0,
        videoId: item.id, 
        thumbnail: thumb,
        source: 'saavn'
      };
    });

    console.log(`[proxy-search] Found ${results.length} songs.`);
    return res.status(200).json({ success: true, results });

  } catch (err) {
    console.error('[proxy-search] CRASH:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export default allowCors(handler);