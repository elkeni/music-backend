import { getAllSongsPaged, countSongs } from '../../src/music/persistence/song-repository.js';
import { initDB, getInitError, isDBEnabled } from '../../src/music/persistence/db.js';
import { buildSongIdentity } from '../../src/music/identity/build-identity.js';
import { indexSongsBatch, clearIndex } from '../../src/music/search-index/indexer.js';
import { initMeili, getIndexStats, isMeiliEnabled } from '../../src/music/search-index/meili-client.js';
import { clearSearchCache } from '../../src/music/cache/search-cache.js';

// Vercel Serverless Function
export default async function handler(req, res) {
    const startTime = Date.now();

    // 1. Auth Check
    const adminToken = process.env.ADMIN_TOKEN;
    const requestToken = req.headers['x-admin-token'];

    if (!adminToken || requestToken !== adminToken) {
        if (!process.env.ADMIN_TOKEN) {
            return res.status(500).json({ error: 'Config Error', message: 'ADMIN_TOKEN env var not set on server' });
        }
        return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid admin token' });
    }

    // 2. Init Infrastructure
    await Promise.all([
        initDB(),
        initMeili()
    ]);

    // CHECK DB HEALTH
    if (!isDBEnabled()) {
        const err = getInitError();
        return res.status(500).json({
            error: 'DB Connection Failed',
            message: err ? err.message : 'Unknown DB error. Check DATABASE_URL.',
            config: process.env.DATABASE_URL ? 'Likely Valid URL Format' : 'MISSING DATABASE_URL'
        });
    }

    const { mode } = req.query;

    try {
        // -----------------------------------------------------------------------
        // MACRO: DEBUG SEARCH MODE (Direct Meili Access)
        // -----------------------------------------------------------------------
        if (mode === 'debug-search') {
            const q = req.query.q || '';
            const meiliClient = await import('../../src/music/search-index/meili-client.js');
            const index = meiliClient.getSongsIndex();

            if (!index) {
                return res.status(500).json({ error: 'Index not initialized' });
            }

            // Búsqueda cruda sin filtros de app
            const searchResult = await index.search(q, {
                limit: 10,
                attributesToRetrieve: ['*'], // Ver TODO
                showRankingScore: true
            });

            return res.status(200).json({
                query: q,
                hits: searchResult.hits,
                estimatedTotalHits: searchResult.estimatedTotalHits,
                processingTimeMs: searchResult.processingTimeMs
            });
        }

        // -----------------------------------------------------------------------
        // MACRO: STATS MODE
        // -----------------------------------------------------------------------
        // Solo entrar si es GET explícito o si mode=stats se pidió explícitamente
        if (mode === 'stats' || (req.method === 'GET' && !mode)) {
            const meiliStats = await getIndexStats();
            const dbCount = await countSongs();

            return res.status(200).json({
                status: 'ok',
                environment: process.env.VERCEL_ENV || 'development',
                meilisearch: {
                    enabled: isMeiliEnabled(),
                    url_configured: !!process.env.MEILI_URL,
                    key_configured: !!process.env.MEILI_MASTER_KEY,
                    stats: meiliStats || 'Unavailable',
                },
                postgres: {
                    total_songs: dbCount
                }
            });
        }

        // -----------------------------------------------------------------------
        // MACRO: REBUILD MODE
        // -----------------------------------------------------------------------
        if (req.method === 'POST') {
            const { batchSize = 100, offset = 0, limit = null, resetIndex = false } = req.body || {};
            const effectiveBatchSize = Math.min(Math.max(1, batchSize), 500); // Serverless safety cap

            // Paso 0: Reset si se solicita (SOLO si offset es 0 para evitar accidentes en paginación manual)
            if (resetIndex && offset === 0) {
                console.log('[admin] Rebuild: Limpiando índice...');
                await clearIndex();
            }

            // Paso 1: Leer DB
            const fetchLimit = limit ? Math.min(limit, effectiveBatchSize) : effectiveBatchSize;
            console.log(`[admin] Fetching ${fetchLimit} songs (Offset: ${offset})...`);

            const songs = await getAllSongsPaged(fetchLimit, offset);

            if (!songs || songs.length === 0) {
                return res.status(200).json({
                    message: 'No more songs to index',
                    processed: 0,
                    nextOffset: null
                });
            }

            // Paso 2: Transformar (Recuperar Identity de DB o reconstruir)
            // Importar dinámicamente getSongIdentity para evitar conflictos si no se importó arriba
            const { getSongIdentity } = await import('../../src/music/persistence/song-repository.js');

            const itemsToIndex = [];

            // Procesar en paralelo para velocidad
            const promises = songs.map(async (song) => {
                try {
                    // Intento 1: Leer de DB (Consistencia con song-loader)
                    let identity = await getSongIdentity(song.id);

                    // Intento 2: Reconstruir al vuelo si falta
                    if (!identity) {
                        // console.warn(`[admin] Identity missing for ${song.id}, rebuilding...`);
                        identity = buildSongIdentity(song);
                    }

                    if (identity) {
                        return { song, identity };
                    }
                    return null;
                } catch (e) {
                    console.warn(`[admin] Error preparing song ${song.id}:`, e.message);
                    return null;
                }
            });

            const results = await Promise.all(promises);
            itemsToIndex.push(...results.filter(item => item !== null));

            // Paso 3: Indexar en Meili
            const result = await indexSongsBatch(itemsToIndex);

            // Paso 4: Limpiar cache de búsqueda (una vez por batch)
            clearSearchCache();

            return res.status(200).json({
                status: 'success',
                batch: {
                    offset,
                    limit: fetchLimit,
                    fetched: songs.length,
                    indexed: result.indexed,
                    failed: result.failed
                },
                nextOffset: songs.length < fetchLimit ? null : offset + songs.length,
                elapsedMs: Date.now() - startTime
            });
        }

        return res.status(405).json({ error: 'Method Not Allowed', message: 'Use POST for rebuild, GET for stats' });

    } catch (error) {
        console.error('[admin] Error in rebuild-index:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
}
