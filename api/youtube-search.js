// api/youtube-search.js

// Lista de instancias por si una falla. Puedes rotarlas o usar una principal.
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://api.piped.io' 
];

// Función auxiliar para CORS
const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

async function handler(req, res) {
  const { q, limit = 10 } = req.query || {};

  if (!q) {
    return res.status(400).json({ success: false, error: 'Missing query parameter (q)' });
  }

  // Usamos la primera instancia (puedes implementar lógica de rotación si prefieres)
  const baseUrl = PIPED_INSTANCES[0];
  const url = `${baseUrl}/search?q=${encodeURIComponent(q)}&filter=videos`;

  console.log(`[youtube-search] Fetching: ${url}`);

  try {
    const r = await fetch(url);
    
    // 1. Verificar status HTTP
    if (!r.ok) {
      const text = await r.text(); // Leemos como texto por si es error HTML
      console.error(`[youtube-search] Piped Error ${r.status}:`, text.slice(0, 200)); // Logueamos solo el inicio
      return res.status(r.status).json({ success: false, error: `Upstream error: ${r.status}` });
    }

    // 2. Intentar parsear JSON de forma segura
    let data;
    try {
      data = await r.json();
    } catch (e) {
      console.error('[youtube-search] Failed to parse JSON. Response might be HTML (Cloudflare).');
      return res.status(502).json({ success: false, error: 'Invalid response from upstream' });
    }

    // 3. Mapeo defensivo (items puede ser undefined si la búsqueda no trajo nada)
    const items = data.items || []; 
    
    const results = items
      .filter(item => item.type === 'stream') // Aseguramos que sea un video, no una playlist o canal
      .slice(0, Number(limit))
      .map((item) => {
        // Piped a veces da la URL completa "/watch?v=ID" o solo el ID.
        let vid = item.url ? item.url.replace('/watch?v=', '') : item.url;
        
        return {
          title: item.title,
          author: { name: item.uploaderName || 'Unknown' },
          duration: item.duration, // Piped suele dar segundos (number) o string formateado.
          videoId: vid,
          thumbnail: item.thumbnail
        };
      });

    return res.status(200).json({ success: true, results });

  } catch (err) {
    console.error('[youtube-search] CRITICAL ERROR:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export default allowCors(handler);