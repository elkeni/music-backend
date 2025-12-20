/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ♻️ REBUILD FROM DB - FASE 6: RECONSTRUCCIÓN DE STORES EN MEMORIA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Reconstruye identity-store y authority-store desde la base de datos.
 * Garantiza que el sistema puede arrancar sin depender de datos in-memory.
 * 
 * REPARACIÓN FASE 6 HARDENING:
 * - Rehidrata autoridad COMPLETA (score, level, reasons, isNonOfficial)
 * - Rehidrata canonical_selections sin recalcular
 * - Invalida cache Redis tras rebuild
 * 
 * Uso CLI:
 * node src/music/bootstrap/rebuild-from-db.js
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { initDB, closeDB, isDBEnabled } from '../persistence/db.js';
import {
    getAllSongsPaged,
    getSongById,
    getSongIdentity,
    getSongAuthority,
    countSongs,
    getAllCanonicalSelectionsPaged,
    countCanonicalSelections
} from '../persistence/song-repository.js';
import { addSong, clearStore, getSongById as getFromStore } from '../song-store.js';
import { attachIdentity, clearIdentities } from '../identity/identity-store.js';
import {
    clearAuthorityStores,
    rehydrateAuthority,
    rehydrateNonOfficial,
    rehydrateCanonicalSelection,
    getAuthorityCount,
    getNonOfficialCount,
    getCanonicalSelectionsCount
} from '../authority/authority-store.js';

// Import dinámico de Redis para invalidar cache
let redisCache = null;
try {
    redisCache = await import('../cache/redis-cache.js');
} catch (e) {
    // Redis no disponible, continuar sin él
}

/**
 * Tamaño de página para la carga
 */
const PAGE_SIZE = 500;

/**
 * Reconstruye todos los stores en memoria desde la base de datos
 * 
 * PROCESO:
 * 1. Cargar Songs → song-store
 * 2. Cargar Identities → identity-store
 * 3. Cargar Authority + NonOfficial → authority-store
 * 4. Cargar CanonicalSelections → authority-store
 * 5. Invalidar cache Redis
 * 
 * @returns {Promise<{songs: number, identities: number, authorities: number, canonicalSelections: number}>}
 */
