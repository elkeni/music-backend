/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📦 IDENTITY STORE - FASE 2: ALMACÉN DE IDENTIDADES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Almacena identidades canónicas en paralelo a las canciones.
 * NO modifica el modelo Song, solo anota.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { buildSongIdentity } from './build-identity.js';
import { getAllSongs } from '../song-store.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ALMACÉN DE IDENTIDADES - Map<songId, SongIdentity>
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map paralelo que almacena identidades sin modificar Song
 * Clave: songId
 * Valor: SongIdentity
 * 
 * @type {Map<string, import('./build-identity.js').SongIdentity>}
 */
const songIdentityMap = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE ACCESO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Construye y almacena la identidad de una canción
 * 
 * @param {import('../song-model.js').Song} song - Canción
 * @returns {import('./build-identity.js').SongIdentity} - Identidad generada
 */
export function attachIdentity(song) {
    if (!song || !song.id) {
        throw new Error('attachIdentity requiere una canción válida con id');
    }

    const identity = buildSongIdentity(song);
    songIdentityMap.set(song.id, identity);

    return identity;
}

/**
 * Obtiene la identidad de una canción por su ID
 * 
 * @param {string} songId - ID de la canción
 * @returns {import('./build-identity.js').SongIdentity | null}
 */
export function getIdentity(songId) {
    if (!songId) {
        return null;
    }
    return songIdentityMap.get(songId) || null;
}

/**
 * Verifica si una canción tiene identidad asignada
 * 
 * @param {string} songId - ID de la canción
 * @returns {boolean}
 */
export function hasIdentity(songId) {
    return songIdentityMap.has(songId);
}

/**
 * Obtiene todas las identidades almacenadas
 * 
 * @returns {import('./build-identity.js').SongIdentity[]}
 */
export function getAllIdentities() {
    return Array.from(songIdentityMap.values());
}

/**
 * Obtiene el número de identidades almacenadas
 * 
 * @returns {number}
 */
export function getIdentityCount() {
    return songIdentityMap.size;
}

/**
 * Limpia el store de identidades
 */
export function clearIdentities() {
    const count = songIdentityMap.size;
    songIdentityMap.clear();
    console.log(`[identity-store] Store limpiado. ${count} identidades eliminadas.`);
}

/**
 * Busca canciones por identityKey
 * Útil para encontrar duplicados potenciales
 * 
 * @param {string} identityKey - Clave de identidad a buscar
 * @returns {import('./build-identity.js').SongIdentity[]} - Identidades que coinciden
 */
export function findByIdentityKey(identityKey) {
    const results = [];
    for (const identity of songIdentityMap.values()) {
        if (identity.identityKey === identityKey) {
            results.push(identity);
        }
    }
    return results;
}

/**
 * Agrupa todas las identidades por identityKey
 * Útil para detectar duplicados
 * 
 * @returns {Map<string, import('./build-identity.js').SongIdentity[]>}
 */
export function groupByIdentityKey() {
    const groups = new Map();

    for (const identity of songIdentityMap.values()) {
        const key = identity.identityKey;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(identity);
    }

    return groups;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE FASE 2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ejecuta la normalización FASE 2 sobre todas las canciones del store
 * 
 * NO filtra, NO rechaza, NO ordena
 * Solo construye identidades canónicas
 * 
 * @returns {{ total: number, withIdentity: number }}
 */
export function runPhase2Normalization() {
    console.log('[phase-2] ════════════════════════════════════════════════════════');
    console.log('[phase-2] INICIANDO FASE 2: NORMALIZACIÓN CANÓNICA');
    console.log('[phase-2] ════════════════════════════════════════════════════════');

    const songs = getAllSongs();
    let withIdentity = 0;

    for (const song of songs) {
        try {
            attachIdentity(song);
            withIdentity++;
        } catch (error) {
            console.error(`[phase-2] Error procesando ${song.id}:`, error.message);
        }
    }

    console.log('[phase-2] ════════════════════════════════════════════════════════');
    console.log('[phase-2] FASE 2 COMPLETADA');
    console.log(`[phase-2] Total canciones: ${songs.length}`);
    console.log(`[phase-2] Con identidad: ${withIdentity}`);
    console.log(`[phase-2] Identidades únicas: ${new Set(getAllIdentities().map(i => i.identityKey)).size}`);
    console.log('[phase-2] ════════════════════════════════════════════════════════');

    return {
        total: songs.length,
        withIdentity
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT del Map para debugging/tests
// ═══════════════════════════════════════════════════════════════════════════════

export const _identityStore = songIdentityMap;
