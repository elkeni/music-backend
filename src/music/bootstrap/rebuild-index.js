import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';

import { initDB, closeDB, isDBEnabled } from '../persistence/db.js';
import {
    getAllSongsPaged,
    getSongIdentity,
    countSongs
} from '../persistence/song-repository.js';
import { initMeili, closeMeili, isMeiliEnabled } from '../search-index/meili-client.js';
import { clearIndex, indexSongsBatch, getIndexStats } from '../search-index/indexer.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📇 REBUILD INDEX - FASE 6: REINDEXACIÓN EN MEILISEARCH
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Reindexa todas las canciones desde la base de datos a Meilisearch.
 * 
 * Uso CLI:
 * node src/music/bootstrap/rebuild-index.js
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Tamaño de batch para indexación
 */
const BATCH_SIZE = 200;

/**
 * Reindexa todas las canciones en Meilisearch
 * 
 * @param {Object} [options]
 * @param {boolean} [options.clearFirst=true] - Limpiar índice antes
 * @returns {Promise<{indexed: number, failed: number, time: number}>}
 */
export async function rebuildMeiliIndex(options = { clearFirst: true }) {
    console.log('[rebuild-index] Iniciando reindexación en Meilisearch...');

    const startTime = Date.now();

    // Verificar que DB está disponible
    if (!isDBEnabled()) {
        const dbConnected = await initDB();
        if (!dbConnected) {
            throw new Error('No se pudo conectar a la base de datos');
        }
    }

    // Verificar que Meili está disponible
    if (!isMeiliEnabled()) {
        const meiliConnected = await initMeili();
        if (!meiliConnected) {
            throw new Error('No se pudo conectar a Meilisearch');
        }
    }

    const stats = {
        indexed: 0,
        failed: 0,
        time: 0
    };

    // Limpiar índice si se solicita
    if (options.clearFirst) {
        console.log('[rebuild-index] Limpiando índice existente...');
        await clearIndex();
    }

    // Obtener total de canciones
    const totalSongs = await countSongs();
    console.log(`[rebuild-index] ${totalSongs} canciones a indexar`);

    // Procesar en batches
    let offset = 0;
    while (offset < totalSongs) {
        const songs = await getAllSongsPaged(BATCH_SIZE, offset);

        // Obtener identidades para cada canción
        const batch = [];
        for (const song of songs) {
            const identity = await getSongIdentity(song.id);
            if (identity) {
                batch.push({ song, identity });
            }
        }

        // Indexar batch
        if (batch.length > 0) {
            const result = await indexSongsBatch(batch);
            stats.indexed += result.indexed;
            stats.failed += result.failed;
        }

        offset += BATCH_SIZE;
        console.log(`[rebuild-index] Progreso: ${Math.min(offset, totalSongs)}/${totalSongs}`);
    }

    stats.time = Date.now() - startTime;

    // Verificar índice
    const indexStats = await getIndexStats();

    // REPARACIÓN FASE 6: Invalidar cache tras reindexación
    console.log('[rebuild-index] Invalidando cache...');
    try {
        const { clearSearchCache } = await import('../cache/search-cache.js');
        clearSearchCache();

        try {
            const redisCache = await import('../cache/redis-cache.js');
            if (redisCache.isRedisEnabled()) {
                await redisCache.redisClearSearchCache();
            }
        } catch (e) {
            // Redis no disponible
        }
        console.log('[rebuild-index] Cache invalidado');
    } catch (e) {
        console.warn('[rebuild-index] Error invalidando cache:', e.message);
    }

    console.log('[rebuild-index] ✅ Reindexación completada:');
    console.log(`  - Indexed: ${stats.indexed}`);
    console.log(`  - Failed: ${stats.failed}`);
    console.log(`  - Time: ${stats.time}ms`);
    console.log(`  - Documentos en índice: ${indexStats?.numberOfDocuments || 'N/A'}`);

    return stats;
}

/**
 * Verifica la integridad del índice
 * 
 * @returns {Promise<boolean>}
 */
export async function verifyIndex() {
    const dbCount = await countSongs();
    const indexStats = await getIndexStats();

    console.log('[verify-index] Verificación de índice:');
    console.log(`  - Songs en DB: ${dbCount}`);
    console.log(`  - Documentos en índice: ${indexStats?.numberOfDocuments || 0}`);

    const isValid = indexStats?.numberOfDocuments === dbCount;

    if (isValid) {
        console.log('[verify-index] ✅ Integridad OK');
    } else {
        console.log('[verify-index] ⚠️ Diferencia en conteo (puede ser normal si hay songs sin identity)');
    }

    return isValid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const entryFile = process.argv[1];

// Robust main module check
const isMainModule = path.resolve(__filename) === path.resolve(entryFile);

if (isMainModule) {
    (async () => {
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('📇 REBUILD MEILISEARCH INDEX');
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('[bootstrap] rebuild-index starting');

        // Validation of environment variables
        const meiliUrl = process.env.MEILI_URL;
        const meiliKey = process.env.MEILI_MASTER_KEY;
        const dbUrl = process.env.DATABASE_URL;

        console.log(`[bootstrap] MEILI_URL = ${meiliUrl || 'Not Set'}`);
        console.log(`[bootstrap] MEILI_MASTER_KEY = ${!!meiliKey}`);
        console.log(`[bootstrap] DATABASE_URL = ${!!dbUrl}`);

        if (!meiliUrl) {
            console.error('❌ Error: MEILI_URL is required in .env');
            process.exit(1);
        }

        try {
            await initDB();
            await initMeili();

            await rebuildMeiliIndex();
            await verifyIndex();

            closeMeili();
            await closeDB();

            console.log('\n✅ Reindexación completada exitosamente');
            process.exit(0);
        } catch (error) {
            console.error('\n❌ Error durante reindexación:', error);
            process.exit(1);
        }
    })();
}
