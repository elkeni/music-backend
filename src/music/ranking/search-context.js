/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔍 SEARCH CONTEXT - FASE 4: CONTEXTO DE BÚSQUEDA E INTENCIÓN
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Procesa la query del usuario y extrae la intención de búsqueda.
 * 
 * REGLAS:
 * - "live", "en vivo" → wantsLive
 * - "remix" → wantsRemix
 * - "instrumental" → wantsInstrumental
 * - "cover" → wantsCover
 * 
 * ⚠️ NO usar NLP
 * ⚠️ Solo matching directo de tokens normalizados
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { normalizeText } from '../normalization/normalize-text.js';

/**
 * @typedef {Object} SearchIntent
 * @property {boolean} wantsLive - Usuario busca versión live
 * @property {boolean} wantsRemix - Usuario busca remix
 * @property {boolean} wantsInstrumental - Usuario busca instrumental
 * @property {boolean} wantsCover - Usuario busca cover
 */

/**
 * @typedef {Object} SearchContext
 * @property {string} rawQuery - Query original
 * @property {string} normalizedQuery - Query normalizada
 * @property {string[]} tokens - Tokens normalizados
 * @property {SearchIntent} intent - Intención detectada
 */

/**
 * Patrones de intención (matching directo, sin NLP)
 */
const INTENT_PATTERNS = {
    live: [
        'live',
        'en vivo',
        'directo',
        'concierto',
        'concert',
        'unplugged',
        'acoustic live'
    ],
    remix: [
        'remix',
        'rmx',
        'mix',
        'bootleg',
        'edit'
    ],
    instrumental: [
        'instrumental',
        'karaoke',
        'sin voz',
        'without vocals',
        'backing track'
    ],
    cover: [
        'cover',
        'version',
        'tribute',
        'performed by'
    ]
};

/**
 * Detecta si algún patrón está presente en los tokens
 * 
 * @param {string[]} tokens - Tokens normalizados
 * @param {string} normalizedQuery - Query completa normalizada
 * @param {string[]} patterns - Patrones a buscar
 * @returns {boolean}
 */
function detectPattern(tokens, normalizedQuery, patterns) {
    // Buscar en tokens individuales
    for (const pattern of patterns) {
        const normalizedPattern = normalizeText(pattern);

        // Match exacto de token
        if (tokens.includes(normalizedPattern)) {
            return true;
        }

        // Match de frase en query completa
        if (normalizedQuery.includes(normalizedPattern)) {
            return true;
        }
    }

    return false;
}

/**
 * Construye el contexto de búsqueda a partir de una query
 * 
 * @param {string} query - Query del usuario
 * @returns {SearchContext}
 */
export function buildSearchContext(query) {
    const rawQuery = query || '';
    const normalizedQuery = normalizeText(rawQuery);

    // Tokenizar (dividir por espacios)
    const tokens = normalizedQuery
        .split(/\s+/)
        .filter(t => t.length > 0);

    // Detectar intención
    const intent = {
        wantsLive: detectPattern(tokens, normalizedQuery, INTENT_PATTERNS.live),
        wantsRemix: detectPattern(tokens, normalizedQuery, INTENT_PATTERNS.remix),
        wantsInstrumental: detectPattern(tokens, normalizedQuery, INTENT_PATTERNS.instrumental),
        wantsCover: detectPattern(tokens, normalizedQuery, INTENT_PATTERNS.cover)
    };

    return Object.freeze({
        rawQuery,
        normalizedQuery,
        tokens: Object.freeze(tokens),
        intent: Object.freeze(intent)
    });
}

/**
 * Extrae tokens de búsqueda sin los tokens de intención
 * Útil para matching de título/artista
 * 
 * @param {SearchContext} context
 * @returns {string[]}
 */
export function getSearchTokens(context) {
    // Tokens de intención a excluir del matching de título
    const intentTokens = new Set([
        'live', 'en', 'vivo', 'directo', 'concierto', 'concert', 'unplugged',
        'remix', 'rmx', 'mix', 'bootleg', 'edit',
        'instrumental', 'karaoke', 'sin', 'voz',
        'cover', 'version', 'tribute'
    ]);

    return context.tokens.filter(token => !intentTokens.has(token));
}

/**
 * Verifica si la búsqueda tiene alguna intención específica
 * 
 * @param {SearchContext} context
 * @returns {boolean}
 */
export function hasSpecificIntent(context) {
    return context.intent.wantsLive ||
        context.intent.wantsRemix ||
        context.intent.wantsInstrumental ||
        context.intent.wantsCover;
}
