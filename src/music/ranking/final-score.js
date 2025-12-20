/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏆 FINAL SCORE - FASE 4: CÁLCULO DE SCORE FINAL
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Pipeline de cálculo de score final:
 * 1. matchingScore (título + artista)
 * 2. intentAdjustment (live, remix, etc.)
 * 3. authorityWeight (modulador, SOLO si matchingScore >= 20)
 * 4. clamp a mínimo 0
 * 
 * REPARACIONES:
 * - Clamp final: score nunca es negativo
 * - Authority solo aplica si matchingScore >= 20
 * 
 * Genera breakdown explicable para cada paso.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { computeMatchingScore } from './matching-score.js';
import { applyIntentAdjustment } from './intent-adjustment.js';
import { applyAuthorityWeight } from './authority-weight.js';

/**
 * Umbral mínimo de matching para aplicar authority weight
 * Autoridad no puede rescatar resultados irrelevantes
 */
const MINIMUM_MATCHING_FOR_AUTHORITY = 20;

/**
 * @typedef {Object} ScoreBreakdown
 * @property {number} matchingScore - Score de matching (0-80)
 * @property {Object} matchingDetails - Detalles de matching
 * @property {number} intentAdjustment - Ajuste por intención
 * @property {Object} intentDetails - Detalles de intención
 * @property {number} authorityAdjustment - Ajuste por autoridad (0 si no aplicó)
 * @property {boolean} authorityApplied - Si se aplicó el ajuste de autoridad
 * @property {number} rawScore - Score antes del clamp
 * @property {number} finalScore - Score final (clamped a >= 0)
 */

/**
 * @typedef {Object} FinalScoreResult
 * @property {number} finalScore - Score final calculado
 * @property {ScoreBreakdown} breakdown - Detalles del cálculo
 */

/**
 * Calcula el score final de una canción para una búsqueda
 * 
 * PIPELINE:
 * 1. Matching score (título + artista) → 0-80
 * 2. Intent adjustment → ±20 por intención
 * 3. Authority weight → ±15 (SOLO si matchingScore >= 20)
 * 4. Clamp → Math.max(score, 0)
 * 
 * @param {import('../song-model.js').Song} song - Canción
 * @param {import('../identity/build-identity.js').SongIdentity} songIdentity - Identidad de la canción
 * @param {import('../authority/source-authority.js').SourceAuthority | null} authority - Autoridad de la fuente
 * @param {import('./search-context.js').SearchContext} searchContext - Contexto de búsqueda
 * @returns {FinalScoreResult}
 */
export function computeFinalScore(song, songIdentity, authority, searchContext) {
    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1: MATCHING SCORE
    // ═══════════════════════════════════════════════════════════════════════════

    const matchingResult = computeMatchingScore(songIdentity, searchContext);
    const matchingScore = matchingResult.score;

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2: INTENT ADJUSTMENT
    // ═══════════════════════════════════════════════════════════════════════════

    const intentResult = applyIntentAdjustment(matchingScore, song, searchContext);
    const afterIntent = intentResult.adjustedScore;

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 3: AUTHORITY WEIGHT
    // REPARACIÓN 4: Solo aplicar si matchingScore >= MINIMUM_MATCHING_FOR_AUTHORITY
    // Autoridad no puede rescatar resultados irrelevantes
    // ═══════════════════════════════════════════════════════════════════════════

    let authorityAdjustment = 0;
    let authorityApplied = false;
    let afterAuthority = afterIntent;

    if (matchingScore >= MINIMUM_MATCHING_FOR_AUTHORITY) {
        const authorityResult = applyAuthorityWeight(afterIntent, authority);
        authorityAdjustment = authorityResult.authorityAdjustment;
        afterAuthority = authorityResult.weightedScore;
        authorityApplied = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 4: CLAMP FINAL
    // REPARACIÓN 1: Score final NO puede ser negativo
    // ═══════════════════════════════════════════════════════════════════════════

    const rawScore = afterAuthority;
    const finalScore = Math.max(rawScore, 0);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUIR BREAKDOWN
    // ═══════════════════════════════════════════════════════════════════════════

    /** @type {ScoreBreakdown} */
    const breakdown = {
        matchingScore,
        matchingDetails: matchingResult.breakdown,
        intentAdjustment: intentResult.breakdown.totalAdjustment,
        intentDetails: intentResult.breakdown,
        authorityAdjustment,
        authorityApplied,
        rawScore,
        finalScore
    };

    return {
        finalScore,
        breakdown: Object.freeze(breakdown)
    };
}

/**
 * Calcula scores finales para múltiples canciones
 * 
 * @param {Array<{song: Song, identity: SongIdentity, authority: SourceAuthority}>} items
 * @param {import('./search-context.js').SearchContext} searchContext
 * @returns {Array<{song: Song, finalScore: number, breakdown: ScoreBreakdown}>}
 */
export function computeAllFinalScores(items, searchContext) {
    return items.map(item => {
        const result = computeFinalScore(
            item.song,
            item.identity,
            item.authority,
            searchContext
        );

        return {
            song: item.song,
            finalScore: result.finalScore,
            breakdown: result.breakdown
        };
    });
}
