/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚖️ AUTHORITY WEIGHT - FASE 4: AUTORIDAD COMO MODULADOR
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Usa la autoridad como modulador del score, NO como decisor.
 * 
 * REGLAS:
 * - authority.score ∈ [0-100]
 * - Peso máximo = ±15
 * - Fórmula: score + ((authority.score - 50) / 50) * 15
 * 
 * ⚠️ Autoridad NO puede decidir sola
 * ⚠️ Solo ajusta
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Aplica el peso de autoridad al score
 * 
 * @param {number} score - Score actual (después de matching e intent)
 * @param {import('../authority/source-authority.js').SourceAuthority | null} authority - Autoridad de la fuente
 * @returns {{ weightedScore: number, authorityAdjustment: number }}
 */
export function applyAuthorityWeight(score, authority) {
    if (!authority) {
        return {
            weightedScore: score,
            authorityAdjustment: 0
        };
    }

    // Fórmula: ((authority.score - 50) / 50) * 15
    // - authority = 100 → +15
    // - authority = 50 → 0
    // - authority = 0 → -15

    const authorityScore = authority.score ?? 50;
    const adjustment = ((authorityScore - 50) / 50) * 15;

    // Redondear a un decimal
    const roundedAdjustment = Math.round(adjustment * 10) / 10;

    return {
        weightedScore: score + roundedAdjustment,
        authorityAdjustment: roundedAdjustment
    };
}

/**
 * Calcula el ajuste de autoridad sin aplicarlo
 * Útil para breakdown
 * 
 * @param {import('../authority/source-authority.js').SourceAuthority | null} authority
 * @returns {number}
 */
export function calculateAuthorityAdjustment(authority) {
    if (!authority) {
        return 0;
    }

    const authorityScore = authority.score ?? 50;
    const adjustment = ((authorityScore - 50) / 50) * 15;

    return Math.round(adjustment * 10) / 10;
}
