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

        // ═══════════════════════════════════════════════════════════════════════════
        // SELECCIÓN INTELIGENTE (FILTRO ESTRICTO)
        // No tomar ciegamente el primero, buscar el mejor match "Oficial"
        // ═══════════════════════════════════════════════════════════════════════════

        let bestCandidate = null;
        let bestScore = -1;

        const targetParams = {
            targetTitle: track,
            targetArtist: artist,
            targetDuration: 0, // No tenemos duración en instant play usualmente
            targetAlbum: ''
        };

        // Escanear los candidatos (máximo 5) en busca del mejor match
        for (const item of results) {
            // Normalizar formato de item si viene de Saavn para que el extractor lo entienda
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

            // Prioridad absoluta: Si pasa el filtro estricto (Score > 0.85 o Identity > 0.9)
            if (evaluation.passed) {
                // Si encontramos uno que pasa "de verdad", nos quedamos con ese y cortamos
                // (Optimización de velocidad: el primero "bueno" gana)
                if (evaluation.scores.finalConfidence >= 0.85) {
                    bestCandidate = item;
                    break;
                }

                // Si pasa pero raspando, guardamos por si hay uno mejor
                if (evaluation.scores.finalConfidence > bestScore) {
                    bestScore = evaluation.scores.finalConfidence;
                    bestCandidate = item;
                }
            }
        }

        // FALLBACK INTELIGENTE:
        // Si ninguno pasó el filtro estricto (Score > 0.85), buscamos CUALQUIERA que al menos coincida en Artista.
        // Motivo: Preferimos un título ligeramente diferente (Live/Demo) del ARTISTA CORRECTO 
        // antes que una canción perfecta de un ARTISTA INCORRECTO (Cover).

        if (!bestCandidate) {
            console.log('[instant-play] ⚠️ Strict match failed. Trying artist-only match...');

            // Buscar coincidencia de artista "decente" (Score > 0.8)
            const artistOnlyMatch = results.find(item => {
                // Normalizar Item
                const candidate = {
                    name: item.name || item.title,
                    artist: item.artist || item.primaryArtists || '',
                    artists: item.artists || [],
                    album: item.album?.name || item.album
                };

                // Evaluar solo identidad de artista usando el extractor
                // (Usamos evaluateCandidate completo pero miramos scores internos)
                const evalResult = evaluateCandidate(candidate, targetParams);
                const scores = evalResult.scores || {};
                const details = evalResult.details?.identity || {};

                // Criterio de rescate:
                // 1. El Artista debe coincidir bien (>= 0.8)
                // 2. No debe ser prohibido (verificado por evaluateCandidate -> passed/rejected)
                // 3. El título no debe ser atroz (>= 0.4)

                // NOTA: Si evaluateCandidate dice 'rejected' por version prohibida, NO usar.
                if (evalResult.rejected) return false;

                // Verificamos match de artista manual si es necesario, o confiamos en el score
                return (details.artistScore >= 0.8 && details.titleScore >= 0.3);
            });

            if (artistOnlyMatch) {
                console.log(`[instant-play] ✅ Salvaged by Artist Match: "${artistOnlyMatch.name}"`);
                bestCandidate = artistOnlyMatch;
            }
        }

        // ÚLTIMA LÍNEA DE DEFENSA:
        // Si aun así no tenemos candidato, SIGNIFICA QUE NO HAY NADA DEL ARTISTA.
        // Devolvemos NULL para que el frontend no reproduzca basura.
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
