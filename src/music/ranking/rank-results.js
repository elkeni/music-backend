/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📊 RANK RESULTS - FASE 4: ORDENAMIENTO FINAL
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Ordena resultados de búsqueda de forma determinística.
 * 
 * REGLAS:
 * - Orden descendente por finalScore
 * - Empate → canonicalSong primero
 * - Empate → Deezer primero
 * - Orden estable (determinístico)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { computeFinalScore } from './final-score.js';
import { getIdentity } from '../identity/identity-store.js';
import { getAuthority, isCanonical, isNonOfficial } from '../authority/authority-store.js';

/**
 * @typedef {Object} RankedResult
 * @property {import('../song-model.js').Song} song - Canción rankeada
 * @property {number} finalScore - Score final
 * @property {number} rank - Posición en el ranking (1-indexed)
 * @property {import('./final-score.js').ScoreBreakdown} breakdown - Detalles del score
 * @property {boolean} isCanonical - Si es la canción canónica del grupo
 * @property {boolean} isNonOfficial - Si es contenido no oficial
 */

/**
 * Prioridad de fuentes para desempate
 */
const SOURCE_PRIORITY = {
    'deezer': 1,
    'saavn': 2,
    'youtube': 3
};

/**
 * Ordena resultados de búsqueda
 * 
 * @param {import('../song-model.js').Song[]} songs - Canciones a rankear
 * @param {import('./search-context.js').SearchContext} searchContext - Contexto de búsqueda
 * @returns {RankedResult[]}
 */
export function rankResults(songs, searchContext) {
    if (!songs || songs.length === 0) {
        return [];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1: Calcular scores finales para todas las canciones
    // ═══════════════════════════════════════════════════════════════════════════

    const scoredResults = songs.map(song => {
        const identity = getIdentity(song.id);
        const authority = getAuthority(song.id);

        // Calcular score final
        const scoreResult = computeFinalScore(song, identity, authority, searchContext);

        // Determinar si es canónica
        const identityKey = identity?.identityKey || '';
        const songIsCanonical = isCanonical(song.id, identityKey);

        // Determinar si es no oficial
        const songIsNonOfficial = isNonOfficial(song.id);

        return {
            song,
            identity,
            authority,
            finalScore: scoreResult.finalScore,
            breakdown: scoreResult.breakdown,
            isCanonical: songIsCanonical,
            isNonOfficial: songIsNonOfficial
        };
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2: Ordenar resultados
    // ═══════════════════════════════════════════════════════════════════════════

    scoredResults.sort((a, b) => {
        // 1. Por score (descendente)
        const scoreDiff = b.finalScore - a.finalScore;
        if (Math.abs(scoreDiff) > 0.01) {
            return scoreDiff;
        }

        // 2. Empate: canonicalSong primero
        if (a.isCanonical && !b.isCanonical) return -1;
        if (!a.isCanonical && b.isCanonical) return 1;

        // 3. Empate: no oficial después
        if (!a.isNonOfficial && b.isNonOfficial) return -1;
        if (a.isNonOfficial && !b.isNonOfficial) return 1;

        // 4. Empate: prioridad de fuente
        const priorityA = SOURCE_PRIORITY[a.song.source] || 99;
        const priorityB = SOURCE_PRIORITY[b.song.source] || 99;
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        // 5. Empate final: por ID (determinismo)
        return a.song.id.localeCompare(b.song.id);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 3: Construir resultados rankeados
    // ═══════════════════════════════════════════════════════════════════════════

    /** @type {RankedResult[]} */
    const rankedResults = scoredResults.map((item, index) => ({
        song: item.song,
        finalScore: item.finalScore,
        rank: index + 1,
        breakdown: item.breakdown,
        isCanonical: item.isCanonical,
        isNonOfficial: item.isNonOfficial
    }));

    return rankedResults;
}

/**
 * Rankea resultados y agrupa por identityKey
 * Útil para mostrar resultados agrupados con alternativas
 * 
 * @param {import('../song-model.js').Song[]} songs
 * @param {import('./search-context.js').SearchContext} searchContext
 * @returns {Map<string, RankedResult[]>}
 */
export function rankAndGroupResults(songs, searchContext) {
    const ranked = rankResults(songs, searchContext);

    const grouped = new Map();

    for (const result of ranked) {
        const identity = getIdentity(result.song.id);
        const key = identity?.identityKey || result.song.id;

        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(result);
    }

    // Ordenar cada grupo internamente (ya deberían estar ordenados)
    for (const [key, results] of grouped) {
        results.sort((a, b) => a.rank - b.rank);
    }

    return grouped;
}

/**
 * Obtiene solo el top N resultados
 * 
 * @param {import('../song-model.js').Song[]} songs
 * @param {import('./search-context.js').SearchContext} searchContext
 * @param {number} limit
 * @returns {RankedResult[]}
 */
export function getTopResults(songs, searchContext, limit = 10) {
    const ranked = rankResults(songs, searchContext);
    return ranked.slice(0, limit);
}
