// api/youtube-search.js

// Lista de instancias públicas activas (Mezcla de regiones para evitar bloqueos)
// Si una falla, el código probará la siguiente automáticamente.
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',      // Official (a veces inestable)
  'https://pipedapi.tokhmi.xyz',       // US
  'https://pipedapi.moomoo.me',        // UK
  'https://pipedapi.syncpundit.io',    // Multi-region
  'https://api-piped.mha.fi',          // Finlandia
  'https://piped-api.lunar.icu',       // Alemania
  'https://pipedapi.r4fo.com'          // Alemania
];

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

  let lastError = null;

  // BUCLE DE INTENTOS (FAILOVER)
  for (const baseUrl of PIPED_INSTANCES) {
    try {
      const url = `${baseUrl}/search?q=${encodeURIComponent(q)}&filter=videos`;
      console.log(`[youtube-search] Trying instance: ${baseUrl}`);

      // Añadimos un timeout de 4 segundos para no quedarnos colgados si una instancia es lenta
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); 

      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (r.ok) {
        // ¡ÉXITO! Procesamos y devolvemos la respuesta
        const data = await r.json();
        const items = data.items || [];
        
        const results = items
          .filter(item => item.type === 'stream')
          .slice(0, Number(limit))
          .map((item) => {
            let vid = item.url ? item.url.replace('/watch?v=', '') : item.url;
            return {
              title: item.title,
              author: { name: item.uploaderName || 'Unknown' },
              duration: item.duration,
              videoId: vid,
              thumbnail: item.thumbnail
            };
          });

        console.log(`[youtube-search] Success with ${baseUrl}`);
        return res.status(200).json({ success: true, results });
      } else {
        console.warn(`[youtube-search] Failed ${baseUrl} with status ${r.status}`);
        lastError = `Status ${r.status}`;
        // El bucle continuará con la siguiente instancia...
      }
    } catch (err) {
      console.warn(`[youtube-search] Error connecting to ${baseUrl}: ${err.message}`);
      lastError = err.message;
      // El bucle continuará...
    }
  }

  // Si llegamos aquí, TODAS las instancias fallaron
  return res.status(503).json({ 
    success: false, 
    error: 'All Piped instances failed. Try again later.', 
    lastDetail: lastError 
  });
}

export default allowCors(handler);