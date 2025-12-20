/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📇 INDEXER - FASE 6: INDEXACIÓN DE CANCIONES EN MEILISEARCH
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Indexa canciones con sus identidades para búsqueda rápida.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { getSongsIndex, isMeiliEnabled, getClient, SONGS_INDEX_NAME } from './meili-client.js';

/**
 * @typedef {Object} SongDocument
 * @property {string} songId - ID de la canción
 * @property {string} titleClean - Título limpio
 * @property {string} titleNormalized - Título normalizado
 * @property {string[]} artistNormalized - Artistas normalizados
 * @property {string} [album] - Álbum
 * @property {string} [releaseDate] - Fecha de lanzamiento
 * @property {number} durationBucket - Bucket de duración
 * @property {string} versionType - Tipo de versión
 * @property {string} identityKey - Identity key
 * @property {string} source - Fuente (deezer, youtube)
 */

/**
 * Construye un documento indexable desde una canción e identidad
 * 
 * @param {import('../song-model.js').Song} song
 * @param {import('../identity/build-identity.js').SongIdentity} identity
 * @returns {SongDocument}
 */
export function buildSongDocument(song, identity) {
    // ⚠️ ASEGURAR QUE LOS CAMPOS COINCIDEN CON FILTERABLE ATTRIBUTES EN MEILI-CLIENT
    // filterableAttributes: ['versionType', 'durationBucket', 'source', 'identityKey']

    return {
        songId: song.id, // Primary Key
        titleClean: identity.titleClean,
        titleNormalized: identity.titleNormalized,
        artistNormalized: identity.artistNormalized || [],
        album: song.album || null,
        releaseDate: song.releaseDate || null,
        durationBucket: identity.durationBucket, // Filterable
        versionType: song.versionType || 'original', // Filterable
        identityKey: identity.identityKey, // Filterable
        source: song.source // Filterable
    };
}

/**
 * Indexa una canción
 * 
 * @param {import('../song-model.js').Song} song
 * @param {import('../identity/build-identity.js').SongIdentity} identity
 * @returns {Promise<boolean>}
 */
export async function indexSong(song, identity) {
    if (!isMeiliEnabled()) {
        return false;
    }

    const index = getSongsIndex();
    if (!index) return false;

    try {
        const document = buildSongDocument(song, identity);
        await index.addDocuments([document]);
        return true;
    } catch (error) {
        console.error(`[indexer] Error indexando canción en índice "${SONGS_INDEX_NAME}":`, error.message);
        return false;
    }
}

/**
 * Indexa múltiples canciones en batch
 * 
 * @param {Array<{song: Song, identity: SongIdentity}>} items
 * @returns {Promise<{indexed: number, failed: number}>}
 */
export async function indexSongsBatch(items) {
    if (!isMeiliEnabled() || !items || items.length === 0) {
        return { indexed: 0, failed: items?.length || 0 };
    }

    const index = getSongsIndex();
    if (!index) {
        return { indexed: 0, failed: items.length };
    }

    try {
        const documents = items.map(item => buildSongDocument(item.song, item.identity));

        // Meilisearch maneja batches internamente
        const task = await index.addDocuments(documents);
        const taskUid = task.taskUid || task.uid;

        // REPARACIÓN: Usar client.waitForTask si disponible para mayor compatibilidad
        const client = getClient();
        if (client && typeof client.waitForTask === 'function') {
            await client.waitForTask(taskUid, { timeOutMs: 30000 });
        } else if (typeof index.waitForTask === 'function') {
            await index.waitForTask(taskUid, { timeOutMs: 30000 });
        } else {
            console.warn('[indexer] No se puede esperar por la tarea (waitForTask faltante), asumiendo éxito optimista.');
        }

        console.log(`[indexer] ${documents.length} canciones indexadas en "${SONGS_INDEX_NAME}"`);
        return { indexed: documents.length, failed: 0 };
    } catch (error) {
        console.error(`[indexer] Error en batch sobre "${SONGS_INDEX_NAME}":`, error.message);
        return { indexed: 0, failed: items.length };
    }
}

/**
 * Elimina una canción del índice
 * 
 * @param {string} songId
 * @returns {Promise<boolean>}
 */
export async function deleteSongFromIndex(songId) {
    if (!isMeiliEnabled()) return false;

    const index = getSongsIndex();
    if (!index) return false;

    try {
        await index.deleteDocument(songId);
        return true;
    } catch (error) {
        console.error(`[indexer] Error eliminando documento de "${SONGS_INDEX_NAME}":`, error.message);
        return false;
    }
}

/**
 * Limpia todo el índice
 * 
 * @returns {Promise<boolean>}
 */
export async function clearIndex() {
    if (!isMeiliEnabled()) return false;

    const index = getSongsIndex();
    if (!index) return false;

    try {
        const task = await index.deleteAllDocuments();
        await index.waitForTask(task.taskUid, { timeOutMs: 60000 });
        console.log(`[indexer] Índice "${SONGS_INDEX_NAME}" limpiado`);
        return true;
    } catch (error) {
        console.error(`[indexer] Error limpiando índice "${SONGS_INDEX_NAME}":`, error.message);
        return false;
    }
}

/**
 * Obtiene estadísticas del índice
 * 
 * @returns {Promise<{numberOfDocuments: number, isIndexing: boolean} | null>}
 */
export async function getIndexStats() {
    if (!isMeiliEnabled()) return null;

    const index = getSongsIndex();
    if (!index) return null;

    try {
        const stats = await index.getStats();
        return {
            numberOfDocuments: stats.numberOfDocuments,
            isIndexing: stats.isIndexing
        };
    } catch (error) {
        console.error(`[indexer] Error obteniendo stats de "${SONGS_INDEX_NAME}":`, error.message);
        return null;
    }
}
