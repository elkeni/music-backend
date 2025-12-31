/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚡ INSTANT PLAY - Búsqueda + Stream en UNA sola llamada
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Endpoint: GET /api/instant-play
 * 
 * Query params:
 * - artist: Nombre del artista
 * - track: Nombre de la canción
 * - duration: Duración en segundos (opcional)
 * 
 * Respuesta:
 * {
 *   success: true,
 *   audioUrl: "https://...",
 *   quality: "320kbps",
 *   track: { title, artist, thumbnail, videoId }
 * }
 * 
 * VENTAJA: Una sola llamada HTTP en lugar de dos secuenciales
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const config = { runtime: 'nodejs' };

const SOURCE_API = process.env.SOURCE_API_URL || 'https://appmusic-phi.vercel.app';

// ═══════════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════════

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, save-data');
    if (req.method === 'OPTIONS') return res.status(200).end();
    return await fn(req, res);
};

// ═══════════════════════════════════════════════════════════════════════════════
// BÚSQUEDA RÁPIDA EN SAAVN
// ═══════════════════════════════════════════════════════════════════════════════

async function quickSearch(artist, track) {
    const query = `${artist} ${track}`.trim();
    const url = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=5`;

    const ctrl = new AbortController();
    // TURBO: Solo 1.5s para búsqueda
    const tid = setTimeout(() => ctrl.abort(), 1500);

    try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);

        if (!res.ok) return null;
        const data = await res.json();
        const results = data?.data?.results || [];

        if (results.length === 0) return null;

        // Tomar el primer resultado (ya viene ordenado por relevancia)
        const best = results[0];
        return {
            videoId: best.id,
            title: best.name || best.title || track,
            artist: best.primaryArtists || best.artist || artist,
            thumbnail: best.image?.find(i => i.quality === '500x500')?.url || best.image?.[0]?.url || ''
        };
    } catch (e) {
        clearTimeout(tid);
        console.log('[instant-play] Search failed:', e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBTENER STREAM DE AUDIO
// ═══════════════════════════════════════════════════════════════════════════════

async function getAudioStream(videoId) {
    const url = `${SOURCE_API}/api/songs/${videoId}`;

    const ctrl = new AbortController();
    // TURBO: Solo 2s para streams
    const tid = setTimeout(() => ctrl.abort(), 2000);

    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(tid);

        if (!res.ok) return null;

        const data = await res.json();
        const songData = data.data?.[0] || data.data || data;

        if (!songData?.downloadUrl || !Array.isArray(songData.downloadUrl)) return null;

        // Ordenar por calidad (mayor primero) y tomar la mejor
        const streams = songData.downloadUrl
            .map(s => ({
                url: s.url,
                quality: s.quality || 'unknown',
                kbps: parseInt(String(s.quality).match(/(\d+)/)?.[1] || '0', 10)
            }))
            .filter(s => s.url && s.kbps >= 96)
            .sort((a, b) => b.kbps - a.kbps);

        if (streams.length === 0) return null;

        return {
            audioUrl: streams[0].url,
            quality: streams[0].quality
        };
    } catch (e) {
        clearTimeout(tid);
        console.log('[instant-play] Stream failed:', e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    const startTime = Date.now();

    // Cache agresivo
    res.setHeader('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=3600');

    const { artist, track, title } = req.query;
    const trackName = track || title || '';

    if (!artist && !trackName) {
        return res.status(400).json({
            success: false,
            error: 'Missing artist or track parameter'
        });
    }

    console.log(`[⚡ instant-play] "${artist} - ${trackName}"`);

    // PASO 1: Búsqueda rápida
    const searchResult = await quickSearch(artist || '', trackName);

    if (!searchResult) {
        return res.status(404).json({
            success: false,
            error: 'Track not found',
            ms: Date.now() - startTime
        });
    }

    // PASO 2: Obtener stream de audio
    const streamResult = await getAudioStream(searchResult.videoId);

    if (!streamResult) {
        return res.status(404).json({
            success: false,
            error: 'No audio stream available',
            track: searchResult,
            ms: Date.now() - startTime
        });
    }

    const totalMs = Date.now() - startTime;
    console.log(`[⚡ instant-play] ✅ Done in ${totalMs}ms`);

    // RESPUESTA EXITOSA
    return res.status(200).json({
        success: true,
        audioUrl: streamResult.audioUrl,
        quality: streamResult.quality,
        track: {
            title: searchResult.title,
            artist: searchResult.artist,
            thumbnail: searchResult.thumbnail,
            videoId: searchResult.videoId
        },
        ms: totalMs
    });
}

export default allowCors(handler);
