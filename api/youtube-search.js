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

const SOURCE_API = process.env.SOURCE_API_URL || 'https://appmusic-phi.vercel.app';

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, save-data');
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
// API DE BÚSQUEDA - SISTEMA DUAL (SAAVN + YOUTUBE FALLBACK VIA DUCKDUCKGO)
// ═══════════════════════════════════════════════════════════════════════════════

// Buscar en Saavn (fuente primaria)
async function searchSaavn(query, limit = 30) {
    try {
        const url = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        const ctrl = new AbortController();
        // OPTIMIZACIÓN MOVIL: Timeout reducido de 10s a 3.5s
        const tid = setTimeout(() => ctrl.abort(), 3500);

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

// ═══════════════════════════════════════════════════════════════════════════════
// ESTRATEGIA DE BÚSQUEDA YOUTUBE: MULTI-LAYER FALLBACK
// 1. YouTube-SR (Librería robusta) - Primera opción por calidad
// 2. DuckDuckGo (Scraping) - Backup si falla youtube-sr o rate limits
// ═══════════════════════════════════════════════════════════════════════════════

// Carga dinámica de youtube-sr para evitar bloat en cold start
let youtubeSrLib = null;
async function loadYoutubeSr() {
    if (youtubeSrLib) return youtubeSrLib;
    try {
        const mod = await import('youtube-sr');
        youtubeSrLib = mod.default || mod;
        return youtubeSrLib;
    } catch (e) {
        console.error('[youtube-search] Failed to load youtube-sr:', e.message);
        return null;
    }
}

// ESTRATEGIA 1: Robusta (Librería)
async function searchViaLib(query, limit = 10) {
    try {
        const yt = await loadYoutubeSr();
        if (!yt) return [];

        console.log('[youtube-search] Strategy: youtube-sr lib...');
        // safeSearch: true por defecto
        const videos = await yt.search(query, { limit: limit + 5, type: 'video', safeSearch: true });

        if (!videos || videos.length === 0) return [];

        return videos.map(v => ({
            id: v.id,
            name: v.title, // youtube-sr usa title
            title: v.title,
            artist: v.channel ? v.channel.name : '',
            primaryArtists: v.channel ? v.channel.name : '',
            duration: v.duration / 1000, // viene en ms
            image: [{ url: v.thumbnail?.url || `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`, quality: '500x500' }],
            source: 'youtube',
            _proxy: 'youtube-sr'
        }));
    } catch (e) {
        console.warn('[youtube-search] Strategy youtube-sr failed:', e.message);
        return [];
    }
}

// ESTRATEGIA 2: Scraping (DuckDuckGo) - Backup
async function searchViaDDG(query, limit = 10) {
    try {
        console.log('[youtube-search] Strategy: DuckDuckGo scraping...');
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' site:youtube.com')}`;

        const ctrl = new AbortController();
        // OPTIMIZACIÓN MOVIL: Timeout reducido de 8s a 4.5s
        const tid = setTimeout(() => ctrl.abort(), 4500);

        const res = await fetch(ddgUrl, {
            signal: ctrl.signal,
            headers: {
                // User-Agent móvil genérico para obtener respuestas más ligeras
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36'
            }
        });
        clearTimeout(tid);

        if (!res.ok) {
            console.log('[ddg] Request failed:', res.status);
            return [];
        }

        const html = await res.text();

        // Regex mejoradas y más permisivas
        const ytPattern = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g;

        // Patrones de título: Intenta varios formatos conocidos de DDG
        const titlePatterns = [
            /<a[^>]*class="result__a"[^>]*>([^<]+)<\/a>/gi, // Clásico
            /<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([^<]+)<\/a>/gi, // Variaciones de clase
            /<h2[^>]*><a[^>]*href="[^"]*youtube.com\/watch[^"]*"[^>]*>([^<]+)<\/a><\/h2>/gi // Estructura jerárquica
        ];

        const videoIds = [];
        const seenIds = new Set();
        let match;

        // Extraer IDs
        while ((match = ytPattern.exec(html)) !== null && videoIds.length < limit) {
            if (!seenIds.has(match[1])) {
                videoIds.push(match[1]);
                seenIds.add(match[1]);
            }
        }

        if (videoIds.length === 0) {
            // Último intento: buscar hrefs crudos en el HTML si el regex limpio falla
            const rawHrefPattern = /href="[^"]*watch\?v=([a-zA-Z0-9_-]{11})"/g;
            while ((match = rawHrefPattern.exec(html)) !== null && videoIds.length < limit) {
                if (!seenIds.has(match[1])) {
                    videoIds.push(match[1]);
                    seenIds.add(match[1]);
                }
            }
        }

        // Extraer títulos
        const titles = [];
        let titleMatchFound = false;

        for (const pattern of titlePatterns) {
            // Reiniciar regex para intentar desde el principio
            pattern.lastIndex = 0;
            let tempTitles = [];
            while ((match = pattern.exec(html)) !== null) {
                const title = match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
                if (title) tempTitles.push(title);
            }
            if (tempTitles.length > 0) {
                titles.push(...tempTitles);
                titleMatchFound = true;
                break; // Usar el primer patrón que funcione
            }
        }

        if (videoIds.length === 0) {
            console.log('[ddg] No videos found via scraping.');
            return [];
        }

        if (!titleMatchFound) {
            console.warn('[ddg] ⚠️ IDs found but patterns for Title failed. DDG HTML structure changed.');
        }

        // Construir objetos
        return videoIds.slice(0, limit).map((id, i) => ({
            id: id,
            name: titles[i] || query, // Fallback al query si no hay título
            title: titles[i] || query,
            artist: '',
            primaryArtists: '',
            duration: 0,
            image: [{ url: `https://img.youtube.com/vi/${id}/mqdefault.jpg`, quality: '500x500' }],
            source: 'youtube',
            _proxy: 'duckduckgo'
        }));

    } catch (e) {
        console.log('[ddg] Scraping error:', e.message);
        return [];
    }
}

