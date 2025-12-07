// api/youtube-search.js
const SOURCE_API = 'https://appmusic-phi.vercel.app';

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res. setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res. status(200).end();
        return;
    }
    return await fn(req, res);
};

async function handler(req, res) {
    const startTime = Date.now();
    const { q, limit = 10 } = req.query || {};

    console.log(`[youtube-search] ▶️ Query: "${q}", Limit: ${limit}`);

    if (!q) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing query parameter (q)' 
        });
    }

    try {
        const targetUrl = `${SOURCE_API}/api/search? query=${encodeURIComponent(q)}`;
        console.log(`[youtube-search] 🔗 Llamando a: ${targetUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const r = await fetch(targetUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!r.ok) {
            console.error(`[youtube-search] ❌ Source API respondió: ${r.status}`);
            return res.status(r.status).json({ 
                success: false, 
                error: `Source API error: ${r.status}` 
            });
        }

        const data = await r.json();

        // Ruta correcta según estructura de Saavn API
        const rawResults = data.data?. songs?. results || data.data?.results || [];

        if (rawResults.length === 0) {
            console.warn(`[youtube-search] ⚠️ No se encontraron resultados para: "${q}"`);
        }

        const results = rawResults.slice(0, Number(limit)).map((item) => {
            // Extraer thumbnail de mejor calidad
            let thumb = '';
            if (Array.isArray(item.image)) {
                const highQual = item.image. find(i => i.quality === '500x500');
                thumb = highQual?. url || item.image[item.image.length - 1]?.url || '';
            } else if (typeof item.image === 'string') {
                thumb = item.image;
            }

            return {
                title: item.title || item.name || 'Sin título',
                author: { name: item.primaryArtists || item.artist || 'Desconocido' },
                duration: item.duration || 0,
                videoId: item.id,
                thumbnail: thumb,
                source: 'saavn'
            };
        });

        const elapsed = Date.now() - startTime;
        console.log(`[youtube-search] ✅ ${results.length} resultados en ${elapsed}ms`);

        return res.status(200).json({ success: true, results });

    } catch (err) {
        if (err.name === 'AbortError') {
            console. error('[youtube-search] ⏱️ Timeout llamando a Source API');
            return res.status(504).json({ success: false, error: 'Source API timeout' });
        }
        console.error('[youtube-search] 💥 CRASH:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}

export default allowCors(handler);