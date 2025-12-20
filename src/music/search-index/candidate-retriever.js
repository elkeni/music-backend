/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎯 CANDIDATE RETRIEVER - FASE 6: RECUPERACIÓN DE CANDIDATOS
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Usa Meilisearch para obtener candidatos de búsqueda rápidamente.
 * NO rankea, solo recupera IDs candidatos para pasar al ranking de FASE 4.
 * 
 * ⚠️ NO modificar lógica de ranking
 * ⚠️ Solo recuperar candidatos
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { getSongsIndex, isMeiliEnabled } from './meili-client.js';
import { getSearchTokens } from '../ranking/search-context.js';

/**
 * Límite por defecto de candidatos a recuperar
 */
const DEFAULT_CANDIDATE_LIMIT = 200;

/**
 * Obtiene IDs de canciones candidatas usando Meilisearch
 * 
 * @param {import('../ranking/search-context.js').SearchContext} searchContext
 * @param {number} [limit=200] - Máximo de candidatos
 * @returns {Promise<string[]>} - Array de songIds
 */
export async function getCandidateSongIds(searchContext, limit = DEFAULT_CANDIDATE_LIMIT) {
    if (!isMeiliEnabled()) {
        // Fallback: retornar array vacío, el caller usará getAllSongs
        return [];
    }

    const index = getSongsIndex();
    if (!index) {
        return [];
    }

    try {
        // Construir query para Meilisearch
        const queryTokens = getSearchTokens(searchContext);
        const queryString = queryTokens.join(' ') || searchContext.normalizedQuery;

        // Construir filtros opcionales basados en intención
        const filters = buildFiltersFromIntent(searchContext.intent);

        // Ejecutar búsqueda
        const searchResult = await index.search(queryString, {
            limit,
            attributesToRetrieve: ['songId'],
            filter: filters.length > 0 ? filters : undefined
        });

        // Extraer solo los IDs
        const songIds = searchResult.hits.map(hit => hit.songId);

        return songIds;
    } catch (error) {
        console.error('[candidate-retriever] Error buscando candidatos:', error.message);
        return [];
    }
}

/**
 * Construye filtros de Meilisearch basados en la intención del usuario
 * 
 * Solo aplica filtros cuando tiene sentido para reducir candidatos,
 * sin eliminar resultados que el ranking debería manejar.
 * 
 * @param {import('../ranking/search-context.js').SearchIntent} intent
 * @returns {string[]}
 */
function buildFiltersFromIntent(intent) {
    const filters = [];

    // Solo filtrar por versionType si la intención es muy específica
    // y queremos priorizar mucho esos resultados
    // ⚠️ NO filtrar agresivamente - el ranking se encarga de priorizar

    // Para live y remix, podemos incluir un filtro OR para ampliar resultados
    // pero no excluir otros
    // NOTA: Por ahora no filtramos para mantener compatibilidad con FASE 5

    return filters;
}

/**
 * Búsqueda directa sin intención (para testing)
 * 
 * @param {string} query - Query de texto
 * @param {number} [limit=200]
 * @returns {Promise<string[]>}
 */
export async function searchCandidatesByQuery(query, limit = DEFAULT_CANDIDATE_LIMIT) {
    if (!isMeiliEnabled()) {
        return [];
    }

    const index = getSongsIndex();
    if (!index) {
        return [];
    }

    try {
        const searchResult = await index.search(query, {
            limit,
            attributesToRetrieve: ['songId']
        });

        return searchResult.hits.map(hit => hit.songId);
    } catch (error) {
        console.error('[candidate-retriever] Error en búsqueda directa:', error.message);
        return [];
    }
}

/**
 * Verifica si el retriever está disponible
 * 
 * @returns {boolean}
 */
export function isCandidateRetrieverAvailable() {
    return isMeiliEnabled() && getSongsIndex() !== null;
}