// ORCHESTRATOR: Intenta biblioteca -> luego scraping
async function searchYouTube(query, limit = 10) {
    // 1. Intentar librería (más confiable para metadata)
    const libResults = await searchViaLib(query, limit);
    if (libResults.length > 0) {
        return libResults;
    }

    // 2. Fallback a scraping (si librería falla o rate limits)
    console.log('[youtube-search] Lib failed/empty, falling back to DDG scraping...');
    return await searchViaDDG(query, limit);
}

// Búsqueda combinada: PARALELA (Carrera de velocidad)
async function searchApi(query, limit = 30) {
    console.log(`[search] 🚀 Starting PARALLEL search for: "${query}"`);

    // Wrappers que retornan null en lugar de array vacío para que Promise.any los descarte
    const trySaavn = async () => {
        try {
            const res = await searchSaavn(query, limit);
            if (res && res.length > 0) {
                return { source: 'saavn', data: res };
            }
        } catch (e) {
            // Ignorar error, dejar que la carrera continúe
        }
        throw new Error('Saavn empty'); // Forzar reject para Promise.any
    };

    const tryYoutube = async () => {
        try {
            // YouTube suele ser muy rápido, le damos chance en la carrera
            const res = await searchYouTube(query, Math.min(limit, 15));
            if (res && res.length > 0) {
                return { source: 'youtube', data: res };
            }
        } catch (e) {
            // Ignorar error
        }
        throw new Error('YouTube empty'); // Forzar reject
    };

    try {
        // Promise.any resuelve con la PRIMERA promesa que tenga éxito (rejects son ignorados hasta que todos fallen)
        const winner = await Promise.any([trySaavn(), tryYoutube()]);

        console.log(`[search] 🏁 WINNER: ${winner.source} (returned ${winner.data.length} results)`);
        return winner.data;

    } catch (aggregateError) {
        // Si llegamos aquí, AMBOS fallaron o devolvieron 0 resultados
        console.log('[search] ❌ No results from any source (both empty/failed)');
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// CORE SEARCH LOGIC (Exported for internal use)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Executes the search pipeline without HTTP context
 * @param {string} query - Main search query
 * @param {Object} params - Search parameters
 * @param {number} limit - Max results
 * @returns {Promise<Object>} Search result object
 */
export async function executeSearch(query, params, limit = 10) {
    if (!query) {
        throw new Error('Missing q parameter');
    }

    // Cargar módulo de extracción
    const ext = await loadExtractor();

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 1, 2, 3: SANITIZACIÓN DE QUERY
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

    // FALLBACK NIVEL 2: YouTube directo si todo fue rechazado
    if (results.length === 0 && rejected.length > 0) {
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

    return {
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
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    // OPTIMIZACIÓN: Cache-Control para CDN y Navegador
    // - s-maxage=3600 (1 hora en CDN de Vercel)
    // - stale-while-revalidate=1800 (servir stale mientras revalida en background)
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=1800');

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

    try {
        const result = await executeSearch(query, params, limit);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

export default allowCors(handler);
