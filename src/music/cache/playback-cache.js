/**
 * Caché de resoluciones reproducibles para instant-play.
 *
 * - Memoria: hit inmediato dentro de una instancia caliente.
 * - Redis: comparte resoluciones entre instancias y funciones de Vercel.
 * - inFlight: una sola búsqueda para solicitudes idénticas concurrentes.
 */

const memoryCache = new Map();
const inFlightResolutions = new Map();
const MAX_MEMORY_ENTRIES = 500;
const REDIS_DEADLINE_MS = 120;

let redisModulePromise;

function hasUsableRedisUrl() {
    const value = String(process.env.REDIS_URL || '').trim().replace(/^["']|["']$/g, '');
    return /^rediss?:\/\//i.test(value);
}

function normalizePart(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u2018\u2019]/g, "'")
        .toLowerCase()
        .replace(/[^a-z0-9'&]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildPlaybackCacheKey(artist, track, qualityMode) {
    return `playback:v4:${normalizePart(artist)}:${normalizePart(track)}:${qualityMode || 'balanced'}`;
}

function withDeadline(promise, timeoutMs = REDIS_DEADLINE_MS) {
    let timer;
    return Promise.race([
        promise,
        new Promise(resolve => {
            timer = setTimeout(() => resolve(null), timeoutMs);
        })
    ]).finally(() => clearTimeout(timer));
}

async function getRedisModule() {
    if (!hasUsableRedisUrl()) return null;
    if (!redisModulePromise) {
        redisModulePromise = import('./redis-cache.js')
            .then(async module => await module.initRedis() ? module : null)
            .catch(() => null);
    }
    return withDeadline(redisModulePromise);
}

function getMemoryEntry(key) {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        memoryCache.delete(key);
        return null;
    }
    return entry.value;
}

function setMemoryEntry(key, value, ttlSeconds) {
    if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
        const oldestKey = memoryCache.keys().next().value;
        if (oldestKey) memoryCache.delete(oldestKey);
    }
    memoryCache.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000
    });
}

async function getCachedValue(key) {
    const memoryValue = getMemoryEntry(key);
    if (memoryValue) return { value: memoryValue, status: 'memory' };

    const redis = await getRedisModule();
    if (!redis) return null;
    const redisValue = await withDeadline(redis.redisGet(key));
    if (!redisValue) return null;

    // Redis ya controla el TTL. La copia local corta evita repetir round-trips.
    setMemoryEntry(key, redisValue, 60);
    return { value: redisValue, status: 'redis' };
}

async function storeCachedValue(key, value, ttlSeconds) {
    setMemoryEntry(key, value, ttlSeconds);
    const redis = await getRedisModule();
    if (redis) await withDeadline(redis.redisSet(key, value, ttlSeconds));
}

export async function getOrResolvePlayback(key, resolver) {
    const cached = await getCachedValue(key);
    if (cached) return cached;

    const existing = inFlightResolutions.get(key);
    if (existing) {
        const result = await existing;
        return { ...result, status: 'inflight' };
    }

    const pending = (async () => {
        const resolved = await resolver();
        if (resolved?.value && resolved?.ttlSeconds > 0) {
            await storeCachedValue(key, resolved.value, resolved.ttlSeconds);
        }
        return { value: resolved?.value || null, status: 'miss' };
    })();

    inFlightResolutions.set(key, pending);
    try {
        return await pending;
    } finally {
        inFlightResolutions.delete(key);
    }
}

export function clearPlaybackMemoryCache() {
    memoryCache.clear();
    inFlightResolutions.clear();
}

export function getPlaybackMemoryStats() {
    return { entries: memoryCache.size, inFlight: inFlightResolutions.size };
}
