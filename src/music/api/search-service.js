/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔍 SEARCH SERVICE - FASE 5/6: SERVICIO DE BÚSQUEDA PÚBLICA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * API de búsqueda que orquesta todo el pipeline sin modificar lógica de ranking.
 * 
 * PIPELINE ESCALABLE (FASE 6):
 * 1. buildSearchContext(query)
 * 2. CHECK CACHE (Redis → in-memory fallback)
 * 3. getCandidateSongIds(context) via Meilisearch (o fallback a getAllSongs)
 * 4. getSongsByIds() desde DB o song-store
 * 5. rankResults() - SIN CAMBIOS
 * 6. agrupar por identityKey (si grouped)
 * 7. aplicar limit / offset
 * 8. CACHE resultado (Redis → in-memory)
 * 
 * CONTRATO DE DATOS (CRÍTICO):
 * 
 * grouped=true:
 *   - totalGroups: número total de grupos canónicos encontrados
 *   - totalSongs: número total de canciones individuales
 *   - results.length: número de grupos en esta página (≤ limit)
 *   - limit y offset aplican a GRUPOS, no a canciones
 * 
 * grouped=false:
 *   - totalResults: número total de canciones
 *   - results.length: número de canciones en esta página (≤ limit)
 *   - limit y offset aplican a canciones individuales
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { getAllSongs } from '../song-store.js';
import { getIdentity } from '../identity/identity-store.js';
import { getAuthority, isCanonical, isNonOfficial, getCanonicalSelection } from '../authority/authority-store.js';
import { buildSearchContext } from '../ranking/search-context.js';
import { rankResults } from '../ranking/rank-results.js';

// Cache in-memory (FASE 5)
import {
    generateCacheKey,
    getFromCache,
    setInCache,
    getCacheStats
} from '../cache/search-cache.js';

// ═══════════════════════════════════════════════════════════════════════════════
// LAZY INIT SINGLETONS (Runtime selection)
// ═══════════════════════════════════════════════════════════════════════════════

let _redisCacheModule = null;
let _candidateRetrieverModule = null;
let _songRepositoryModule = null;
let _modulesLoaded = false;

/*
 * Carga lazy de módulos pesados/externos (Redis, Meili, DB)
 * Se ejecuta solo cuando se necesita, asegurando que process.env esté listo
 */
async function loadModules() {
    if (_modulesLoaded) return;

    try {
        const [redisModule, candidateModule, videoRepoModule, dbModule] = await Promise.all([
            import('../cache/redis-cache.js').catch(() => null),
            import('../search-index/candidate-retriever.js'),
            import('../persistence/song-repository.js').catch(() => null),
            import('../persistence/db.js').catch(() => null)
        ]);

        _redisCacheModule = redisModule;
        _candidateRetrieverModule = candidateModule;
        _songRepositoryModule = videoRepoModule;

        // Init DB if available
        if (dbModule) {
            await dbModule.initDB();
        }

        _modulesLoaded = true;
    } catch (e) {
        console.error('[search-service] Error loading runtime modules:', e);
    }
}

/**
 * @typedef {Object} SearchOptions
 * @property {number} [limit=20] - Máximo de resultados (grupos si grouped, canciones si no)
 * @property {number} [offset=0] - Offset para paginación (aplica a grupos o canciones según grouped)
 * @property {boolean} [grouped=true] - Agrupar por identityKey
 * @property {boolean} [debug=false] - Incluir información de debug
 */

/**
 * @typedef {Object} SearchResult
 * @property {import('../song-model.js').Song} song
 * @property {number} score
 * @property {number} [rank]
 * @property {Object} [breakdown] - Solo en modo debug
 */

/**
 * @typedef {Object} GroupedResult
 * @property {string} identityKey
 * @property {{ song: Song, score: number, breakdown?: Object }} canonical
 * @property {Array<{ song: Song, score: number, breakdown?: Object }>} alternatives
 */

/**
 * @typedef {Object} SearchResponseGrouped
 * @property {string} query - Query original
 * @property {number} totalGroups - Número TOTAL de grupos canónicos (antes de paginación)
 * @property {number} totalSongs - Número TOTAL de canciones individuales
 * @property {GroupedResult[]} results - Grupos paginados
 * @property {Object} meta
 */

