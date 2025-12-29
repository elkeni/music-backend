// api/youtube-streams.js
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 AUDIO STREAMS SERVICE - Quality-Based Selection
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Política de calidad basada en finalConfidence:
 * 
 * | confidence | calidad mínima |
 * |------------|----------------|
 * | ≥ 0.95     | 320 kbps       |
 * | ≥ 0.85     | 192 kbps       |
 * | ≥ 0.70     | 128 kbps       |
 * | < 0.70     | 96 kbps        |
 * 
 * REGLA: Nunca devolver streams < 96 kbps
 */

const SOURCE_API = process.env.SOURCE_API_URL || 'https://appmusic-phi.vercel.app';

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE EN MEMORIA
// ═══════════════════════════════════════════════════════════════════════════════

// Cache estándar de streams (10 minutos)
const streamCache = new Map();
const STREAM_CACHE_TTL = 1000 * 60 * 10; // 10 minutos

// 🚀 PREFETCH CACHE: Para streams pre-cargados (5 minutos)
const prefetchCache = new Map();
const PREFETCH_TTL = 1000 * 60 * 5; // 5 minutos

/**
 * Construye clave de prefetch
 * @param {string} videoId 
 * @param {number} confidence 
 */
function buildPrefetchKey(videoId, confidence) {
    return `${videoId}|${Math.round((confidence || 0.7) * 100)}`;
}

// Exportar para uso en api/prefetch.js
export { prefetchCache, PREFETCH_TTL, buildPrefetchKey };

// ═══════════════════════════════════════════════════════════════════════════════
// CORS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, save-data');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    return await fn(req, res);
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE CALIDAD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extrae kbps desde un string de calidad
 * Ejemplos: "320kbps" → 320, "128 kbps" → 128, "96" → 96, "unknown" → 0
 * @param {string} quality - String de calidad
 * @returns {number} kbps como número
 */
function parseKbps(quality) {
    if (!quality) return 0;

    const qualityStr = String(quality).toLowerCase().trim();

    // Intentar extraer número seguido de "kbps" o "k"
    const kbpsMatch = qualityStr.match(/(\d+)\s*(?:kbps|k(?:b)?)?/i);
    if (kbpsMatch) {
        return parseInt(kbpsMatch[1], 10);
    }

    // Mapeo de calidades conocidas de Saavn/JioSaavn
    const qualityMap = {
        '12kbps': 12,
        '48kbps': 48,
        '96kbps': 96,
        '160kbps': 160,
        '320kbps': 320,
        'low': 48,
        'medium': 96,
        'high': 160,
        'veryhigh': 320,
        'lossless': 320,
    };

    return qualityMap[qualityStr] || 0;
}

/**
 * Determina la calidad mínima requerida según confidence
 * @param {number} confidence - finalConfidence del match (0-1)
 * @returns {number} kbps mínimo requerido
 */
function getMinQualityForConfidence(confidence) {
    if (confidence >= 0.95) return 320;
    if (confidence >= 0.85) return 192;
    if (confidence >= 0.70) return 128;
    return 96; // Mínimo absoluto
}

/**
 * Filtra y ordena streams según política de calidad
 * @param {Array} streams - Array de streams disponibles
 * @param {number} confidence - finalConfidence del match
 * @returns {{ filtered: Array, selectedQuality: number, policy: string }}
 */
