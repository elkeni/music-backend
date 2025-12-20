/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎯 MATCHING SCORE - FASE 4: SCORE DE MATCHING TÍTULO + ARTISTA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Calcula qué tan bien una canción coincide con la búsqueda del usuario.
 * 
 * REGLAS DE SCORE:
 * 
 * Título:
 * - Match exacto → +50
 * - Todos los tokens presentes → +40
 * - Match parcial → +25
 * 
 * Artista:
 * - Match exacto → +30
 * - Match parcial → +15
 * 
 * ⚠️ NO fuzzy matching
 * ⚠️ NO levenshtein
 * ⚠️ NO embeddings
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { getSearchTokens } from './search-context.js';

/**
 * @typedef {Object} MatchingBreakdown
 * @property {number} titleScore - Score del título (0-50)
 * @property {number} artistScore - Score del artista (0-30)
 * @property {string} titleMatch - Tipo de match del título
 * @property {string} artistMatch - Tipo de match del artista
 */

/**
 * Calcula el score de matching del título
 * 
 * @param {string} titleNormalized - Título normalizado de la canción
 * @param {string[]} searchTokens - Tokens de búsqueda (sin intención)
 * @param {string} normalizedQuery - Query normalizada completa
 * @returns {{ score: number, matchType: string }}
 */
function computeTitleScore(titleNormalized, searchTokens, normalizedQuery) {
    if (!titleNormalized || searchTokens.length === 0) {
        return { score: 0, matchType: 'none' };
    }

    // Match exacto: el título es igual a la query (sin tokens de intención)
    const queryWithoutIntent = searchTokens.join(' ');
    if (titleNormalized === queryWithoutIntent) {
        return { score: 50, matchType: 'exact' };
    }

    // Tokenizar título
    const titleTokens = titleNormalized.split(/\s+/).filter(t => t.length > 0);

    // Verificar si todos los tokens de búsqueda están en el título
    const allTokensPresent = searchTokens.every(token =>
        titleTokens.includes(token) || titleNormalized.includes(token)
    );

    if (allTokensPresent && searchTokens.length > 0) {
        return { score: 40, matchType: 'all_tokens' };
    }

    // Match parcial: al menos un token está presente
    const matchedTokens = searchTokens.filter(token =>
        titleTokens.includes(token) || titleNormalized.includes(token)
    );

    if (matchedTokens.length > 0) {
        // Escalar score según proporción de tokens matcheados
        const ratio = matchedTokens.length / searchTokens.length;
        const partialScore = Math.round(25 * ratio);
        return { score: Math.max(partialScore, 10), matchType: 'partial' };
    }

    return { score: 0, matchType: 'none' };
}

/**
 * Calcula el score de matching del artista
 * 
 * @param {string[]} artistNormalized - Artistas normalizados
 * @param {string[]} searchTokens - Tokens de búsqueda
 * @param {string} normalizedQuery - Query normalizada completa
 * @returns {{ score: number, matchType: string }}
 */
function computeArtistScore(artistNormalized, searchTokens, normalizedQuery) {
    if (!artistNormalized || artistNormalized.length === 0 || searchTokens.length === 0) {
        return { score: 0, matchType: 'none' };
    }

    // Unir todos los artistas en un string
    const artistsJoined = artistNormalized.join(' ');
    const artistTokens = artistsJoined.split(/\s+/).filter(t => t.length > 0);

    // Match exacto: algún artista coincide exactamente con parte de la query
    for (const artist of artistNormalized) {
        if (normalizedQuery.includes(artist) && artist.length > 2) {
            return { score: 30, matchType: 'exact' };
        }
    }

    // Match parcial: algún token de búsqueda está en los artistas
    const matchedTokens = searchTokens.filter(token =>
        artistTokens.includes(token) || artistsJoined.includes(token)
    );

    if (matchedTokens.length > 0) {
        return { score: 15, matchType: 'partial' };
    }

    return { score: 0, matchType: 'none' };
}

/**
 * Calcula el score de matching entre una canción y un contexto de búsqueda
 * 
 * @param {import('../identity/build-identity.js').SongIdentity} songIdentity - Identidad de la canción
 * @param {import('./search-context.js').SearchContext} searchContext - Contexto de búsqueda
 * @returns {{ score: number, breakdown: MatchingBreakdown }}
 */
export function computeMatchingScore(songIdentity, searchContext) {
    if (!songIdentity || !searchContext) {
        return {
            score: 0,
            breakdown: {
                titleScore: 0,
                artistScore: 0,
                titleMatch: 'error',
                artistMatch: 'error'
            }
        };
    }

    // Obtener tokens de búsqueda (sin tokens de intención)
    const searchTokens = getSearchTokens(searchContext);

    // Calcular scores
    const titleResult = computeTitleScore(
        songIdentity.titleNormalized,
        searchTokens,
        searchContext.normalizedQuery
    );

    const artistResult = computeArtistScore(
        songIdentity.artistNormalized,
        searchTokens,
        searchContext.normalizedQuery
    );

    const totalScore = titleResult.score + artistResult.score;

    return {
        score: totalScore,
        breakdown: {
            titleScore: titleResult.score,
            artistScore: artistResult.score,
            titleMatch: titleResult.matchType,
            artistMatch: artistResult.matchType
        }
    };
}
