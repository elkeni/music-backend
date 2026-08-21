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
            if (process.env.DEBUG_MATCHING === 'true') {
                console.log(`[DEBUG] Rejected: "${candidate.title}" Reason: ${evaluation.rejectReason} Score: ${evaluation.scores.finalConfidence}`);
                console.log(`[DEBUG] Identity:`, JSON.stringify(evaluation.details?.identity));
            }
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

    const cleanArtist = cleanPart(artist);
    const cleanTrack = cleanPart(track);
    const cleanQuery = `${cleanArtist} ${cleanTrack}`.replace(/\s+/g, ' ').trim();

    // Algunos índices de Saavn ponderan mucho más las primeras palabras y no
    // interpretan bien contracciones como "Can't". Estas variantes solo
    // amplían el recall; selectBestCandidate mantiene los gates estrictos de
    // artista + título para impedir falsos positivos.
    const weakSearchWords = new Set(['a', 'an', 'and', 'can', 'cant', 'cannot', 'of', 'or', 't', 'the']);
    const compactArtist = cleanArtist
        .split(' ')
        .filter(token => token && !weakSearchWords.has(token.toLowerCase()))
        .join(' ');
    const titleFirstQuery = `${cleanTrack} ${cleanArtist}`.replace(/\s+/g, ' ').trim();
    const compactArtistQuery = `${cleanTrack} ${compactArtist}`.replace(/\s+/g, ' ').trim();

    return [...new Set([
        rawQuery,
        cleanQuery,
        titleFirstQuery,
        compactArtistQuery,
        cleanTrack
    ].filter(Boolean))];
}

export function buildMetadataSearchQueries(metadata, requestedArtist, requestedTrack) {
    if (!metadata) return [];

    const contributors = Array.isArray(metadata.contributors)
        ? metadata.contributors.map(item => item?.name || item).filter(Boolean)
        : [];
    const queries = contributors.map(name => `${requestedTrack} ${name}`.trim());

    if (metadata.album) queries.push(`${metadata.album} ${requestedTrack}`.trim());
    if (metadata.artist && metadata.artist !== requestedArtist) {
        queries.push(`${requestedTrack} ${metadata.artist}`.trim());
    }

    return [...new Set(queries.filter(Boolean))];
}

async function searchSaavnCandidates(artist, track, extraQueries = []) {
    const queries = [...new Set([...buildSearchQueries(artist, track), ...extraQueries])];
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

/**
 * Saavn a veces no indexa una canción por su artista principal, especialmente
 * en lanzamientos recientes con colaboradores. Deezer se usa únicamente como
 * catálogo de metadatos para descubrir esos colaboradores/álbum; el audio
 * continúa viniendo de Saavn y debe superar el matcher estricto.
 */
async function findExternalMetadata(artist, track) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 2200);

    try {
        const query = `artist:"${artist}" track:"${track}"`;
        const searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`;
        const searchResponse = await fetch(searchUrl, { signal: ctrl.signal });
        if (!searchResponse.ok) return null;

        const searchData = await searchResponse.json();
        const candidates = (searchData?.data || []).map(item => ({
            ...item,
            name: item.title,
            artist: item.artist?.name || '',
            artists: item.contributors || []
        }));
        const best = selectBestCandidate(candidates, artist, track);
        if (!best?.id) return null;

        const trackResponse = await fetch(`https://api.deezer.com/track/${best.id}`, {
            signal: ctrl.signal
        });
        if (!trackResponse.ok) return null;

        const details = await trackResponse.json();
        return {
            artist: details.artist?.name || best.artist?.name || '',
            album: details.album?.title || '',
            contributors: details.contributors || []
        };
    } catch (error) {
        console.log('[instant-play] Metadata enrichment unavailable:', error.message);
        return null;
    } finally {
        clearTimeout(tid);
    }
}

