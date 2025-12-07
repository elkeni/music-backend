// api/youtube-search.js

// Tu API estable de respaldo (JioSaavn)
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
  const { q } = req.query || {};

  if (!q) {
    return res.status(400).json({ success: false, error: 'Missing query (q)' });
  }

  try {
    console.log(`[proxy-search] Calling: ${SOURCE_API}/api/search?query=${q}`);
    
    // Llamamos a tu API de música existente
    const r = await fetch(`${SOURCE_API}/api/search?query=${encodeURIComponent(q)}`);
    
    if (!r.ok) {
      console.error('[proxy-search] Upstream error:', r.status);
      return res.status(r.status).json({ success: false, error: 'Source API error' });
    }

    const data = await r.json();
    
    // NOTA: Aquí asumimos que appmusic-phi devuelve una estructura estandar de Saavn.
    // Adaptamos la respuesta para que tu frontend actual no se rompa.
    // Si la estructura de appmusic-phi es diferente, verás los logs y ajustaremos.

    const rawResults = data.data?.results || data.results || [];
    
    const results = rawResults.map((item) => ({
      title: item.name || item.title,
      author: { name: item.primaryArtists || item.artist || 'Unknown' },
      duration: item.duration || 0,
      videoId: item.id, // Usamos el ID de Saavn como si fuera videoId
      thumbnail: item.image?.[2]?.link || item.image?.[0]?.link || item.image, // Intentamos sacar la mejor calidad
      source: 'saavn' // Marca para saber que viene de Saavn
    }));

    return res.status(200).json({ success: true, results });

  } catch (err) {
    console.error('[proxy-search] CRASH:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export default allowCors(handler);