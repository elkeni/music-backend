/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔴 REDIS CACHE - FASE 6: CACHE DISTRIBUIDO
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Cache distribuido usando Redis para search responses.
 * Coexiste con cache in-memory como fallback.
 * 
 * Variables de entorno:
 * - REDIS_URL (default: redis://localhost:6379)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from 'redis';

/**
 * Prefijo para las keys de búsqueda
 */
const KEY_PREFIX = 'search:';

/**
 * TTL por defecto (30 segundos)
 */
const DEFAULT_TTL_SECONDS = 30;

/**
 * Cliente de Redis
 * @type {import('redis').RedisClientType | null}
 */
let redisClient = null;

/**
 * Flag para saber si Redis está habilitado
 */
let redisEnabled = false;

/**
 * Estadísticas de Redis
 */
let stats = {
    hits: 0,
    misses: 0,
    errors: 0
};

/**
 * Inicializa la conexión a Redis
 * 
 * @returns {Promise<boolean>}
 */
export async function initRedis() {
    if (redisClient) {
        return true;
    }

    try {
        const url = process.env.REDIS_URL || 'redis://localhost:6379';

        redisClient = createClient({
            url,
            socket: {
                // Desactivar reconnect automático para evitar logs infinitos
                reconnectStrategy: false
            }
        });

        // Silenciar errores continuos - solo loguear el primero
        let errorLogged = false;
        redisClient.on('error', (err) => {
            if (!errorLogged) {
                console.warn('[redis] Error de conexión:', err.message);
                errorLogged = true;
            }
            stats.errors++;
        });

        await redisClient.connect();

        // Test de conexión
        await redisClient.ping();

        redisEnabled = true;
        console.log('[redis] Redis conectado exitosamente');
        return true;
    } catch (error) {
        console.warn('[redis] Redis no disponible, usando fallback in-memory:', error.message);
        if (redisClient) {
            try {
                await redisClient.quit();
            } catch (e) {
                // Ignorar error al cerrar
            }
        }
        redisClient = null;
        redisEnabled = false;
        return false;
    }
}

/**
 * Obtiene un valor del cache de Redis
 * 
 * @param {string} key
 * @returns {Promise<any | null>}
 */
export async function redisGet(key) {
    if (!redisEnabled || !redisClient) {
        return null;
    }

    try {
        const fullKey = KEY_PREFIX + key;
        const value = await redisClient.get(fullKey);

        if (value === null) {
            stats.misses++;
            return null;
        }

        stats.hits++;
        return JSON.parse(value);
    } catch (error) {
        console.warn('[redis] Error en GET:', error.message);
        stats.errors++;
        return null;
    }
}

/**
 * Guarda un valor en el cache de Redis
 * 
 * @param {string} key
 * @param {any} value
 * @param {number} [ttlSeconds=30]
 * @returns {Promise<boolean>}
 */
export async function redisSet(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
    if (!redisEnabled || !redisClient) {
        return false;
    }

    try {
        const fullKey = KEY_PREFIX + key;
        const serialized = JSON.stringify(value);

        await redisClient.setEx(fullKey, ttlSeconds, serialized);
        return true;
    } catch (error) {
        console.warn('[redis] Error en SET:', error.message);
        stats.errors++;
        return false;
    }
}

/**
 * Elimina un valor del cache de Redis
 * 
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function redisDel(key) {
    if (!redisEnabled || !redisClient) {
        return false;
    }

    try {
        const fullKey = KEY_PREFIX + key;
        await redisClient.del(fullKey);
        return true;
    } catch (error) {
        console.warn('[redis] Error en DEL:', error.message);
        stats.errors++;
        return false;
    }
}

/**
 * Limpia todas las keys de búsqueda
 * 
 * @returns {Promise<number>} - Número de keys eliminadas
 */
export async function redisClearSearchCache() {
    if (!redisEnabled || !redisClient) {
        return 0;
    }

    try {
        // Buscar todas las keys con el prefijo
        const keys = await redisClient.keys(KEY_PREFIX + '*');

        if (keys.length === 0) {
            return 0;
        }

        await redisClient.del(keys);
        console.log(`[redis] ${keys.length} keys de búsqueda eliminadas`);
        return keys.length;
    } catch (error) {
        console.warn('[redis] Error limpiando cache:', error.message);
        stats.errors++;
        return 0;
    }
}

/**
 * Obtiene estadísticas del cache de Redis
 * 
 * @returns {Object}
 */
export function redisStats() {
    return {
        enabled: redisEnabled,
        hits: stats.hits,
        misses: stats.misses,
        errors: stats.errors,
        hitRate: stats.hits + stats.misses > 0
            ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2) + '%'
            : '0%'
    };
}

/**
 * Resetea las estadísticas
 */
export function redisResetStats() {
    stats = { hits: 0, misses: 0, errors: 0 };
}

/**
 * Verifica si Redis está habilitado
 * 
 * @returns {boolean}
 */
export function isRedisEnabled() {
    return redisEnabled;
}

/**
 * Cierra la conexión a Redis
 */
export async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        redisEnabled = false;
        console.log('[redis] Redis desconectado');
    }
}