async function searchYouTubeCandidate(artist, track) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const apiKey = process.env.YOUTUBE_INNERTUBE_API_KEY || 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

    try {
        const response = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${apiKey}`, {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 15) gzip',
                'X-YouTube-Client-Name': '3',
                'X-YouTube-Client-Version': '20.10.38'
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'ANDROID',
                        clientVersion: '20.10.38',
                        androidSdkVersion: 35,
                        hl: 'en',
                        gl: 'US'
                    }
                },
                query: `${artist} ${track}`.trim()
            })
        });
        if (!response.ok) return null;

        const data = await response.json();
        const renderers = [];
        const visit = value => {
            if (!value || typeof value !== 'object' || renderers.length >= 20) return;
            if (value.videoId && value.title) renderers.push(value);
            for (const child of Object.values(value)) visit(child);
        };
        const textOf = value => value?.runs?.map(run => run.text).join('') || value?.simpleText || '';
        visit(data);

        const unique = new Map();
        for (const video of renderers) {
            if (unique.has(video.videoId)) continue;
            const title = textOf(video.title);
            if (!title) continue;
            const channel = textOf(video.ownerText) || textOf(video.longBylineText) || textOf(video.shortBylineText);
            const thumbnails = video.thumbnail?.thumbnails || [];
            unique.set(video.videoId, {
                id: video.videoId,
                name: title,
                title,
                artist: channel,
                primaryArtists: channel,
                duration: 0,
                image: [{ url: thumbnails.at(-1)?.url || '', quality: '500x500' }],
                source: 'youtube'
            });
        }
        const candidates = [...unique.values()].slice(0, 10);
        return selectBestCandidate(candidates, artist, track);
    } catch (error) {
        console.log('[instant-play] YouTube catalog search unavailable:', error.message);
        return null;
    } finally {
        clearTimeout(tid);
    }
}

async function quickSearch(artist, track) {
    let bestCandidate = null;
    let metadataConfirmedTrack = false;

    // 1. INTENTO PRIMARIO: Saavn API con variantes robustas de query
    try {
        const results = await searchSaavnCandidates(artist, track);
        if (results.length > 0) {
            bestCandidate = selectBestCandidate(results, artist, track);
        }
    } catch (e) {
        console.log('[instant-play] Saavn search failed/timeout, trying fallback...');
    }

    // 2. ENRIQUECIMIENTO: recuperar colaboradores/álbum y reintentar Saavn.
    if (!bestCandidate) {
        try {
            const metadata = await findExternalMetadata(artist, track);
            metadataConfirmedTrack = !!metadata;
            const metadataQueries = buildMetadataSearchQueries(metadata, artist, track);
            if (metadataQueries.length > 0) {
                const enrichedResults = await searchSaavnCandidates(artist, track, metadataQueries);
                bestCandidate = selectBestCandidate(enrichedResults, artist, track);
            }
        } catch (err) {
            console.error('[instant-play] Metadata-enriched search failed:', err.message);
        }
    }

    if (!bestCandidate) {
        bestCandidate = await searchYouTubeCandidate(artist, track);
    }

    if (!bestCandidate) {
        console.log('[instant-play] ❌ No valid match found (Artist specific). Aborting.');
        return { failureCode: metadataConfirmedTrack ? 'AUDIO_SOURCE_UNAVAILABLE' : 'NO_MATCH' };
    }

    const best = bestCandidate;

    // Extraer artista limpio usando el extractor
    const artistInfo = extractArtistInfo({
        primaryArtists: best.primaryArtists || best.artist || '',
        artists: best.artists
    });

    return {
        source: best.source === 'youtube' ? 'youtube' : 'saavn',
        videoId: best.id,
        title: best.source === 'youtube' ? track : (best.name || best.title || track),
        artist: best.source === 'youtube' ? artist : (artistInfo.full || artist),
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

/**
 * Resuelve audio de YouTube con el cliente Android oficial de InnerTube. A
 * diferencia del fallback anterior, este ID nunca se envía a Saavn.
 */
async function getYouTubeAudioStream(videoId) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4500);
    const apiKey = process.env.YOUTUBE_INNERTUBE_API_KEY || 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
    const clients = [
        {
            id: '3',
            userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 15) gzip',
            context: {
                clientName: 'ANDROID',
                clientVersion: '20.10.38',
                androidSdkVersion: 35,
                hl: 'en',
                gl: 'US'
            }
        },
        {
            id: '5',
            userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X)',
            context: {
                clientName: 'IOS',
                clientVersion: '20.10.4',
                deviceMake: 'Apple',
                deviceModel: 'iPhone16,2',
                osName: 'iPhone',
                osVersion: '18.3.1.22D72',
                hl: 'en',
                gl: 'US'
            }
        }
    ];

    try {
        for (const client of clients) {
            const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
                method: 'POST',
                signal: ctrl.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': client.userAgent,
                    'X-YouTube-Client-Name': client.id,
                    'X-YouTube-Client-Version': client.context.clientVersion
                },
                body: JSON.stringify({
                    context: { client: client.context },
                    videoId,
                    contentCheckOk: true,
                    racyCheckOk: true
                })
            });
            if (!response.ok) continue;

            const data = await response.json();
            if (data.playabilityStatus?.status !== 'OK') continue;

            const formats = (data.streamingData?.adaptiveFormats || [])
                .filter(format => format.url && /^audio\//i.test(format.mimeType || ''))
                .filter(format => Number(format.bitrate || 0) >= 96000)
                .sort((left, right) => {
                    const leftMp4 = /audio\/mp4/i.test(left.mimeType || '') ? 0 : 1;
                    const rightMp4 = /audio\/mp4/i.test(right.mimeType || '') ? 0 : 1;
                    return leftMp4 - rightMp4 || Number(left.bitrate) - Number(right.bitrate);
                });
            if (formats.length === 0) continue;

            return {
                audioUrl: formats[0].url,
                quality: `${Math.round(Number(formats[0].bitrate) / 1000)}kbps`
            };
        }
        return null;
    } catch (error) {
        console.log('[instant-play] YouTube stream unavailable:', error.message);
        return null;
    } finally {
        clearTimeout(tid);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    const startTime = Date.now();

    // Los errores nunca deben quedar congelados en el CDN. Solo una respuesta
    // reproducible recibe caché pública al final del handler.
    res.setHeader('Cache-Control', 'no-store');

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

    if (searchResult?.failureCode) {
        return res.status(404).json({
            success: false,
            code: searchResult.failureCode,
            error: searchResult.failureCode === 'AUDIO_SOURCE_UNAVAILABLE'
                ? 'Track exists but is unavailable in the configured audio catalog'
                : 'Track not found',
            ms: Date.now() - startTime
        });
    }

    // PASO 2: Obtener stream de audio
    const streamResult = searchResult.source === 'youtube'
        ? await getYouTubeAudioStream(searchResult.videoId)
        : await getAudioStream(searchResult.videoId);

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
    res.setHeader('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=3600');
    return res.status(200).json({
        success: true,
        audioUrl: streamResult.audioUrl,
        quality: streamResult.quality,
        track: {
            title: searchResult.title,
            artist: searchResult.artist,
            thumbnail: searchResult.thumbnail,
            videoId: searchResult.videoId,
            source: searchResult.source
        },
        ms: totalMs
    });
}

export default allowCors(handler);
