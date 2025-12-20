/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔮 SEARCH SUGGESTIONS - EXPERIMENTAL
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ EXPERIMENTAL: Esta funcionalidad está marcada como experimental.
 * No usar en producción hasta FASE 6.
 * 
 * Funcionalidad de autocompletado básico para búsquedas.
 * Separado del search-service principal para mantener contratos claros.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { getAllSongs } from '../song-store.js';

/**
 * @experimental
 * Obtiene sugerencias de búsqueda basadas en prefijo
 * 
 * Limitaciones actuales:
 * - Solo matchea por inicio de título
 * - No usa cache
 * - No prioriza por popularidad
 * 
 * @param {string} prefix - Prefijo a buscar
 * @param {number} [limit=5] - Máximo de sugerencias
 * @returns {string[]} - Array de títulos sugeridos
 */
export function getSearchSuggestions(prefix, limit = 5) {
    if (!prefix || prefix.length < 2) {
        return [];
    }

    const normalizedPrefix = prefix.toLowerCase().trim();
    const songs = getAllSongs();
    const suggestions = new Set();

    for (const song of songs) {
        if (suggestions.size >= limit) break;

        const title = song.title?.toLowerCase() || '';
        if (title.startsWith(normalizedPrefix)) {
            suggestions.add(song.title);
        }
    }

    return Array.from(suggestions).slice(0, limit);
}

/**
 * @experimental
 * Obtiene sugerencias de artistas basadas en prefijo
 * 
 * @param {string} prefix
 * @param {number} [limit=5]
 * @returns {string[]}
 */
export function getArtistSuggestions(prefix, limit = 5) {
    if (!prefix || prefix.length < 2) {
        return [];
    }

    const normalizedPrefix = prefix.toLowerCase().trim();
    const songs = getAllSongs();
    const artists = new Set();

    for (const song of songs) {
        if (artists.size >= limit) break;

        for (const artist of song.artistNames || []) {
            if (artist.toLowerCase().startsWith(normalizedPrefix)) {
                artists.add(artist);
            }
        }
    }

    return Array.from(artists).slice(0, limit);
}
