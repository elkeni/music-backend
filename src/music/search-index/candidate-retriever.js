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

import { getSongsIndex, isMeiliEnabled, SONGS_INDEX_NAME } from './meili-client.js';
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
 * @param {boolean} [debug=false] - Modo debug (bypass filtros si es necesario, logging extra)
 * @returns {Promise<string[]>} - Array de songIds
 */
export async function getCandidateSongIds(searchContext, limit = DEFAULT_CANDIDATE_LIMIT, debug = false) {
    // 👇 INIT LAZY: Asegurar inicialización aquí
    let meiliClient;
    try {
        meiliClient = await import('./meili-client.js');
        // Si no está inicializado, intentar iniciarlo ahora
        if (!meiliClient.isMeiliEnabled()) {
            await meiliClient.initMeili();
        }
    } catch (e) {
        console.warn('[candidate-retriever] Error importing meili-client', e);
        return [];
    }

    if (!meiliClient.isMeiliEnabled()) {
        if (debug) console.warn('[candidate-retriever] Meili disabled or failed init');
        return [];
    }

    const index = meiliClient.getSongsIndex();
    if (!index) {
        if (debug) console.warn('[candidate-retriever] Index not found');
        return [];
    }

    try {
        // Construir query para Meilisearch
        const queryTokens = getSearchTokens(searchContext);
        const queryString = queryTokens.join(' ') || searchContext.normalizedQuery;

        // Construir filtros opcionales basados en intención
        // ⚠️ IMPORTANTE: Si debug=true y queremos ver TODO, podríamos anular filtros
        const intentFilters = buildFiltersFromIntent(searchContext.intent);

        // Solo aplicar si hay filtros válidos
        const finalFilters = intentFilters.length > 0 ? intentFilters : undefined;

        if (debug) {
            console.log(`[meili-search] Index: "${SONGS_INDEX_NAME}" | Query: "${queryString}" | Filters:`, finalFilters || 'NONE');
        }

        // Ejecutar búsqueda
        const searchResult = await index.search(queryString, {
            limit,
            attributesToRetrieve: ['songId'],
            filter: finalFilters
        });

        // Extraer solo los IDs
        const songIds = searchResult.hits.map(hit => hit.songId);

        if (debug) {
            console.log(`[meili-search] Found ${songIds.length} candidates`);
            if (songIds.length === 0 && searchResult.hits.length === 0) {
                // Debug extendido: Intento sin filtros si falló
                try {
                    const stats = await index.getStats();
                    console.log(`[meili-debug] Index stats: ${stats.numberOfDocuments} docs total.`);
                    if (queryString) {
                        // Check de tokenización o typo
                        console.log(`[meili-debug] 0 results for "${queryString}". Typo tolerance is likely DISABLED.`);
                    }
                } catch (e) { }
            }
        }

        return songIds;
    } catch (error) {
        console.error(`[candidate-retriever] Error buscando candidatos en "${SONGS_INDEX_NAME}":`, error.message);
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

    if (!intent) return filters;

    // ⚠️ FILTROS CONDICIONALES
    // Solo deben agregarse si estamos 100% seguros que queremos excluir resultados.
    // En FASE 6, mejor traer más candidatos y que el ranking decida.

    // Ejemplo (comentado por seguridad):
    /*
    if (intent.isLive) {
         // Si el usuario busca "live", NO filtramos solo live, 
         // porque podría querer la versión de estudio también.
         // filters.push('versionType = "live"'); 
    }
    */

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
        console.error(`[candidate-retriever] Error en búsqueda directa "${SONGS_INDEX_NAME}":`, error.message);
        return [];
    }
}

/**
 * Verifica si el retriever está disponible
 * En serverless, verificamos la configuración, ya que la conexión es lazy.
 * 
 * @returns {boolean}
 */
export function isCandidateRetrieverAvailable() {
    // Si tenemos la URL, asumimos que está disponible y dejamos que initMeili conecte
    return !!process.env.MEILI_URL;
}
