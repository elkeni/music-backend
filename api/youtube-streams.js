// api/youtube-streams.js
const SOURCE_API = 'https://appmusic-phi.vercel.app';

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res. status(200).end();
        return;
    }
    return await fn(req, res);
};

async function handler(req, res) {
    const startTime = Date.now();
    const { videoId } = req.query || {};

    console.log(`[youtube-streams] ▶️ VideoId: "${videoId}"`);

    if (!videoId) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing videoId parameter' 
        });
    }

    try {
        const url = `${SOURCE_API}/api/songs? id=${encodeURIComponent(videoId)}`;
        console.log(`[youtube-streams] 🔗 Llamando a: ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const r = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!r. ok) {
            console.error(`[youtube-streams] ❌ Source API respondió: ${r.status}`);
            return res.status(r.status). json({ 
                success: false, 
                error: `Source API error: ${r.status}` 
            });
        }

        const data = await r. json();

        // Saavn puede devolver diferentes estructuras
        const songData = data.data?.[0] || data[0] || data. data || data;

        if (!songData) {
            console.warn(`[youtube-streams] ⚠️ No se encontró canción con id: ${videoId}`);
            return res.status(404).json({ 
                success: false, 
                error: 'Song not found' 
            });
        }

        let streams = [];
        const downloadLinks = songData.downloadUrl || songData.download_url || [];

        if (Array.isArray(downloadLinks)) {
            streams = downloadLinks
                .map(linkObj => ({
                    url: linkObj. url || linkObj. link,
                    quality: linkObj. quality || 'unknown',
                    format: 'mp4'
                }))
                .filter(s => s.url); // Filtrar streams sin URL
        } else if (typeof downloadLinks === 'string') {
            streams. push({
                url: downloadLinks,
                quality: 'high',
                format: 'mp4'
            });
        }

        // Fallback: media_url
        if (streams.length === 0 && songData.media_url) {
            streams.push({ 
                url: songData.media_url, 
                quality: 'default', 
                format: 'mp4' 
            });
        }

        const elapsed = Date. now() - startTime;

        if (streams.length === 0) {
            console.warn(`[youtube-streams] ⚠️ No hay streams disponibles para: ${videoId}`);
            return res.status(404).json({ 
                success: false, 
                error: 'No audio streams available' 
            });
        }

        console.log(`[youtube-streams] ✅ ${streams.length} streams en ${elapsed}ms`);
        return res.status(200). json({ success: true, audioStreams: streams });

    } catch (err) {
        if (err.name === 'AbortError') {
            console. error('[youtube-streams] ⏱️ Timeout');
            return res.status(504).json({ success: false, error: 'Source API timeout' });
        }
        console.error('[youtube-streams] 💥 CRASH:', err.message);
        return res.status(500).json({ success: false, error: 'Internal Error' });
    }
}

export default allowCors(handler);