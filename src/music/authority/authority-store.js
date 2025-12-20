/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 💾 AUTHORITY STORE - FASE 3: ALMACÉN DE AUTORIDAD Y SELECCIÓN CANÓNICA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Almacena resultados de FASE 3 en Maps paralelos.
 * NO modifica Song ni SongIdentity.
 * 
 * FUENTE DE VERDAD:
 * - cachedSelections = source of truth para selecciones canónicas
 * - authorityMap = solo guarda scores (calculados UNA VEZ)
 * - canonicalSelectionMap = alias directo a cachedSelections
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { buildCanonicalGroups, getGroupStats } from './canonical-groups.js';
import { evaluateSourceAuthority } from './source-authority.js';
import { evaluateNonOfficial } from './detect-non-official.js';
import { selectAllCanonicals } from './select-canonical.js';
import { getAllSongs } from '../song-store.js';

// ═══════════════════════════════════════════════════════════════════════════════
// STORES PARALELOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Almacena autoridad de fuente por songId
 * Calculada UNA VEZ en runPhase3Authority, nunca recalculada
 * @type {Map<string, import('./source-authority.js').SourceAuthority>}
 */
const authorityMap = new Map();

/**
 * Almacena detección de no oficial por songId
 * @type {Map<string, import('./detect-non-official.js').NonOfficialResult>}
 */
const nonOfficialMap = new Map();

/**
 * Cache de grupos canónicos (última ejecución)
 * @type {Map<string, import('./canonical-groups.js').CanonicalGroup> | null}
 */
let cachedGroups = null;

/**
 * SOURCE OF TRUTH: Selecciones canónicas
 * Contiene CanonicalSelection completo (no solo songId)
 * @type {Map<string, import('./select-canonical.js').CanonicalSelection> | null}
 */
let cachedSelections = null;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE ACCESO A AUTORIDAD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene la autoridad de una canción
 * 
 * @param {string} songId
 * @returns {import('./source-authority.js').SourceAuthority | null}
 */
export function getAuthority(songId) {
    return authorityMap.get(songId) || null;
}

/**
 * Verifica si hay autoridad calculada para una canción
 * 
 * @param {string} songId
 * @returns {boolean}
 */