/**
 * @typedef {Object} SearchResponseFlat
 * @property {string} query - Query original
 * @property {number} totalResults - Número TOTAL de canciones (antes de paginación)
 * @property {SearchResult[]} results - Canciones paginadas
 * @property {Object} meta
 */

/**
 * Constantes de validación
 */
const MIN_QUERY_LENGTH = 2;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const PERFORMANCE_WARNING_MS = 200;
const CANDIDATE_LIMIT = 200;

/**
 * Valida una query de búsqueda
 * 
 * @param {string} query
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateQuery(query) {
    if (!query || typeof query !== 'string') {
        return { valid: false, error: 'Query is required' };
    }

    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
        return { valid: false, error: `Query must be at least ${MIN_QUERY_LENGTH} characters` };
    }

    return { valid: true };
}

/**
 * Normaliza las opciones de búsqueda
 * 
 * @param {SearchOptions} options
 * @returns {SearchOptions}
 */
function normalizeOptions(options = {}) {
    return {
        limit: Math.min(Math.max(1, options.limit || DEFAULT_LIMIT), MAX_LIMIT),
        offset: Math.max(0, options.offset || 0),
        grouped: options.grouped !== false,
        debug: options.debug === true
    };
}

/**
 * Obtiene resultado del cache (Redis → in-memory fallback)
 * 
 * @param {string} cacheKey
 * @returns {Promise<any | null>}
 */
async function getCached(cacheKey) {
    // Intentar Redis primero
    if (_redisCacheModule && _redisCacheModule.isRedisEnabled()) {
        const redisResult = await _redisCacheModule.redisGet(cacheKey);
        if (redisResult) {
            return redisResult;
        }
    }

    // Fallback a in-memory
    return getFromCache(cacheKey);
}

/**
 * Guarda resultado en cache (Redis + in-memory)
 * 
 * @param {string} cacheKey
 * @param {any} value
 */
async function setCached(cacheKey, value) {
    // Guardar en Redis si disponible
    if (_redisCacheModule && _redisCacheModule.isRedisEnabled()) {
        await _redisCacheModule.redisSet(cacheKey, value, 30);
    }

    // Siempre guardar en in-memory como backup
    setInCache(cacheKey, value);
}

/**
 * Obtiene canciones candidatas (Meilisearch → fallback getAllSongs)
 * Lógica movida a runtime para asegurar que lee process.env actualizado
 * 
 * @param {import('../ranking/search-context.js').SearchContext} searchContext
 * @param {boolean} [debug=false]
 * @returns {Promise<import('../song-model.js').Song[]>}
 */
async function getCandidateSongs(searchContext, debug = false) {
    // 1. Selector de estrategia en runtime
    // Solo si el módulo cargó Y está disponible (el retriever hace su check interno de process.env)
    const useMeili = _candidateRetrieverModule && _candidateRetrieverModule.isCandidateRetrieverAvailable();

    // Intentar usar Meilisearch para candidatos
    if (useMeili) {
        try {
            const candidateIds = await _candidateRetrieverModule.getCandidateSongIds(searchContext, CANDIDATE_LIMIT, debug);

            if (candidateIds && candidateIds.length > 0) {
                // Obtener canciones por IDs desde DB o fallback
                if (_songRepositoryModule) {
                    const songs = await _songRepositoryModule.getSongsByIds(candidateIds);
                    if (songs && songs.length > 0) {
                        return songs;
                    }
                }
            } else {
                // Si devolvió 0 candidatos, chequear rápido si el índice está vacío (solo si no se chequeó en retriever)
                // Pero el retriever ya lo hace en debug.
                // Podríamos forzar un fallback a DB si Meili está vacío en PROD para evitar downtime total?
                // NO, la regla 3 dice "Mantener arquitectura... NO cambiar ranking/scoring".
                // Pero el objetivo es "Asegurar que se pueda poblar...".
                // Mejor dejar el log explícito que añadimos en candidate-retriever.
            }
        } catch (error) {
            console.warn('[search-service] Error en candidate retrieval, usando fallback:', error.message);
        }
    }

    // REPARACIÓN FASE 6: Log fuerte si falló Meili
    if (process.env.MEILI_URL && useMeili) {
        // Si usamos Meili pero devolvió 0, y tenemos debug, el retriever ya logueó el estado del índice.
        // Aquí solo validamos si necesitamos loguear degradación real (fallo de conexión) o lógica (0 results)
        // Lo dejamos al retriever.
    } else if (process.env.MEILI_URL && !useMeili) {
        console.error(
            `[DEGRADED MODE] ${new Date().toISOString()} | ` +
            `Query: "${searchContext.originalQuery}" | ` +
            `Usando getAllSongs() - O(N) scan. ` +
            `Meilisearch estaba configurado pero no disponible.`
        );
    }

    // Fallback: obtener todas las canciones del store en memoria
    return getAllSongs();
}

