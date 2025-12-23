/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔍 MEILISEARCH CLIENT - FASE 6: CLIENTE DE MEILISEARCH
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Configuración y conexión a Meilisearch para indexación de candidatos.
 * 
 * Variables de entorno:
 * - MEILI_URL (default: http://localhost:7700)
 * - MEILI_MASTER_KEY (opcional en desarrollo)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { MeiliSearch } from 'meilisearch';

/**
 * Nombre del índice de canciones
 */
export const SONGS_INDEX_NAME = 'songs';

/**
 * Cliente de Meilisearch
 * @type {MeiliSearch | null}
 */
let client = null;

/**
 * Flag para saber si Meili está habilitado
 */
let meiliEnabled = false;

/**
 * Inicializa el cliente de Meilisearch
 * 
 * @returns {Promise<boolean>}
 */
export async function initMeili() {
    if (client) {
        return true;
    }

    try {
        const host = process.env.MEILI_URL || 'http://localhost:7700';
        const apiKey = process.env.MEILI_MASTER_KEY || undefined;

        client = new MeiliSearch({ host, apiKey });

        // Test de conexión
        await client.health();

        meiliEnabled = true;
        console.log('[meili] Meilisearch conectado exitosamente');

        // Configurar índice si no existe
        await ensureIndexExists();

        return true;
    } catch (error) {
        console.warn('[meili] Meilisearch no disponible, usando fallback:', error.message);
        client = null;
        meiliEnabled = false;
        return false;
    }
}

/**
 * Asegura que el índice existe con la configuración correcta
 */
async function ensureIndexExists() {
    if (!client) return;

    try {
        // Crear índice si no existe
        await client.createIndex(SONGS_INDEX_NAME, { primaryKey: 'songId' });
    } catch (error) {
        // Ignorar error si ya existe
        if (!error.message?.includes('already exists')) {
            console.warn('[meili] Error creando índice:', error.message);
        }
    }

    // Configurar atributos del índice
    const index = client.index(SONGS_INDEX_NAME);

    try {
        await index.updateSettings({
            searchableAttributes: [
                'titleClean',
                'titleNormalized',
                'artistNormalized',
                'album'
            ],
            filterableAttributes: [
                'versionType',
                'durationBucket',
                'source',
                'identityKey'
            ],
            sortableAttributes: [],
            // REPARACIÓN FASE 6: typoTolerance activado (default)
            // Permitir flexibilidad mínima para errores de dedo
            typoTolerance: {
                enabled: true,
                minWordSizeForTypos: {
                    oneTypo: 5,
                    twoTypos: 9
                }
            }
        });

        console.log('[meili] Índice configurado correctamente');
    } catch (error) {
        console.warn('[meili] Error configurando índice:', error.message);
    }
}

/**
 * Obtiene el índice de canciones
 * 
 * @returns {import('meilisearch').Index | null}
 */
export function getSongsIndex() {
    if (!client) return null;
    return client.index(SONGS_INDEX_NAME);
}

/**
 * Obtiene el cliente de Meilisearch
 * 
 * @returns {MeiliSearch | null}
 */
export function getClient() {
    return client;
}

/**
 * Verifica si Meili está habilitado
 * 
 * @returns {boolean}
 */
export function isMeiliEnabled() {
    return meiliEnabled;
}

/**
 * Cierra la conexión (no es necesario para Meili HTTP, pero por consistencia)
 */
export function closeMeili() {
    client = null;
    meiliEnabled = false;
    console.log('[meili] Meilisearch desconectado');
}

/**
 * Obtiene estadísticas del índice
 * 
 * @returns {Promise<{numberOfDocuments: number, isIndexing: boolean} | null>}
 */
export async function getIndexStats() {
    if (!client) return null;

    const index = client.index(SONGS_INDEX_NAME);
    try {
        const stats = await index.getStats();
        return {
            numberOfDocuments: stats.numberOfDocuments,
            isIndexing: stats.isIndexing
        };
    } catch (error) {
        console.error(`[meili] Error obteniendo stats de "${SONGS_INDEX_NAME}":`, error.message);
        return null;
    }
}
