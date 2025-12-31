/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚀 PREFETCH SERVICE - Pre-carga de streams para reproducción instantánea
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * REGLA CLAVE: Prefetch NO decide canciones, solo acelera decisiones ya tomadas.
 * 
 * FLUJO:
 * 1. Llamar a youtube-search (usa freeze/cache internamente)
 * 2. Si confidence >= 0.7 → preparar streams
 * 3. Guardar en prefetch cache
 * 
 * REGLAS:
 * - Solo prefetch si confidence >= 0.7
 * - No prefetch más de 1-2 tracks adelante
 * - Frontend decide si hacer prefetch (red, batería, etc.)
 * 
 * USO:
 * GET /api/prefetch?title=...&artist=...&duration=...
 * 
 * RESPUESTA:
 * { success: true/false } (no devuelve streams, solo prepara)
 */

export const config = {
    runtime: 'nodejs'
};

const SOURCE_API = process.env.SOURCE_API_URL || 'https://appmusic-phi.vercel.app';
const BACKEND_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

// Importar cache compartido desde youtube-streams
import { prefetchCache, PREFETCH_TTL, buildPrefetchKey } from './youtube-streams.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CORS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════

const MIN_CONFIDENCE_TO_PREFETCH = 0.7;

// Importar lógica de búsqueda directa
import { executeSearch } from './youtube-search.js';

/**
 * Llama al motor de búsqueda real (youtube-search)
 * Esto reutiliza freeze/cache y toda la lógica de evaluación
 */
async function callSearchEngine({ title, artist, duration }) {
    try {
        const query = `${artist} ${title}`.trim();

        const params = {
            targetTitle: title || '',
            targetArtist: artist || '',
            targetDuration: parseInt(duration) || 0,
            targetAlbum: ''
        };

        // Llamada interna directa (sin HTTP loopback)
        const data = await executeSearch(query, params, 1);

        if (!data.success || !data.results || data.results.length === 0) {
            return null;
        }

        const best = data.results[0];
        return {
            videoId: best.videoId,
            title: best.title,
            artist: best.author?.name || artist,
            duration: best.duration,
            confidence: best.scores?.finalConfidence || 0.5,
            source: data.source // 'frozen', 'cache', o 'api'
        };
    } catch (e) {
        console.log('[prefetch] callSearchEngine error:', e.message);
        return null;
    }
}

/**
 * Obtiene streams para un videoId
 */