export async function rebuildStoresFromDB() {
    console.log('[rebuild] ════════════════════════════════════════════════════════');
    console.log('[rebuild] INICIANDO RECONSTRUCCIÓN DESDE DB');
    console.log('[rebuild] ════════════════════════════════════════════════════════');

    // Verificar que DB está disponible
    if (!isDBEnabled()) {
        const connected = await initDB();
        if (!connected) {
            throw new Error('No se pudo conectar a la base de datos');
        }
    }

    // Limpiar stores en memoria
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    const stats = {
        songs: 0,
        identities: 0,
        authorities: 0,
        nonOfficials: 0,
        canonicalSelections: 0
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1: Cargar canciones e identidades
    // ═══════════════════════════════════════════════════════════════════════════

    const totalSongs = await countSongs();
    console.log(`[rebuild] ${totalSongs} canciones en DB`);

    let offset = 0;
    while (offset < totalSongs) {
        const songs = await getAllSongsPaged(PAGE_SIZE, offset);

        for (const song of songs) {
            // Agregar canción al store
            addSong(song);
            stats.songs++;

            // Cargar identidad si existe
            const identity = await getSongIdentity(song.id);
            if (identity) {
                attachIdentity(song.id, identity);
                stats.identities++;
            }

            // REPARACIÓN: Rehidratar autoridad COMPLETA
            const authorityData = await getSongAuthority(song.id);
            if (authorityData) {
                // Rehidratar autoridad (score, level, reasons)
                rehydrateAuthority(song.id, authorityData.authority);
                stats.authorities++;

                // Rehidratar estado no oficial
                rehydrateNonOfficial(song.id, authorityData.nonOfficial);
                if (authorityData.nonOfficial.isNonOfficial) {
                    stats.nonOfficials++;
                }
            }
        }

        offset += PAGE_SIZE;
        console.log(`[rebuild] Songs: ${Math.min(offset, totalSongs)}/${totalSongs}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2: Rehidratar selecciones canónicas
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('[rebuild] Cargando selecciones canónicas...');

    const totalSelections = await countCanonicalSelections();
    offset = 0;

    while (offset < totalSelections) {
        const selections = await getAllCanonicalSelectionsPaged(PAGE_SIZE, offset);

        for (const sel of selections) {
            // Obtener la canción canónica del store
            const canonicalSong = getFromStore(sel.canonicalSongId);
            if (!canonicalSong) {
                console.warn(`[rebuild] Canónica ${sel.canonicalSongId} no encontrada en store`);
                continue;
            }

            // Obtener las alternativas del store
            const alternatives = [];
            for (const altId of sel.alternativeIds) {
                const altSong = getFromStore(altId);
                if (altSong) {
                    alternatives.push(altSong);
                }
            }

            // REPARACIÓN: Rehidratar selección canónica
            rehydrateCanonicalSelection(
                sel.identityKey,
                canonicalSong,
                sel.authorityScore,
                alternatives
            );
            stats.canonicalSelections++;
        }

        offset += PAGE_SIZE;
        console.log(`[rebuild] Selections: ${Math.min(offset, totalSelections)}/${totalSelections}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 3: Invalidar cache Redis
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('[rebuild] Invalidando cache...');

    if (redisCache && redisCache.isRedisEnabled()) {
        await redisCache.redisClearSearchCache();
        console.log('[rebuild] Cache Redis invalidado');
    }

    // También limpiar cache in-memory
    const { clearSearchCache } = await import('../cache/search-cache.js');
    clearSearchCache();
    console.log('[rebuild] Cache in-memory invalidado');

    // ═══════════════════════════════════════════════════════════════════════════
    // ESTADÍSTICAS FINALES
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('[rebuild] ════════════════════════════════════════════════════════');
    console.log('[rebuild] ✅ RECONSTRUCCIÓN COMPLETADA');
    console.log(`[rebuild]   - Songs: ${stats.songs}`);
    console.log(`[rebuild]   - Identities: ${stats.identities}`);
    console.log(`[rebuild]   - Authorities: ${stats.authorities}`);
    console.log(`[rebuild]   - Non-Officials: ${stats.nonOfficials}`);
    console.log(`[rebuild]   - Canonical Selections: ${stats.canonicalSelections}`);
    console.log('[rebuild] ════════════════════════════════════════════════════════');

    return stats;
}

/**
 * Verifica la integridad después del rebuild
 * 
 * @returns {Promise<boolean>}
 */
export async function verifyRebuild() {
    const { getSongCount } = await import('../song-store.js');
    const { getIdentityCount } = await import('../identity/identity-store.js');

    const songCount = getSongCount();
    const identityCount = getIdentityCount();
    const authorityCount = getAuthorityCount();
    const selectionsCount = getCanonicalSelectionsCount();
    const dbCount = await countSongs();
    const dbSelectionsCount = await countCanonicalSelections();

    console.log('[verify] ════════════════════════════════════════════════════════');
    console.log('[verify] VERIFICACIÓN DE INTEGRIDAD');
    console.log(`[verify]   - Songs en memoria: ${songCount}`);
    console.log(`[verify]   - Songs en DB: ${dbCount}`);
    console.log(`[verify]   - Identities en memoria: ${identityCount}`);
    console.log(`[verify]   - Authorities en memoria: ${authorityCount}`);
    console.log(`[verify]   - Canonical Selections en memoria: ${selectionsCount}`);
    console.log(`[verify]   - Canonical Selections en DB: ${dbSelectionsCount}`);
    console.log('[verify] ════════════════════════════════════════════════════════');

    const isValid = songCount === dbCount && selectionsCount === dbSelectionsCount;

    if (isValid) {
        console.log('[verify] ✅ Integridad OK');
    } else {
        console.log('[verify] ❌ Error de integridad');
    }

    return isValid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('♻️ REBUILD STORES FROM DATABASE');
    console.log('═══════════════════════════════════════════════════════════════════════');

    try {
        await initDB();
        await rebuildStoresFromDB();
        await verifyRebuild();
        await closeDB();

        console.log('\n✅ Rebuild completado exitosamente');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error durante rebuild:', error.message);
        process.exit(1);
    }
}
