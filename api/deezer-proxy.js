// api/deezer-proxy.js
// Proxy para evitar CORS con Deezer API

const DEEZER_API = 'https://api.deezer.com';

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    return await fn(req, res);
};

async function handler(req, res) {
    // El endpoint de Deezer viene como query param
    // Ejemplo: /api/deezer-proxy? endpoint=/chart/0/tracks&limit=20
    const { endpoint } = req.query;

    if (!endpoint) {
        return res.status(400).json({
            success: false,
            error: 'Missing endpoint parameter. Example: ? endpoint=/chart/0/tracks'
        });
    }

    try {
        // Construir URL completa de Deezer
        // endpoint ya incluye los query params de Deezer, así que lo pasamos directo
        const deezerUrl = `${DEEZER_API}${endpoint}`;
        console.log(`[deezer-proxy] Fetching: ${deezerUrl}`);

        const controller = new AbortController();
        // TURBO: Timeout de 5s
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(deezerUrl, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'MusicApp/1.0'
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: `Deezer API error: ${response.status}`
            });
        }

        const data = await response.json();

        // Devolver la respuesta de Deezer tal cual
        return res.status(200).json(data);

    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ success: false, error: 'Deezer API timeout' });
        }
        console.error('[deezer-proxy] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}

export default allowCors(handler);