async function getStreams(videoId, confidence) {
    try {
        const url = `${SOURCE_API}/api/songs/${videoId}`;

        const ctrl = new AbortController();
        // TURBO: Timeout de 4s para prefetch
        const tid = setTimeout(() => ctrl.abort(), 4000);

        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);

        if (!res.ok) return null;

        const data = await res.json();
        const songData = data.data?.[0] || data.data || data;

        if (!songData) return null;

        const downloadLinks = songData.downloadUrl || [];
        if (!Array.isArray(downloadLinks) || downloadLinks.length === 0) return null;

        // Filtrar streams >= 96 kbps
        const streams = downloadLinks
            .map(linkObj => ({
                url: linkObj.url,
                quality: linkObj.quality || 'unknown',
                format: 'mp4'
            }))
            .filter(s => s.url);

        // Determinar calidad mínima según confidence
        const minKbps = confidence >= 0.95 ? 320 :
            confidence >= 0.85 ? 192 :
                confidence >= 0.70 ? 128 : 96;

        // Parsear kbps y filtrar
        const parseKbps = (q) => {
            const match = String(q).match(/(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
        };

        const qualityStreams = streams
            .map(s => ({ ...s, kbps: parseKbps(s.quality) }))
            .filter(s => s.kbps >= 96)
            .sort((a, b) => b.kbps - a.kbps);

        // Retornar streams que cumplen calidad mínima, o el mejor disponible
        const filtered = qualityStreams.filter(s => s.kbps >= minKbps);
        const finalStreams = filtered.length > 0 ? filtered : qualityStreams.slice(0, 3);

        return {
            audioStreams: finalStreams.map(({ kbps, ...rest }) => rest),
            qualityInfo: {
                selectedQuality: finalStreams[0]?.kbps || 0,
                policy: 'prefetch',
                confidence,
                totalAvailable: streams.length,
                filteredCount: finalStreams.length
            }
        };
    } catch (e) {
        console.log('[prefetch] getStreams error:', e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    const { title, artist, duration } = req.query;

    console.log(`[🚀 prefetch] Request: "${artist} - ${title}" (${duration}s)`);

    // Validar parámetros mínimos
    if (!title && !artist) {
        return res.status(400).json({
            success: false,
            error: 'Missing title or artist parameter'
        });
    }

    try {
        // 1. 🔑 LLAMAR AL MOTOR REAL (reutiliza freeze/cache)
        const searchResult = await callSearchEngine({
            title: title || '',
            artist: artist || '',
            duration: parseInt(duration) || 0
        });

        if (!searchResult?.videoId) {
            console.log('[prefetch] No track found');
            return res.status(200).json({
                success: false,
                reason: 'track_not_found'
            });
        }

        console.log(`[prefetch] Search returned: ${searchResult.videoId} (${searchResult.source}) | Confidence: ${searchResult.confidence}`);

        // 2. Verificar confidence mínimo
        if (searchResult.confidence < MIN_CONFIDENCE_TO_PREFETCH) {
            console.log(`[prefetch] Confidence too low: ${searchResult.confidence}`);
            return res.status(200).json({
                success: false,
                reason: 'low_confidence',
                confidence: searchResult.confidence
            });
        }

        // 3. Verificar si ya está en prefetch cache
        const prefetchKey = buildPrefetchKey(searchResult.videoId, searchResult.confidence);
        const existing = prefetchCache.get(prefetchKey);
        if (existing && Date.now() - existing.timestamp < PREFETCH_TTL) {
            console.log(`[prefetch] Already cached: ${prefetchKey}`);
            return res.status(200).json({
                success: true,
                source: 'already_cached',
                videoId: searchResult.videoId
            });
        }

        // 4. Obtener streams
        const streams = await getStreams(searchResult.videoId, searchResult.confidence);

        if (!streams || streams.audioStreams.length === 0) {
            console.log('[prefetch] No streams available');
            return res.status(200).json({
                success: false,
                reason: 'no_streams'
            });
        }

        // 5. Guardar en prefetch cache
        prefetchCache.set(prefetchKey, {
            timestamp: Date.now(),
            result: streams
        });

        console.log(`[🚀 prefetch] SET for: ${prefetchKey} | Quality: ${streams.qualityInfo.selectedQuality}kbps`);

        // 6. Responder (NO devuelve streams, solo confirma éxito)
        return res.status(200).json({
            success: true,
            videoId: searchResult.videoId,
            title: searchResult.title,
            artist: searchResult.artist,
            confidence: searchResult.confidence,
            quality: streams.qualityInfo.selectedQuality,
            searchSource: searchResult.source // Indica si vino de frozen/cache/api
        });

    } catch (err) {
        console.error('[prefetch] Error:', err.message);
        return res.status(200).json({
            success: false,
            reason: 'error',
            error: err.message
        });
    }
}

/**
 * Lógica interna de prefetch para uso directo desde otros módulos (ej: youtube-search)
 * Fire-and-forget: No retorna respuesta HTTP, solo loguea.
 */
export async function internalPrefetch(trackData) {
    if (!trackData || !trackData.videoId) return;

    try {
        const { videoId, title, artist } = trackData;

        // Confidence default alto si viene del buscador como "mejor resultado"
        const confidence = trackData.confidence || 0.9;

        // Verificar caché primero
        const prefetchKey = buildPrefetchKey(videoId, confidence);
        if (prefetchCache.has(prefetchKey)) {
            // console.log(`[prefetch-internal] Already cached: ${videoId}`);
            return;
        }

        // Obtener streams
        //console.log(`[prefetch-internal] Warming up: "${title}"`);
        const streams = await getStreams(videoId, confidence);

        if (streams && streams.audioStreams.length > 0) {
            prefetchCache.set(prefetchKey, {
                timestamp: Date.now(),
                result: streams
            });
            console.log(`[prefetch-internal] ✅ Warmed up: ${videoId} | ${streams.qualityInfo.selectedQuality}kbps`);
        }
    } catch (e) {
        console.error(`[prefetch-internal] Failed for ${trackData?.videoId}:`, e.message);
    }
}

export default allowCors(handler);