function selectStreamsByQuality(streams, confidence) {
    const MIN_ABSOLUTE = 96; // NUNCA menos de 96 kbps
    const targetMinQuality = getMinQualityForConfidence(confidence);

    // 1. Parsear kbps de todos los streams
    const parsed = streams.map(stream => ({
        ...stream,
        kbps: parseKbps(stream.quality)
    }));

    // 2. Filtrar streams >= 96 kbps (mínimo absoluto)
    const validStreams = parsed.filter(s => s.kbps >= MIN_ABSOLUTE);

    if (validStreams.length === 0) {
        // Fallback: si no hay streams >= 96, usar el de mayor calidad disponible
        const sorted = parsed.sort((a, b) => b.kbps - a.kbps);
        if (sorted.length > 0 && sorted[0].kbps > 0) {
            return {
                filtered: [sorted[0]],
                selectedQuality: sorted[0].kbps,
                policy: 'fallback_best_available'
            };
        }
        return { filtered: [], selectedQuality: 0, policy: 'no_valid_streams' };
    }

    // 3. Intentar cumplir calidad mínima según confidence
    const qualifyingStreams = validStreams.filter(s => s.kbps >= targetMinQuality);

    if (qualifyingStreams.length > 0) {
        // Ordenar de mayor a menor calidad
        qualifyingStreams.sort((a, b) => b.kbps - a.kbps);
        return {
            filtered: qualifyingStreams,
            selectedQuality: qualifyingStreams[0].kbps,
            policy: `confidence_${confidence >= 0.95 ? 'premium' : confidence >= 0.85 ? 'high' : 'standard'}`
        };
    }

    // 4. Si no hay streams que cumplan el target, usar el mejor disponible >= 96
    validStreams.sort((a, b) => b.kbps - a.kbps);
    return {
        filtered: validStreams,
        selectedQuality: validStreams[0].kbps,
        policy: 'best_available_above_minimum'
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    const { videoId } = req.query || {};

    // ⭐ Aceptar confidence como query param (fix: 0 es un valor válido)
    const confidenceRaw = parseFloat(req.query.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : 0.7;

    console.log(`[youtube-streams] VideoId: "${videoId}" | Confidence: ${confidence}`);

    if (!videoId) {
        return res.status(400).json({
            success: false,
            error: 'Missing videoId parameter'
        });
    }

    // 🚀 MOBILE OPTIMIZATION: Soporte headers Save-Data
    const saveData = req.headers['save-data'] === 'on';

    try {
        // 🚀 PREFETCH: Verificar primero si tenemos streams pre-cargados
        const prefetchKey = buildPrefetchKey(videoId, confidence);
        const prefetched = prefetchCache.get(prefetchKey);

        // NOTA: Prefetch ignora Save-Data por ahora (el prefetch se hace background)
        // Si queremos ser estrictos, deberíamos pre-fetchear también versión mobile.
        if (prefetched && Date.now() - prefetched.timestamp < PREFETCH_TTL && !saveData) {
            console.log(`[🚀 prefetch] HIT for: ${prefetchKey}`);
            return res.status(200).json({
                success: true,
                source: 'prefetch',
                ...prefetched.result
            });
        }

        // ⭐ CACHE: Verificar si ya tenemos streams para este video
        const minQuality = getMinQualityForConfidence(confidence);
        // FIX: Incluir saveData en la key para no mezclar calidades
        const cacheKey = `${videoId}|${minQuality}|${saveData ? 'saver' : 'std'}`;

        const cached = streamCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < STREAM_CACHE_TTL) {
            console.log(`[stream-cache] HIT for: ${cacheKey}`);
            return res.status(200).json({
                success: true,
                source: 'cache',
                ...cached.result
            });
        }

        // Llamar a la API fuente
        // Llamar a la API fuente
        const url = `${SOURCE_API}/api/songs/${videoId}`;
        console.log(`[youtube-streams] Calling: ${url}`);

        let rawStreams = [];
        let externalSourceFailed = false;

        // 1. INTENTO PRIMARIO: API EXTERNA (Saavn/Unified)
        try {
            const controller = new AbortController();
            // Reducimos timeout a 5s para saltar al fallback local más rápido si la red está lenta
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const songData = data.data?.[0] || data.data || data;

                if (songData && Array.isArray(songData.downloadUrl)) {
                    rawStreams = songData.downloadUrl.map(linkObj => ({
                        url: linkObj.url,
                        quality: linkObj.quality || 'unknown',
                        format: 'mp4'
                    })).filter(s => s.url);
                }
            } else {
                console.warn(`[youtube-streams] ⚠️ External API error: ${response.status}`);
                externalSourceFailed = true;
            }
        } catch (err) {
            console.warn(`[youtube-streams] ⚠️ External API unavailable: ${err.message}`);
            externalSourceFailed = true;
        }

        // 2. FALLBACK SECUNDARIO: LOCAL PLAY-DL (Rescue Mode)
        // Si la API externa falló o devolvió 0 streams, usamos play-dl localmente
        if (rawStreams.length === 0) {
            console.log(`[youtube-streams] 🚑 Activating LOCAL RESCUE (play-dl) for videoId: ${videoId}`);

            try {
                // Import dinámico para no cargar la librería si no es necesaria
                const play = await import('play-dl');
                const pdl = play.default || play;

                const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

                // Pedimos stream de calidad
                const streamInfo = await pdl.stream(ytUrl, {
                    quality: 2, // 2 = High quality default intent
                    discordPlayerCompatibility: false
                });

                if (streamInfo && streamInfo.url) {
                    rawStreams.push({
                        url: streamInfo.url,
                        quality: '128kbps', // play-dl suele dar webm/opus de buena calidad (~128-160k)
                        format: 'webm',
                        source: 'play-dl-local'
                    });
                    console.log('[youtube-streams] ✅ Local rescue successful!');
                }
            } catch (localErr) {
                console.error('[youtube-streams] ❌ Local rescue failed:', localErr.message);
            }
        }

        if (rawStreams.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No audio streams available (both external and local failed)'
            });
        }



        // ⭐ NUEVO: Seleccionar streams según política de calidad
        // Si saveData es true, forzamos política 'mobile_saver' (max 128kbps, preferible 96kbps)
        let selection;

        if (saveData) {
            console.log('[youtube-streams] 📱 Mobile Save-Data detected. Prioritizing lower bitrate.');
            // Lógica custom para ahorrar datos: buscar streams entre 96 y 128 (preferir 96 si existe)
            const parsed = rawStreams.map(s => ({ ...s, kbps: parseKbps(s.quality) }));
            const saverStreams = parsed
                .filter(s => s.kbps >= 96 && s.kbps <= 128)
                .sort((a, b) => a.kbps - b.kbps); // Ordenar ascendente (el menor posible >=96)

            if (saverStreams.length > 0) {
                selection = {
                    filtered: saverStreams,
                    selectedQuality: saverStreams[0].kbps,
                    policy: 'mobile_save_data'
                };
            } else {
                // Fallback a lógica normal si no hay streams de ahorro perfectos
                selection = selectStreamsByQuality(rawStreams, 0.7); // Tratar como low confidence para no gastar mucho
                selection.policy = 'mobile_fallback';
            }
        } else {
            selection = selectStreamsByQuality(rawStreams, confidence);
        }

        const { filtered, selectedQuality, policy } = selection;

        if (filtered.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No audio streams meet quality requirements'
            });
        }

        // Limpiar campo kbps interno antes de devolver (solo para uso interno)
        const audioStreams = filtered.map(({ kbps, ...rest }) => rest);

        console.log(`[youtube-streams] Selected ${audioStreams.length} streams | Quality: ${selectedQuality}kbps | Policy: ${policy}`);

        // ⭐ CACHE: Guardar resultado (reusar cacheKey ya definido arriba)
        const responseData = {
            audioStreams,
            qualityInfo: {
                selectedQuality,
                policy,
                confidence,
                saveDataMode: saveData,
                totalAvailable: rawStreams.length,
                filteredCount: audioStreams.length
            }
        };

        streamCache.set(cacheKey, {
            timestamp: Date.now(),
            result: responseData
        });
        console.log(`[stream-cache] SET for: ${cacheKey}`);

        // CACHE HEADER CRUCIAL PARA MÓVIL
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=1800');

        return res.status(200).json({
            success: true,
            source: 'api',
            ...responseData
        });

    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ success: false, error: 'Timeout' });
        }
        console.error('[youtube-streams] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}

export default allowCors(handler);