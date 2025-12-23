/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 SONG STORE - FASE 1: COLECCIÓN CENTRAL DE CANCIONES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Repositorio en memoria para almacenar canciones del modelo unificado.
 * Usa un Map con Song.id como clave.
 * 
 * REGLAS:
 * - La clave del Map debe ser Song.id
 * - NO usar base de datos todavía
 * - NO usar Elasticsearch aún
 * - NO hacer normalización
 * - Esto es un repositorio en memoria
 * 
 * FUNCIONES REQUERIDAS:
 * - addSong(song: Song): void
 * - getSongById(id: string): Song | null
 * - getAllSongs(): Song[]
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { validateSong } from './song-model.js';

// ═══════════════════════════════════════════════════════════════════════════════
// COLECCIÓN CENTRAL - Map<string, Song>
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Almacén central de canciones
 * Clave: Song.id (string)
 * Valor: Song object
 * 
 * @type {Map<string, import('./song-model.js').Song>}
 */
const songStore = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES PRINCIPALES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Añade una canción al store
 * Si ya existe una canción con el mismo ID, la reemplaza
 * 
 * @param {import('./song-model.js').Song} song - Canción a añadir
 * @throws {Error} Si la canción no tiene un ID válido o no pasa validación
 */
export function addSong(song) {
    // Validar estructura antes de insertar
    const validation = validateSong(song);

    if (!validation.valid) {
        console.error(`[song-store] Canción inválida:`, validation.errors);
        throw new Error(`Canción inválida: ${validation.errors.join(', ')}`);
    }

    // Insertar en el Map
    songStore.set(song.id, song);

    console.log(`[song-store] Canción añadida: "${song.title}" (${song.source}:${song.sourceId})`);
}

/**
 * Añade múltiples canciones al store
 * Para carga eficiente de lotes
 * 
 * @param {import('./song-model.js').Song[]} songs - Array de canciones a añadir
 * @returns {{ success: number, failed: number, errors: string[] }}
 */
export function addSongs(songs) {
    const result = {
        success: 0,
        failed: 0,
        errors: []
    };

    for (const song of songs) {
        try {
            addSong(song);
            result.success++;
        } catch (error) {
            result.failed++;
            result.errors.push(`${song?.id || 'unknown'}: ${error.message}`);
        }
    }

    console.log(`[song-store] Lote procesado: ${result.success} éxitos, ${result.failed} errores`);
    return result;
}

/**
 * Obtiene una canción por su ID
 * 
 * @param {string} id - ID de la canción
 * @returns {import('./song-model.js').Song | null} La canción o null si no existe
 */
export function getSongById(id) {
    if (!id || typeof id !== 'string') {
        return null;
    }

    return songStore.get(id) || null;
}

/**
 * Obtiene todas las canciones del store
 * 
 * @returns {import('./song-model.js').Song[]} Array con todas las canciones
 */
export function getAllSongs() {
    return Array.from(songStore.values());
}

/**
 * Obtiene el número total de canciones almacenadas
 * 
 * @returns {number} Cantidad de canciones
 */
export function getSongCount() {
    return songStore.size;
}

/**
 * Verifica si existe una canción con el ID dado
 * 
 * @param {string} id - ID a verificar
 * @returns {boolean}
 */
export function hasSong(id) {
    return songStore.has(id);
}

/**
 * Elimina una canción del store
 * 
 * @param {string} id - ID de la canción a eliminar
 * @returns {boolean} true si se eliminó, false si no existía
 */
export function removeSong(id) {
    const existed = songStore.has(id);
    songStore.delete(id);

    if (existed) {
        console.log(`[song-store] Canción eliminada: ${id}`);
    }

    return existed;
}

/**
 * Limpia todo el store
 * Útil para tests o reinicialización
 */
export function clearStore() {
    const count = songStore.size;
    songStore.clear();
    console.log(`[song-store] Store limpiado. ${count} canciones eliminadas.`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE CONSULTA (Para futuras fases - NO implementar lógica aquí)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene todas las canciones de una fuente específica
 * 
 * @param {'youtube' | 'deezer' | 'saavn'} source - Fuente a filtrar
 * @returns {import('./song-model.js').Song[]}
 */
export function getSongsBySource(source) {
    return getAllSongs().filter(song => song.source === source);
}

/**
 * Obtiene todas las canciones de un tipo de versión específico
 * 
 * @param {import('./song-model.js').VersionType} versionType
 * @returns {import('./song-model.js').Song[]}
 */
export function getSongsByVersionType(versionType) {
    return getAllSongs().filter(song => song.versionType === versionType);
}

/**
 * Estadísticas básicas del store
 * Útil para monitoreo y debugging
 * 
 * @returns {Object}
 */
export function getStoreStats() {
    const songs = getAllSongs();

    // Contar por fuente
    const bySource = {};
    for (const song of songs) {
        bySource[song.source] = (bySource[song.source] || 0) + 1;
    }

    // Contar por tipo de versión
    const byVersionType = {};
    for (const song of songs) {
        byVersionType[song.versionType] = (byVersionType[song.versionType] || 0) + 1;
    }

    // Calcular duración promedio
    const totalDuration = songs.reduce((sum, s) => sum + s.duration, 0);
    const avgDuration = songs.length > 0 ? totalDuration / songs.length : 0;

    return {
        totalSongs: songs.length,
        bySource,
        byVersionType,
        averageDurationSeconds: Math.round(avgDuration),
        withAlbum: songs.filter(s => s.album).length,
        withReleaseDate: songs.filter(s => s.releaseDate).length
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT del Map para debugging/tests
// ═══════════════════════════════════════════════════════════════════════════════

export const _store = songStore;
