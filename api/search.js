/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌐 SEARCH API - FASE 5: ENDPOINT HTTP DE BÚSQUEDA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Endpoint: GET /api/search
 * 
 * Query params:
 * - q: string (obligatorio) - Query de búsqueda
 * - limit: number (default 20) - Máximo de resultados
 * - offset: number (default 0) - Offset para paginación
 * - grouped: boolean (default true) - Agrupar por identityKey
 * - debug: boolean (default false) - Incluir info debug
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const config = { runtime: 'nodejs' };

import { searchSongs } from '../src/music/api/search-service.js';

export default async function handler(req, res) {
    const { q, debug } = req.query;
    const result = await searchSongs(q, { debug: debug === 'true' });
    res.status(200).json(result);
}

/**
 * Parsea un parámetro booleano de query string
 * 
 * @param {string | undefined} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
function parseBoolean(value, defaultValue) {
    if (value === undefined || value === null) return defaultValue;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return defaultValue;
}

/**
 * Parsea un parámetro numérico de query string
 * 
 * @param {string | undefined} value
 * @param {number} defaultValue
 * @returns {number}
 */
function parseNumber(value, defaultValue) {
    if (value === undefined || value === null) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Handler principal de búsqueda
 * Compatible con Vercel serverless functions
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export default async function handler(req, res) {
    // Solo permitir GET
    if (req.method !== 'GET') {
        return res.status(405).json({
            error: 'Method not allowed',
            allowed: ['GET']
        });
    }

    try {
        // Extraer parámetros
        const query = req.query.q || '';
        const limit = parseNumber(req.query.limit, 20);
        const offset = parseNumber(req.query.offset, 0);
        const grouped = parseBoolean(req.query.grouped, true);
        const debug = parseBoolean(req.query.debug, false);

        // Validar query
        const validation = validateQuery(query);
        if (!validation.valid) {
            return res.status(400).json({
                error: validation.error,
                query
            });
        }

        // Ejecutar búsqueda (async en FASE 6)
        const result = await searchSongs(query, {
            limit,
            offset,
            grouped,
            debug
        });

        // Si hubo error interno, devolver 400
        if (result.error) {
            return res.status(400).json(result);
        }

        // Establecer headers de cache
        if (!debug) {
            // Permitir cache del cliente por 30s
            res.setHeader('Cache-Control', 'public, max-age=30');
        } else {
            // No cachear respuestas de debug
            res.setHeader('Cache-Control', 'no-store');
        }

        // Devolver resultado
        return res.status(200).json(result);

    } catch (error) {
        console.error('[search-api] Error:', error);

        return res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * Para uso con Express (alternativo a serverless)
 */
export function expressHandler(req, res) {
    return handler(req, res);
}
