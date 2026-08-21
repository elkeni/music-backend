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
 * 
 * VENTAJA: Una sola llamada HTTP en lugar de dos secuenciales
 * ACTUALIZADO: Integra validación estricta para evitar versiones "Live" involuntarias
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { evaluateCandidate, extractArtistInfo } from '../src/music/extraction/youtube-extractor.js';

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

/**
 * Selecciona el mejor candidato de una lista de resultados
 * @param {Array} results - Lista de resultados
 * @param {string} artist - Artista buscado
 * @param {string} track - Canción buscada
 */
function selectBestCandidate(results, artist, track) {
    let bestCandidate = null;
    let bestScore = -1;

    const targetParams = {
        targetTitle: track,
        targetArtist: artist,
        targetDuration: 0,
        targetAlbum: ''
    };

    for (const item of results) {
        // Normalizar formato
        const candidate = {
            name: item.name || item.title,
            title: item.name || item.title,
            artist: item.artist || item.primaryArtists || '',
            artists: item.artists || [],
            duration: item.duration || 0,
            year: item.year || item.releaseDate,
            album: item.album?.name || item.album
        };

        const evaluation = evaluateCandidate(candidate, targetParams);

        if (evaluation.passed) {
            if (evaluation.scores.finalConfidence >= 0.90) {
                return item; // Retorno inmediato si es excelente
            }

            if (evaluation.scores.finalConfidence > bestScore) {
                bestScore = evaluation.scores.finalConfidence;
                bestCandidate = item;
            }
        } else {
            console.log(`[DEBUG] Rejected: "${candidate.title}" Reason: ${evaluation.rejectReason} Score: ${evaluation.scores.finalConfidence}`);
            console.log(`[DEBUG] Identity:`, JSON.stringify(evaluation.details?.identity));
        }
    }

    return bestCandidate;
}

/**
 * Saavn es muy sensible a &, puntos, apóstrofes Unicode y descriptores de
 * versión. Consultamos la forma original y una forma segura, y luego dejamos
 * que el matcher estricto decida entre todos los candidatos.
 */
export function buildSearchQueries(artist, track) {
    const rawQuery = `${artist || ''} ${track || ''}`.replace(/\s+/g, ' ').trim();
    const cleanPart = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u2018\u2019']/g, '')
        .replace(/[&]/g, ' ')
        .replace(/[.]+/g, ' ')
        .replace(/[\[(][^\])]*\b(remix|remaster(?:ed)?|live|en\s+vivo|radio\s+edit|version)\b[^\])]*[\])]/gi, ' ')
        .replace(/[^a-z0-9@\-\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const cleanQuery = `${cleanPart(artist)} ${cleanPart(track)}`.replace(/\s+/g, ' ').trim();
    return [...new Set([rawQuery, cleanQuery].filter(Boolean))];
}

async function searchSaavnCandidates(artist, track) {
    const queries = buildSearchQueries(artist, track);
    const searches = queries.map(async (query) => {
        const url = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=10`;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2500);

        try {
            const res = await fetch(url, { signal: ctrl.signal });
            if (!res.ok) return [];
            const data = await res.json();
            return data?.data?.results || [];
        } catch {
            return [];
        } finally {
            clearTimeout(tid);
        }
    });

    const batches = await Promise.all(searches);
    const unique = new Map();
    for (const item of batches.flat()) {
        const key = item.id || `${item.name}|${item.primaryArtists || ''}`;
        if (!unique.has(key)) unique.set(key, item);
    }
    return [...unique.values()];
}

async function quickSearch(artist, track) {
    const query = `${artist} ${track}`.trim();

    let bestCandidate = null;

    // 1. INTENTO PRIMARIO: Saavn API con variantes robustas de query
    try {
        const results = await searchSaavnCandidates(artist, track);
        if (results.length > 0) {
            bestCandidate = selectBestCandidate(results, artist, track);
        }
    } catch (e) {
        console.log('[instant-play] Saavn search failed/timeout, trying fallback...');
    }

    // 2. FALLBACK: YouTube-SR (Si no hubo match en Saavn)
    if (!bestCandidate) {
        try {
            console.log('[instant-play] ⚠️ Falling back to clean YouTube-SR...');
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            const YouTube = require('youtube-sr').default || require('youtube-sr');

            console.log(`[instant-play] Searching YouTube-SR with query: "${query}"`);
            const videos = await YouTube.search(query, { limit: 5, type: 'video', safeSearch: true });
            console.log(`[instant-play] YouTube-SR found ${videos.length} videos`);

            const results = videos.map(v => ({
                id: v.id,
                name: v.title,
                title: v.title,
                artist: v.channel ? v.channel.name : '',
                primaryArtists: v.channel ? v.channel.name : '',
                duration: v.duration / 1000,
                image: [{ url: v.thumbnail?.url || '', quality: '500x500' }]
            }));

            if (results.length > 0) {
                bestCandidate = selectBestCandidate(results, artist, track);
            }

        } catch (err) {
            console.error('[instant-play] Fallback failed:', err.message);
        }
    }

    if (!bestCandidate) {
        console.log('[instant-play] ❌ No valid match found (Artist specific). Aborting.');
        return null;
    }

    const best = bestCandidate;

    // Extraer artista limpio usando el extractor
    const artistInfo = extractArtistInfo({
        primaryArtists: best.primaryArtists || best.artist || '',
        artists: best.artists
    });

    return {
        videoId: best.id,
        title: best.name || best.title || track,
        artist: artistInfo.full || artist, // Usar nombre limpio
        thumbnail: best.image?.find(i => i.quality === '500x500')?.url || best.image?.[0]?.url || ''
    };
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

        // Ordenar por velocidad (96kbps preferible para instant play)
        const streams = songData.downloadUrl
            .map(s => ({
                url: s.url,
                quality: s.quality || 'unknown',
                kbps: parseInt(String(s.quality).match(/(\d+)/)?.[1] || '0', 10)
            }))
            .filter(s => s.url && s.kbps >= 96) // Mínimo aceptable
            .sort((a, b) => a.kbps - b.kbps); // Ascendente: 96 -> 160 -> 320

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