/**
 * Agrupa resultados rankeados por identityKey
 * 
 * @param {import('../ranking/rank-results.js').RankedResult[]} rankedResults
 * @param {boolean} includeDebug
 * @returns {GroupedResult[]}
 */
function groupResultsByIdentity(rankedResults, includeDebug = false) {
    const groups = new Map();

    for (const result of rankedResults) {
        const identity = getIdentity(result.song.id);
        const identityKey = identity?.identityKey || result.song.id;

        // Construir item de resultado
        const item = {
            song: result.song,
            score: Math.round(result.finalScore * 100) / 100
        };

        if (includeDebug) {
            item.breakdown = result.breakdown;
            item.isCanonical = result.isCanonical;
            item.isNonOfficial = result.isNonOfficial;
        }

        if (!groups.has(identityKey)) {
            groups.set(identityKey, {
                identityKey,
                canonical: null,
                alternatives: [],
                maxScore: result.finalScore
            });
        }

        const group = groups.get(identityKey);

        // El primero de cada grupo (por ranking) es el canonical display
        if (result.isCanonical || !group.canonical) {
            if (!group.canonical) {
                group.canonical = item;
            } else if (result.isCanonical) {
                // Mover el actual canonical a alternatives si encontramos el verdadero
                group.alternatives.unshift(group.canonical);
                group.canonical = item;
            } else {
                group.alternatives.push(item);
            }
        } else {
            group.alternatives.push(item);
        }
    }

    // Convertir a array y limpiar estructura temporal
    return Array.from(groups.values())
        .map(g => ({
            identityKey: g.identityKey,
            canonical: g.canonical,
            alternatives: g.alternatives
        }))
        .sort((a, b) => b.canonical.score - a.canonical.score);
}

/**
 * Convierte resultados rankeados a formato plano
 * 
 * @param {import('../ranking/rank-results.js').RankedResult[]} rankedResults
 * @param {boolean} includeDebug
 * @returns {SearchResult[]}
 */
function flattenResults(rankedResults, includeDebug = false) {
    return rankedResults.map(result => {
        const item = {
            song: result.song,
            score: Math.round(result.finalScore * 100) / 100,
            rank: result.rank
        };

        if (includeDebug) {
            item.breakdown = result.breakdown;
            item.isCanonical = result.isCanonical;
            item.isNonOfficial = result.isNonOfficial;
        }

        return item;
    });
}

/**
 * Ejecuta búsqueda de canciones
 * 
 * SEMÁNTICA DE PAGINACIÓN:
 * - grouped=true: limit y offset aplican a GRUPOS, no a canciones
 * - grouped=false: limit y offset aplican a canciones individuales
 * 
 * @param {string} query - Query del usuario
 * @param {SearchOptions} [options] - Opciones de búsqueda
 * @returns {Promise<SearchResponseGrouped | SearchResponseFlat>}
 */