export function hasAuthority(songId) {
    return authorityMap.has(songId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE ACCESO A SELECCIÓN CANÓNICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene la selección canónica completa para un identityKey
 * 
 * @param {string} identityKey
 * @returns {import('./select-canonical.js').CanonicalSelection | null}
 */
export function getCanonicalSelection(identityKey) {
    return cachedSelections?.get(identityKey) || null;
}

/**
 * Obtiene el songId canónico para un identityKey
 * Alias de conveniencia
 * 
 * @param {string} identityKey
 * @returns {string | null}
 */
export function getCanonicalSongId(identityKey) {
    const selection = cachedSelections?.get(identityKey);
    return selection?.canonicalSong?.id || null;
}

/**
 * Verifica si una canción es la canónica de su grupo
 * 
 * @param {string} songId
 * @param {string} identityKey
 * @returns {boolean}
 */
export function isCanonical(songId, identityKey) {
    const selection = cachedSelections?.get(identityKey);
    return selection?.canonicalSong?.id === songId;
}

/**
 * Obtiene las alternativas para un identityKey
 * 
 * @param {string} identityKey
 * @returns {import('../song-model.js').Song[] | null}
 */
export function getAlternatives(identityKey) {
    const selection = cachedSelections?.get(identityKey);
    return selection?.alternatives || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE ACCESO A NO OFICIAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene resultado de detección no oficial
 * 
 * @param {string} songId
 * @returns {import('./detect-non-official.js').NonOfficialResult | null}
 */
export function getNonOfficialStatus(songId) {
    return nonOfficialMap.get(songId) || null;
}

/**
 * Verifica si una canción está marcada como no oficial
 * 
 * @param {string} songId
 * @returns {boolean}
 */
export function isNonOfficial(songId) {
    const status = nonOfficialMap.get(songId);
    return status?.isNonOfficial || false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE ACCESO A CACHES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene grupos canónicos cacheados
 * 
 * @returns {Map<string, import('./canonical-groups.js').CanonicalGroup> | null}
 */
export function getCachedGroups() {
    return cachedGroups;
}

/**
 * Obtiene selecciones cacheadas (SOURCE OF TRUTH)
 * 
 * @returns {Map<string, import('./select-canonical.js').CanonicalSelection> | null}
 */
export function getCachedSelections() {
    return cachedSelections;
}

/**
 * Limpia todos los stores de FASE 3
 */
export function clearAuthorityStores() {
    authorityMap.clear();
    nonOfficialMap.clear();
    cachedGroups = null;
    cachedSelections = null;
    console.log('[authority-store] Stores limpiados');
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE REHIDRATACIÓN (FASE 6)
// Permiten reconstruir state desde DB sin recalcular
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rehidrata la autoridad de una canción desde DB
 * NO recalcula, solo restaura datos persistidos
 * 
 * @param {string} songId
 * @param {import('./source-authority.js').SourceAuthority} authority
 */
export function rehydrateAuthority(songId, authority) {
    if (!songId || !authority) return;

    // Congelar para consistencia con runPhase3Authority
    authorityMap.set(songId, Object.freeze({
        score: authority.score,
        level: authority.level,
        reasons: authority.reasons || []
    }));
}

/**
 * Rehidrata el estado no oficial de una canción desde DB
 * NO recalcula, solo restaura datos persistidos
 * 
 * @param {string} songId
 * @param {{ isNonOfficial: boolean, reason?: string }} nonOfficial
 */
export function rehydrateNonOfficial(songId, nonOfficial) {
    if (!songId || nonOfficial === undefined) return;

    nonOfficialMap.set(songId, Object.freeze({
        isNonOfficial: nonOfficial.isNonOfficial,
        reason: nonOfficial.reason || null
    }));
}

/**
 * Rehidrata una selección canónica desde DB
 * NO recalcula, solo restaura datos persistidos
 * 
 * @param {string} identityKey
 * @param {import('../song-model.js').Song} canonicalSong
 * @param {number} authorityScore
 * @param {import('../song-model.js').Song[]} alternatives
 */
export function rehydrateCanonicalSelection(identityKey, canonicalSong, authorityScore, alternatives) {
    if (!identityKey || !canonicalSong) return;

    // Inicializar cachedSelections si es null
    if (!cachedSelections) {
        cachedSelections = new Map();
    }

    cachedSelections.set(identityKey, Object.freeze({
        canonicalSong,
        authorityScore,
        alternatives: Object.freeze(alternatives || [])
    }));
}

/**
 * Obtiene conteo de autoridades rehidratadas
 * 
 * @returns {number}
 */
export function getAuthorityCount() {
    return authorityMap.size;
}

/**
 * Obtiene conteo de no oficiales
 * 
 * @returns {number}
 */
export function getNonOfficialCount() {
    return nonOfficialMap.size;
}

/**
 * Obtiene conteo de selecciones canónicas
 * 
 * @returns {number}
 */
export function getCanonicalSelectionsCount() {
    return cachedSelections?.size || 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE FASE 3
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ejecuta el pipeline completo de FASE 3
 * 
 * ORDEN:
 * 1. Calcular autoridad de TODAS las canciones (UNA VEZ)
 * 2. Detectar no oficiales
 * 3. Construir grupos canónicos
 * 4. Seleccionar canónicos usando authorityMap pre-calculado
 * 
 * @returns {{
 *   totalSongs: number,
 *   totalGroups: number,
 *   nonOfficialCount: number,
 *   canonicalsBySource: { deezer: number, youtube: number }
 * }}
 */
export function runPhase3Authority() {
    console.log('[phase-3] ════════════════════════════════════════════════════════');
    console.log('[phase-3] INICIANDO FASE 3: AUTORIDAD Y SELECCIÓN CANÓNICA');
    console.log('[phase-3] ════════════════════════════════════════════════════════');

    // Limpiar stores previos
    clearAuthorityStores();

    const songs = getAllSongs();

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1: Evaluar autoridad de cada canción (UNA SOLA VEZ)
    // Después de esto, authorityMap está CONGELADO
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('[phase-3] Paso 1: Calculando autoridad de fuentes (única vez)...');

    for (const song of songs) {
        // Calcular autoridad
        const authority = evaluateSourceAuthority(song);
        authorityMap.set(song.id, Object.freeze(authority));

        // Detectar no oficial
        const nonOfficial = evaluateNonOfficial(song);
        nonOfficialMap.set(song.id, Object.freeze(nonOfficial));
    }

    console.log(`[phase-3] Autoridades calculadas: ${authorityMap.size}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2: Construir grupos canónicos
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('[phase-3] Paso 2: Construyendo grupos canónicos...');

    cachedGroups = buildCanonicalGroups();

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 3: Seleccionar canónicos usando authorityMap pre-calculado
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('[phase-3] Paso 3: Seleccionando canciones canónicas...');

    // REPARACIÓN: Pasar authorityMap y nonOfficialMap a selectAllCanonicals
    cachedSelections = selectAllCanonicals(cachedGroups, authorityMap, nonOfficialMap);

    // ═══════════════════════════════════════════════════════════════════════════
    // ESTADÍSTICAS FINALES
    // ═══════════════════════════════════════════════════════════════════════════

    const nonOfficialCount = Array.from(nonOfficialMap.values())
        .filter(r => r.isNonOfficial).length;

    const canonicalsBySource = {
        deezer: 0,
        youtube: 0
    };

    for (const selection of cachedSelections.values()) {
        const source = selection.canonicalSong.source;
        if (source === 'deezer') canonicalsBySource.deezer++;
        else if (source === 'youtube') canonicalsBySource.youtube++;
    }

    const result = {
        totalSongs: songs.length,
        totalGroups: cachedGroups.size,
        nonOfficialCount,
        canonicalsBySource
    };

    console.log('[phase-3] ════════════════════════════════════════════════════════');
    console.log('[phase-3] FASE 3 COMPLETADA');
    console.log(`[phase-3] Total canciones: ${result.totalSongs}`);
    console.log(`[phase-3] Total grupos: ${result.totalGroups}`);
    console.log(`[phase-3] No oficiales detectados: ${result.nonOfficialCount}`);
    console.log(`[phase-3] Canónicos Deezer: ${result.canonicalsBySource.deezer}`);
    console.log(`[phase-3] Canónicos YouTube: ${result.canonicalsBySource.youtube}`);
    console.log('[phase-3] ════════════════════════════════════════════════════════');

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS para debugging
// ═══════════════════════════════════════════════════════════════════════════════

export const _authorityMap = authorityMap;
export const _nonOfficialMap = nonOfficialMap;

/**
 * @deprecated Use getCachedSelections() - canonicalSelectionMap es alias
 */
export const _canonicalSelectionMap = {
    get(identityKey) {
        return cachedSelections?.get(identityKey) || null;
    },
    has(identityKey) {
        return cachedSelections?.has(identityKey) || false;
    },
    get size() {
        return cachedSelections?.size || 0;
    }
};
