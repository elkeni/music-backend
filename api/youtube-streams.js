// api/youtube-streams.js
const SOURCE_API = 'https://appmusic-phi.vercel.app';

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
    const { videoId } = req.query || {};

    console.log(`[youtube-streams] VideoId: "${videoId}"`);

    if (!videoId) {
        return res.status(400).json({
            success: false,
            error: 'Missing videoId parameter'
        });
    }

    try {
        // ✅ RUTA CORRECTA: /api/songs/{id}
        const url = `${SOURCE_API}/api/songs/${videoId}`;
        console.log(`[youtube-streams] Calling: ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`[youtube-streams] Source API error: ${response.status}`);
            return res.status(response.status).json({
                success: false,
                error: `Source API error: ${response.status}`
            });
        }

        const data = await response.json();
        
        // ✅ ESTRUCTURA CORRECTA: data.data[0]
        const songData = data.data?.[0] || data.data || data;

        if (!songData) {
            return res.status(404).json({
                success: false,
                error: 'Song not found'
            });
        }

        // ✅ Extraer downloadUrl
        let streams = [];
        const downloadLinks = songData.downloadUrl || [];

        if (Array.isArray(downloadLinks)) {
            streams = downloadLinks.map(linkObj => ({
                url: linkObj.url,
                quality: linkObj.quality || 'unknown',
                format: 'mp4'
            })).filter(s => s.url);
        }

        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No audio streams available'
            });
        }

        console.log(`[youtube-streams] Found ${streams.length} streams`);
        return res.status(200).json({ success: true, audioStreams: streams });

    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ success: false, error: 'Timeout' });
        }
        console.error('[youtube-streams] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}

export default allowCors(handler);