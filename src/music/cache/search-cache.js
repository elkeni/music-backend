/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🗄️ SEARCH CACHE - FASE 5: CACHE MULTINIVEL EN MEMORIA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Cache en memoria para resultados de búsqueda.
 * 
 * REGLAS:
 * - TTL: búsquedas generales → 30s
 * - Debug → NO cachear
 * - Cache key: normalize(query) + JSON.stringify(options)
 * - Invalidación manual
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { normalizeText } from '../normalization/normalize-text.js';

/**
 * @typedef {Object} CacheEntry
 * @property {string} key - Cache key
 * @property {any} value - Cached value
 * @property {number} createdAt - Timestamp de creación
 * @property {number} ttlMs - Time-to-live en ms
 */

/**
 * @typedef {Object} CacheStats
 * @property {number} hits - Cache hits
 * @property {number} misses - Cache misses
 * @property {number} size - Número de entradas
 */

/**
 * TTL por defecto para búsquedas (30 segundos)
 */
const DEFAULT_TTL_MS = 30 * 1000;

/**
 * Tamaño máximo del cache (evitar memory leaks)
 */
const MAX_CACHE_SIZE = 500;

/**
 * Cache en memoria
 * @type {Map<string, CacheEntry>}
 */
const cache = new Map();

/**
 * Estadísticas del cache
 */
let stats = {
    hits: 0,
    misses: 0
};

/**
 * Genera una cache key normalizada
 * 
 * @param {string} query - Query de búsqueda
 * @param {Object} options - Opciones de búsqueda
 * @returns {string}
 */
export function generateCacheKey(query, options = {}) {
    const normalizedQuery = normalizeText(query || '');

    // REPARACIÓN: Incluir TODAS las opciones relevantes explícitamente
    // Debug se incluye aunque no se cachee, para que la key sea explícita
    const relevantOptions = {
        limit: options.limit || 20,
        offset: options.offset || 0,
        grouped: options.grouped !== false,
        debug: options.debug === true
    };

    return `${normalizedQuery}:${JSON.stringify(relevantOptions)}`;
}

/**
 * Verifica si una entrada está expirada
 * 
 * @param {CacheEntry} entry
 * @returns {boolean}
 */
function isExpired(entry) {
    return Date.now() > entry.createdAt + entry.ttlMs;
}

/**
 * Obtiene un valor del cache
 * 
 * @param {string} key - Cache key
 * @returns {any | null}
 */
export function getFromCache(key) {
    const entry = cache.get(key);

    if (!entry) {
        stats.misses++;
        return null;
    }

    if (isExpired(entry)) {
        cache.delete(key);
        stats.misses++;
        return null;
    }

    stats.hits++;
    return entry.value;
}

/**
 * Guarda un valor en el cache
 * 
 * @param {string} key - Cache key
 * @param {any} value - Valor a cachear
 * @param {number} [ttlMs] - TTL en ms (default: 30s)
 */
export function setInCache(key, value, ttlMs = DEFAULT_TTL_MS) {
    // Evitar memory leaks: limpiar entradas antiguas si llegamos al límite
    if (cache.size >= MAX_CACHE_SIZE) {
        pruneExpiredEntries();

        // Si aún estamos llenos, eliminar las más antiguas
        if (cache.size >= MAX_CACHE_SIZE) {
            const keysToDelete = Array.from(cache.keys()).slice(0, 100);
            keysToDelete.forEach(k => cache.delete(k));
        }
    }

    /** @type {CacheEntry} */
    const entry = {
        key,
        value,
        createdAt: Date.now(),
        ttlMs
    };

    cache.set(key, entry);
}

/**
 * Elimina entradas expiradas del cache
 */
export function pruneExpiredEntries() {
    const now = Date.now();

    for (const [key, entry] of cache) {
        if (now > entry.createdAt + entry.ttlMs) {
            cache.delete(key);
        }
    }
}

/**
 * Limpia todo el cache
 */
export function clearSearchCache() {
    cache.clear();
    console.log('[search-cache] Cache limpiado');
}

/**
 * Obtiene estadísticas del cache
 * 
 * @returns {CacheStats}
 */
export function getCacheStats() {
    return {
        hits: stats.hits,
        misses: stats.misses,
        size: cache.size,
        hitRate: stats.hits + stats.misses > 0
            ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2) + '%'
            : '0%'
    };
}

/**
 * Resetea las estadísticas
 */
export function resetCacheStats() {
    stats = { hits: 0, misses: 0 };
}

/**
 * Verifica si el cache tiene una key
 * 
 * @param {string} key
 * @returns {boolean}
 */
export function hasInCache(key) {
    const entry = cache.get(key);
    if (!entry) return false;
    if (isExpired(entry)) {
        cache.delete(key);
        return false;
    }
    return true;
}
