/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 YOUTUBE SEARCH API - STUDIO QUALITY ONLY
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Endpoint: GET /api/youtube-search
 * 
 * Usa el módulo unificado de src/music/extraction/youtube-extractor.js
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const config = { runtime: 'nodejs' };

const SOURCE_API = 'https://appmusic-phi.vercel.app';

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTS DEL MÓDULO UNIFICADO
// ═══════════════════════════════════════════════════════════════════════════════

// Importación dinámica para compatibilidad con Vercel
let extractor = null;

async function loadExtractor() {
    if (extractor) return extractor;

    try {
        extractor = await import('../src/music/extraction/youtube-extractor.js');
        return extractor;
    } catch (e) {
        console.error('[youtube-search] Failed to load extractor:', e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════════

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    return await fn(req, res);
};

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK: Funciones mínimas si el módulo no carga
// ═══════════════════════════════════════════════════════════════════════════════

function fallbackNormalize(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function fallbackExtractArtist(item) {
    if (item.primaryArtists?.trim()) return item.primaryArtists.trim();
    if (item.artist && typeof item.artist === 'string') return item.artist.trim();
    if (item.subtitle?.trim()) return item.subtitle.trim();
    return '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// API DE BÚSQUEDA - SISTEMA DUAL (SAAVN + YOUTUBE FALLBACK)
// ═══════════════════════════════════════════════════════════════════════════════

// Lista de instancias de Invidious/Piped (actualizado diciembre 2024)
const YOUTUBE_PROXIES = [
    { name: 'inv-nadeko', url: 'https://inv.nadeko.net', type: 'invidious' },
    { name: 'yewtu', url: 'https://yewtu.be', type: 'invidious' },
    { name: 'inv-nerdvpn', url: 'https://invidious.nerdvpn.de', type: 'invidious' },
    { name: 'inv-privacyredirect', url: 'https://invidious.privacyredirect.com', type: 'invidious' },
    { name: 'piped-kavin', url: 'https://pipedapi.kavin.rocks', type: 'piped' },
];

// Buscar en Saavn (fuente primaria)
async function searchSaavn(query, limit = 30) {
    try {
        const url = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);

        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);

        if (!res.ok) return [];
        const data = await res.json();
        return data?.data?.results || [];
    } catch (e) {
        console.log('[saavn] Error:', e.message);
        return [];
    }
}

// Buscar en YouTube via Invidious/Piped (fallback)
async function searchYouTube(query, limit = 15) {
    for (const proxy of YOUTUBE_PROXIES) {
        try {
            let url;
            if (proxy.type === 'invidious') {
                url = `${proxy.url}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
            } else if (proxy.type === 'piped') {
                url = `${proxy.url}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
            }

            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 8000);

            const res = await fetch(url, { signal: ctrl.signal });
            clearTimeout(tid);

            if (!res.ok) continue;
            const data = await res.json();

            // Normalizar resultados al formato común
            let results = [];

            if (proxy.type === 'invidious') {
                results = (data || []).slice(0, limit).map(item => ({
                    id: item.videoId,
                    name: item.title,
                    title: item.title,
                    artist: item.author || item.authorId || '',
                    primaryArtists: item.author || '',
                    duration: item.lengthSeconds || 0,
                    image: item.videoThumbnails?.[0] ? [{ url: item.videoThumbnails[0].url, quality: '500x500' }] : [],
                    source: 'youtube',
                    _proxy: proxy.name
                }));
            } else if (proxy.type === 'piped') {
                results = (data.items || []).slice(0, limit).map(item => ({
                    id: item.url?.replace('/watch?v=', '') || '',
                    name: item.title,
                    title: item.title,
                    artist: item.uploaderName || item.uploader || '',
                    primaryArtists: item.uploaderName || '',
                    duration: item.duration || 0,
                    image: item.thumbnail ? [{ url: item.thumbnail, quality: '500x500' }] : [],
                    source: 'youtube',
                    _proxy: proxy.name
                }));
            }

            if (results.length > 0) {
                console.log(`[youtube] Found ${results.length} results via ${proxy.name}`);
                return results;
            }
        } catch (e) {
            console.log(`[youtube] ${proxy.name} failed:`, e.message);
            continue;
        }
    }
    return [];
}

// Búsqueda combinada: Saavn primero, YouTube como fallback
async function searchApi(query, limit = 30) {
    // 1. Intentar Saavn primero
    const saavnResults = await searchSaavn(query, limit);

    if (saavnResults.length > 0) {
        console.log(`[search] Saavn: ${saavnResults.length} results`);
        return saavnResults;
    }

    // 2. Fallback a YouTube si Saavn devuelve 0
    console.log('[search] Saavn returned 0, trying YouTube...');
    const ytResults = await searchYouTube(query, Math.min(limit, 15));

    if (ytResults.length > 0) {
        console.log(`[search] YouTube fallback: ${ytResults.length} results`);
        return ytResults;
    }

    console.log('[search] No results from any source');
    return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    const query = req.query.q || req.query.query || '';
    const limit = parseInt(req.query.limit) || 10;

    const params = {
        targetTitle: req.query.track || req.query.title || '',
        targetArtist: req.query.artist || '',
        targetAlbum: req.query.album || '',
        targetDuration: parseInt(req.query.duration) || 0
    };

    if (!query) {
        return res.status(400).json({ success: false, error: 'Missing q parameter' });
    }

    // Cargar módulo de extracción
    const ext = await loadExtractor();

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 1, 2, 3: SANITIZACIÓN DE QUERY
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. Eliminar comillas internas (evita ""Fred again." "...")
    // 2. Eliminar puntos finales (Fred again. → Fred again)
    // 3. Normalizar espacios
    // ═══════════════════════════════════════════════════════════════════════════
    function sanitizeForQuery(str) {
        if (!str) return '';
        return str
            .replace(/"/g, '')           // Quitar comillas
            .replace(/\.+$/g, '')         // Quitar puntos finales (pero NO internos)
            .replace(/\s+/g, ' ')         // Colapsar espacios
            .trim();
    }

    const safeArtist = sanitizeForQuery(params.targetArtist);
    const safeTitle = sanitizeForQuery(params.targetTitle);

    // Construir query efectiva (safe para la API)
    const effectiveQuery = (safeArtist && safeTitle)
        ? `${safeArtist} ${safeTitle}`
        : query;

    console.log(`[search] query="${effectiveQuery}" | originalArtist="${params.targetArtist}" originalTitle="${params.targetTitle}"`);

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 4: NO sobrescribir params
    // La query usa safe values (para la API externa)
    // Pero la evaluación usa los ORIGINALES (para preservar identidad)
    // ═══════════════════════════════════════════════════════════════════════════
    // params.targetArtist y params.targetTitle quedan INTACTOS

    // Buscar con query efectiva
    const rawResults = await searchApi(effectiveQuery, limit * 3);

    // Evaluar
    const evaluated = [];
    const rejected = [];

    for (const item of rawResults) {
        let evaluation;

        if (ext) {
            // Usar módulo unificado
            evaluation = ext.evaluateCandidate(item, params);
        } else {
            // Fallback mínimo
            evaluation = {
                passed: true,
                rejected: false,
                rejectReason: null,
                scores: {
                    identityScore: 0.5,
                    versionScore: 1.0,
                    durationScore: 1.0,
                    albumScore: 0.5,
                    finalConfidence: 0.5
                },
                version: { type: 'unknown', detail: null, isForbidden: false },
                feats: []
            };
        }

        const artistName = ext ? ext.extractArtistInfo(item).full : fallbackExtractArtist(item);

        const result = {
            title: item.name || '',
            artist: artistName,
            album: item.album?.name || item.album || null,
            duration: item.duration || 0,
            year: item.year || item.releaseDate?.substring(0, 4) || null,
            videoId: item.id,
            thumbnail: item.image?.find(i => i.quality === '500x500')?.url || item.image?.[0]?.url || '',
            source: 'youtube',
            evaluation
        };

        if (evaluation.passed) {
            evaluated.push(result);
        } else {
            rejected.push({
                title: result.title,
                artist: result.artist,
                reason: evaluation.rejectReason,
                identityScore: evaluation.scores.identityScore
            });
        }
    }

    // Ordenar por confidence
    evaluated.sort((a, b) => b.evaluation.scores.finalConfidence - a.evaluation.scores.finalConfidence);

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK: Solo activar si NO hay targetTitle específico
    // Si el usuario busca un track específico y no lo encontramos → NO_MATCH
    // NO rescatar "algo cercano" que es otra canción del artista
    // ═══════════════════════════════════════════════════════════════════════════
    let results = evaluated.slice(0, limit);

    // Solo activar fallback si no hay targetTitle (navegación libre)
    const hasSpecificTitle = !!(params.targetTitle && params.targetTitle.trim());

    if (results.length === 0 && rejected.length > 0 && !hasSpecificTitle) {
        const salvageable = rejected
            .filter(r =>
                !r.reason?.startsWith('forbidden_version') &&
                !r.reason?.startsWith('same_artist_different_track') &&
                r.identityScore >= 0.5  // Umbral más alto
            )
            .slice(0, 2);  // Menos resultados de fallback

        for (const rej of salvageable) {
            const originalItem = rawResults.find(r => (r.name || '') === rej.title);
            if (originalItem) {
                const artistName = ext ? ext.extractArtistInfo(originalItem).full : fallbackExtractArtist(originalItem);

                results.push({
                    title: originalItem.name || '',
                    artist: artistName,
                    album: originalItem.album?.name || originalItem.album || null,
                    duration: originalItem.duration || 0,
                    year: originalItem.year || originalItem.releaseDate?.substring(0, 4) || null,
                    videoId: originalItem.id,
                    thumbnail: originalItem.image?.find(i => i.quality === '500x500')?.url || originalItem.image?.[0]?.url || '',
                    source: 'youtube',
                    evaluation: {
                        passed: false,
                        scores: {
                            identityScore: rej.identityScore,
                            versionScore: 0.5,
                            durationScore: 0.5,
                            albumScore: 0.5,
                            finalConfidence: Math.max(0.4, rej.identityScore * 0.8)
                        },
                        version: { type: 'unknown', detail: null, isForbidden: false },
                        feats: [],
                        details: { fallback: true, originalRejection: rej.reason }
                    }
                });
            }
        }
        if (results.length > 0) {
            console.log(`[search] FALLBACK: rescued ${results.length} from rejected (no specific title)`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK NIVEL 2: YouTube directo si todo fue rechazado
    // ═══════════════════════════════════════════════════════════════════════════
    if (results.length === 0 && rejected.length > 0 && hasSpecificTitle) {
        console.log('[search] All Saavn results rejected, trying YouTube directly...');

        // Buscar en YouTube directamente
        const ytResults = await searchYouTube(effectiveQuery, 10);

        if (ytResults.length > 0) {
            console.log(`[search] YouTube backup found ${ytResults.length} candidates`);

            // Evaluar candidatos de YouTube
            for (const item of ytResults.slice(0, 5)) {
                let evaluation;

                if (ext) {
                    evaluation = ext.evaluateCandidate(item, params);
                } else {
                    evaluation = {
                        passed: true,
                        rejected: false,
                        rejectReason: null,
                        scores: { identityScore: 0.5, versionScore: 1.0, durationScore: 1.0, albumScore: 0.5, finalConfidence: 0.5 },
                        version: { type: 'unknown', detail: null, isForbidden: false },
                        feats: []
                    };
                }

                if (evaluation.passed) {
                    const artistName = ext ? ext.extractArtistInfo(item).full : (item.artist || item.primaryArtists || '');

                    results.push({
                        title: item.name || item.title || '',
                        artist: artistName,
                        album: item.album?.name || item.album || null,
                        duration: item.duration || 0,
                        year: null,
                        videoId: item.id,
                        thumbnail: item.image?.[0]?.url || '',
                        source: 'youtube',
                        evaluation
                    });
                }
            }

            if (results.length > 0) {
                console.log(`[search] YouTube backup: ${results.length} passed evaluation`);
            }
        }
    }

    // Stats
    const exactMatches = results.filter(r => r.evaluation.scores.finalConfidence >= 0.85).length;
    const goodMatches = results.filter(r => r.evaluation.scores.finalConfidence >= 0.6).length;

    console.log(`[search] ${results.length} results | ${exactMatches} exact | ${goodMatches} good | ${rejected.length} rejected`);

    return res.status(200).json({
        success: true,
        query,
        params,
        stats: {
            totalCandidates: rawResults.length,
            passed: evaluated.length,
            rejected: rejected.length,
            exactMatches,
            goodMatches
        },
        results: results.map(r => ({
            title: r.title,
            artist: r.artist,
            album: r.album,
            duration: r.duration,
            year: r.year,
            videoId: r.videoId,
            thumbnail: r.thumbnail,
            source: r.source,
            scores: r.evaluation.scores,
            version: r.evaluation.version,
            feats: r.evaluation.feats
        })),
        rejectedSample: rejected.slice(0, 5)
    });
}

export default allowCors(handler);
