/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎛️ INTENT ADJUSTMENT - FASE 4: AJUSTE POR INTENCIÓN DEL USUARIO
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Ajusta el score base según la intención del usuario.
 * 
 * REGLAS (REPARADAS):
 * - wantsLive: live → +20, no live → -10
 * - wantsRemix: remix → +20, no remix → -10
 * - wantsInstrumental: instrumental → +20, no instrumental → -10
 * - wantsCover: cover → +20, no cover → 0 (NO penalizar originales)
 * 
 * REPARACIÓN 2: Evitar doble penalización de covers
 * - Si isNonOfficial === true y el intent NO es cover, NO penalizar adicionalmente
 * 
 * REPARACIÓN 3: Intent COVER = boost, NO castigo
 * - wantsCover && isCover → +20
 * - wantsCover && !isCover → 0 (no -10)
 * 
 * ⚠️ No penalizar si el intent NO está presente
 * ⚠️ No eliminar canciones
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { evaluateNonOfficial } from '../authority/detect-non-official.js';

/**
 * @typedef {Object} IntentAdjustmentBreakdown
 * @property {number} liveAdjustment - Ajuste por intención live
 * @property {number} remixAdjustment - Ajuste por intención remix
 * @property {number} instrumentalAdjustment - Ajuste por intención instrumental
 * @property {number} coverAdjustment - Ajuste por intención cover
 * @property {number} totalAdjustment - Ajuste total
 */

/**
 * Detecta si una canción es instrumental basándose en el título
 * 
 * @param {import('../song-model.js').Song} song
 * @returns {boolean}
 */
function isInstrumental(song) {
    const title = (song.title || '').toLowerCase();
    return title.includes('instrumental') ||
        title.includes('karaoke') ||
        title.includes('backing track');
}

/**
 * Detecta si una canción es un cover
 * 
 * @param {import('../song-model.js').Song} song
 * @returns {boolean}
 */
function isCover(song) {
    const nonOfficial = evaluateNonOfficial(song);
    return nonOfficial.isNonOfficial && nonOfficial.reason === 'cover';
}

/**
 * Detecta si una canción es no oficial (cualquier razón)
 * 
 * @param {import('../song-model.js').Song} song
 * @returns {boolean}
 */
function isNonOfficialContent(song) {
    const nonOfficial = evaluateNonOfficial(song);
    return nonOfficial.isNonOfficial;
}

/**
 * Aplica ajuste por intención del usuario
 * 
 * REPARACIONES:
 * - Cover intent: solo boost (+20), no penalización (0 en vez de -10)
 * - No doble penalización: si ya es no oficial, no penalizar más por no ser live/remix
 * 
 * @param {number} baseScore - Score base (de matching)
 * @param {import('../song-model.js').Song} song - Canción
 * @param {import('./search-context.js').SearchContext} searchContext - Contexto de búsqueda
 * @returns {{ adjustedScore: number, breakdown: IntentAdjustmentBreakdown }}
 */
export function applyIntentAdjustment(baseScore, song, searchContext) {
    if (!song || !searchContext) {
        return {
            adjustedScore: baseScore,
            breakdown: {
                liveAdjustment: 0,
                remixAdjustment: 0,
                instrumentalAdjustment: 0,
                coverAdjustment: 0,
                totalAdjustment: 0
            }
        };
    }

    const intent = searchContext.intent;
    let totalAdjustment = 0;
    const breakdown = {
        liveAdjustment: 0,
        remixAdjustment: 0,
        instrumentalAdjustment: 0,
        coverAdjustment: 0,
        totalAdjustment: 0
    };

    // Detectar si la canción es no oficial (para evitar doble penalización)
    const songIsNonOfficial = isNonOfficialContent(song);

    // ═══════════════════════════════════════════════════════════════════════════
    // LIVE
    // ═══════════════════════════════════════════════════════════════════════════

    if (intent.wantsLive) {
        if (song.versionType === 'live') {
            breakdown.liveAdjustment = 20;
        } else {
            // REPARACIÓN: No penalizar canciones no oficiales adicionalmente
            // Ya fueron penalizadas en FASE 3 por autoridad
            breakdown.liveAdjustment = songIsNonOfficial ? 0 : -10;
        }
        totalAdjustment += breakdown.liveAdjustment;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REMIX
    // ═══════════════════════════════════════════════════════════════════════════

    if (intent.wantsRemix) {
        if (song.versionType === 'remix') {
            breakdown.remixAdjustment = 20;
        } else {
            // REPARACIÓN: No penalizar canciones no oficiales adicionalmente
            breakdown.remixAdjustment = songIsNonOfficial ? 0 : -10;
        }
        totalAdjustment += breakdown.remixAdjustment;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INSTRUMENTAL
    // ═══════════════════════════════════════════════════════════════════════════

    if (intent.wantsInstrumental) {
        if (isInstrumental(song)) {
            breakdown.instrumentalAdjustment = 20;
        } else {
            // REPARACIÓN: No penalizar canciones no oficiales adicionalmente
            breakdown.instrumentalAdjustment = songIsNonOfficial ? 0 : -10;
        }
        totalAdjustment += breakdown.instrumentalAdjustment;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COVER
    // REPARACIÓN 3: Solo boost, NO castigo
    // El usuario que busca cover no debe perder originales, solo priorizarlos
    // ═══════════════════════════════════════════════════════════════════════════

    if (intent.wantsCover) {
        if (isCover(song)) {
            breakdown.coverAdjustment = 20;
        } else {
            // REPARACIÓN: NO penalizar originales cuando se busca cover
            // Solo priorizamos covers, no castigamos originales
            breakdown.coverAdjustment = 0;
        }
        totalAdjustment += breakdown.coverAdjustment;
    }

    breakdown.totalAdjustment = totalAdjustment;

    return {
        adjustedScore: baseScore + totalAdjustment,
        breakdown
    };
}
