/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏷️ CANONICAL GROUPS - FASE 3: AGRUPACIÓN CANÓNICA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Agrupa canciones que representan la MISMA canción real usando identityKey.
 * 
 * REGLAS:
 * - Agrupar SOLO por identityKey (clave única de FASE 2)
 * - NO mezclar versiones diferentes
 * - NO mezclar duraciones distintas
 * - NO usar heurísticas nuevas
 * 
 * FASE 3 NO DEVUELVE RESULTADOS AL USUARIO
 * Solo clasifica y anota
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { getAllSongs } from '../song-store.js';
import { getIdentity, getAllIdentities } from '../identity/identity-store.js';

/**
 * @typedef {Object} CanonicalGroup
 * @property {string} identityKey - Clave canónica que identifica el grupo
 * @property {import('../song-model.js').Song[]} songs - Canciones en el grupo
 * @property {import('../identity/build-identity.js').SongIdentity[]} identities - Identidades correspondientes
 */

/**
 * Construye grupos canónicos basados en identityKey
 * Cada grupo contiene canciones que representan la MISMA canción real
 * 
 * @returns {Map<string, CanonicalGroup>} - Mapa de identityKey a CanonicalGroup
 */
export function buildCanonicalGroups() {
    console.log('[canonical-groups] ══════════════════════════════════════════════');
    console.log('[canonical-groups] CONSTRUYENDO GRUPOS CANÓNICOS');
    console.log('[canonical-groups] ══════════════════════════════════════════════');

    const songs = getAllSongs();
    const groups = new Map();

    for (const song of songs) {
        // Obtener identidad de FASE 2
        const identity = getIdentity(song.id);

        if (!identity) {
            console.warn(`[canonical-groups] Canción sin identidad: ${song.id}`);
            continue;
        }

        const key = identity.identityKey;

        // Crear grupo si no existe
        if (!groups.has(key)) {
            groups.set(key, {
                identityKey: key,
                songs: [],
                identities: []
            });
        }

        // Agregar canción e identidad al grupo
        const group = groups.get(key);
        group.songs.push(song);
        group.identities.push(identity);
    }

    // Estadísticas
    const totalGroups = groups.size;
    const groupsWithMultiple = Array.from(groups.values()).filter(g => g.songs.length > 1).length;
    const maxGroupSize = Math.max(...Array.from(groups.values()).map(g => g.songs.length), 0);

    console.log('[canonical-groups] ══════════════════════════════════════════════');
    console.log('[canonical-groups] AGRUPACIÓN COMPLETADA');
    console.log(`[canonical-groups] Total canciones: ${songs.length}`);
    console.log(`[canonical-groups] Total grupos: ${totalGroups}`);
    console.log(`[canonical-groups] Grupos con múltiples: ${groupsWithMultiple}`);
    console.log(`[canonical-groups] Tamaño máximo: ${maxGroupSize}`);
    console.log('[canonical-groups] ══════════════════════════════════════════════');

    return groups;
}

/**
 * Obtiene un grupo canónico por identityKey
 * 
 * @param {Map<string, CanonicalGroup>} groups - Mapa de grupos
 * @param {string} identityKey - Clave a buscar
 * @returns {CanonicalGroup | null}
 */
export function getCanonicalGroup(groups, identityKey) {
    return groups.get(identityKey) || null;
}

/**
 * Obtiene estadísticas de los grupos canónicos
 * 
 * @param {Map<string, CanonicalGroup>} groups - Mapa de grupos
 * @returns {Object}
 */
export function getGroupStats(groups) {
    const groupArray = Array.from(groups.values());

    const stats = {
        totalGroups: groups.size,
        totalSongs: groupArray.reduce((sum, g) => sum + g.songs.length, 0),
        singleSongGroups: groupArray.filter(g => g.songs.length === 1).length,
        multiSongGroups: groupArray.filter(g => g.songs.length > 1).length,
        maxGroupSize: Math.max(...groupArray.map(g => g.songs.length), 0),
        avgGroupSize: groups.size > 0
            ? groupArray.reduce((sum, g) => sum + g.songs.length, 0) / groups.size
            : 0
    };

    return stats;
}