export async function searchSongs(query, options = {}) {
    const startTime = Date.now();

    // 0. Carga de módulos en runtime (CRÍTICO para serverless)
    await loadModules();

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDACIÓN
    // ═══════════════════════════════════════════════════════════════════════════

    const validation = validateQuery(query);
    if (!validation.valid) {
        return {
            query: query || '',
            totalResults: 0,
            results: [],
            error: validation.error,
            meta: {
                cached: false,
                executionTimeMs: Date.now() - startTime
            }
        };
    }

    const normalizedOptions = normalizeOptions(options);

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK CACHE (solo si no es debug)
    // FASE 6: Redis → in-memory fallback
    // ═══════════════════════════════════════════════════════════════════════════

    if (!normalizedOptions.debug) {
        const cacheKey = generateCacheKey(query, normalizedOptions);
        const cachedResult = await getCached(cacheKey);

        if (cachedResult) {
            // Actualizar meta para indicar cache hit
            return {
                ...cachedResult,
                meta: {
                    ...cachedResult.meta,
                    cached: true,
                    cacheSource: _redisCacheModule?.isRedisEnabled() ? 'redis' : 'memory',
                    executionTimeMs: Date.now() - startTime
                }
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PIPELINE DE BÚSQUEDA
    // ═══════════════════════════════════════════════════════════════════════════

    // 1. Build search context
    const searchContext = buildSearchContext(query);

    // 2. Get candidate songs (FASE 6: Meilisearch → fallback getAllSongs)
    const candidateSongs = await getCandidateSongs(searchContext, normalizedOptions.debug);

    // 3. Rank results (SIN CAMBIOS - usa mismo ranking de FASE 4)
    const rankedResults = rankResults(candidateSongs, searchContext);

    // Determines source for metadata
    const sourceName = (_candidateRetrieverModule && _candidateRetrieverModule.isCandidateRetrieverAvailable())
        ? 'meilisearch'
        : 'memory';

    // 4. Build response based on grouped option
    let response;

    if (normalizedOptions.grouped) {
        // Agrupar por identityKey
        const groupedResults = groupResultsByIdentity(rankedResults, normalizedOptions.debug);

        // SEMÁNTICA: limit y offset aplican a GRUPOS
        const paginatedGroups = groupedResults.slice(
            normalizedOptions.offset,
            normalizedOptions.offset + normalizedOptions.limit
        );

        response = {
            query,
            totalGroups: groupedResults.length,
            totalSongs: rankedResults.length,
            results: paginatedGroups,
            meta: {
                cached: false,
                executionTimeMs: 0,
                candidateSource: sourceName,
                pagination: {
                    limit: normalizedOptions.limit,
                    offset: normalizedOptions.offset,
                    appliesTo: 'groups'
                }
            }
        };
    } else {
        // Resultados planos
        const flatResults = flattenResults(rankedResults, normalizedOptions.debug);

        // SEMÁNTICA: limit y offset aplican a canciones individuales
        const paginatedResults = flatResults.slice(
            normalizedOptions.offset,
            normalizedOptions.offset + normalizedOptions.limit
        );

        response = {
            query,
            totalResults: rankedResults.length,
            results: paginatedResults,
            meta: {
                cached: false,
                executionTimeMs: 0,
                candidateSource: sourceName,
                pagination: {
                    limit: normalizedOptions.limit,
                    offset: normalizedOptions.offset,
                    appliesTo: 'songs'
                }
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FINALIZAR Y CACHEAR
    // ═══════════════════════════════════════════════════════════════════════════

    const executionTime = Date.now() - startTime;

    // Log warning si es lento
    if (executionTime > PERFORMANCE_WARNING_MS) {
        console.warn(`[search-service] SLOW QUERY: "${query}" took ${executionTime}ms`);
    }

    response.meta.executionTimeMs = executionTime;

    // Agregar info de debug si está habilitado
    if (normalizedOptions.debug) {
        response.debug = {
            intent: searchContext.intent,
            tokens: searchContext.tokens,
            candidateCount: candidateSongs.length,
            cacheStats: getCacheStats(),
            redisStats: _redisCacheModule?.redisStats() || { enabled: false, hits: 0, misses: 0, errors: 0, hitRate: '0%' }
        };
    }

    // Cachear resultado (solo si no es debug)
    // FASE 6: Redis + in-memory
    if (!normalizedOptions.debug) {
        const cacheKey = generateCacheKey(query, normalizedOptions);
        await setCached(cacheKey, response);
    }

    return response;
}
