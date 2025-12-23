/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔐 BUILD IDENTITY - FASE 2: CONSTRUCCIÓN DE IDENTIDAD CANÓNICA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Construye la identidad canónica de una canción.
 * 
 * La identidad permite:
 * - Comparar canciones sin depender de mayúsculas, acentos o ruido
 * - Diferenciar versiones reales (remix vs live vs original)
 * - Preparar tokens estables para matching futuro
 * 
 * FASE 2 NO FILTRA, NO RECHAZA, NO ORDENA
 * Solo normaliza, tokeniza y anota
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { normalizeText } from '../normalization/normalize-text.js';
import { cleanTitle } from '../normalization/clean-title.js';

/**
 * @typedef {Object} SongIdentity
 * @property {string} songId - ID de la canción original
 * @property {string} titleRaw - Título original sin modificar
 * @property {string} titleClean - Título limpio de ruido editorial
 * @property {string} titleIdentity - Título para identidad (sin contexto geográfico)
 * @property {string} titleNormalized - Título normalizado (minúsculas, sin acentos)
 * @property {string[]} artistRaw - Artistas originales
 * @property {string[]} artistNormalized - Artistas normalizados (sin vacíos)
 * @property {string} versionType - Tipo de versión (original, remix, etc.)
 * @property {number} durationBucket - Duración con ventana ±3s (múltiplos de 5s)
 * @property {string} identityKey - Clave determinística única
 */

/**
 * Patrones de contexto geográfico/fuente a eliminar para identidad
 * Estos NO definen la versión, solo el contexto de grabación
 * 
 * ELIMINAR:
 * - (live at ...), (at ...), (from ...)
 * - (recorded at ...), (en ...)
 * 
 * NO ELIMINAR (definen versión):
 * - remix, remaster, radio edit, extended, live (sin contexto)
 */
const GEOGRAPHIC_CONTEXT_PATTERNS = [
    // Live at/from/in específico
    /\(live\s+at\s+[^)]+\)/gi,
    /\(live\s+from\s+[^)]+\)/gi,
    /\(live\s+in\s+[^)]+\)/gi,
    /\[live\s+at\s+[^)\]]+\]/gi,
    /\[live\s+from\s+[^)\]]+\]/gi,
    /\[live\s+in\s+[^)\]]+\]/gi,

    // At/From genérico (ubicación)
    /\(at\s+[^)]+\)/gi,
    /\(from\s+[^)]+\)/gi,
    /\[at\s+[^\]]+\]/gi,
    /\[from\s+[^\]]+\]/gi,

    // Recorded at
    /\(recorded\s+at\s+[^)]+\)/gi,
    /\[recorded\s+at\s+[^\]]+\]/gi,

    // Spanish equivalents
    /\(en\s+vivo\s+en\s+[^)]+\)/gi,
    /\(en\s+[^)]+\)/gi,
    /\[en\s+vivo\s+en\s+[^\]]+\]/gi,

    // Session/Performance at
    /\(session\s+at\s+[^)]+\)/gi,
    /\(performance\s+at\s+[^)]+\)/gi,
];

/**
 * Elimina contexto geográfico del título para identidad
 * Preserva información de versión (remix, remaster, live como tipo)
 * 
 * @param {string} title - Título limpio
 * @returns {string} - Título para identidad
 */
export function stripGeographicContext(title) {
    if (!title || typeof title !== 'string') {
        return '';
    }

    let result = title;

    // Aplicar cada patrón
    for (const pattern of GEOGRAPHIC_CONTEXT_PATTERNS) {
        result = result.replace(pattern, '');
    }

    // Limpiar espacios y guiones huérfanos
    result = result.replace(/\s+/g, ' ').trim();
    result = result.replace(/[-–—]\s*$/, '').trim();

    return result;
}

/**
 * Calcula el bucket de duración con ventana ±3 segundos
 * Garantiza que duraciones similares (±3s) caigan en el mismo bucket
 * 
 * Fórmula: Math.floor((duration + 2.5) / 5) * 5
 * 
 * Ejemplos:
 * - 247, 248, 249, 250, 251, 252 → bucket 250
 * - 243, 244, 245, 246 → bucket 245
 * 
 * @param {number} duration - Duración en segundos
 * @returns {number} - Duración redondeada (ventana ±3s)
 */
export function calculateDurationBucket(duration) {
    if (!duration || duration <= 0) {
        return 0;
    }
    // Redondear al múltiplo de 5 más cercano
    // Rango efectivo: ±2.5s por bucket
    // Ej: 248-252 → 250, 253-257 → 255
    return Math.round(duration / 5) * 5;
}

/**
 * Construye la clave de identidad determinística
 * 
 * Formato: titleNormalized|sortedArtists|versionType|durationBucket
 * 
 * @param {string} titleNormalized - Título normalizado (de titleIdentity)
 * @param {string[]} artistNormalized - Artistas normalizados
 * @param {string} versionType - Tipo de versión
 * @param {number} durationBucket - Bucket de duración
 * @returns {string} - Clave de identidad
 */
export function buildIdentityKey(titleNormalized, artistNormalized, versionType, durationBucket) {
    // Ordenar artistas alfabéticamente para consistencia
    const sortedArtists = [...artistNormalized].sort().join('|');

    // Construir clave
    return `${titleNormalized}|${sortedArtists}|${versionType}|${durationBucket}`;
}

/**
 * Construye la identidad canónica de una canción
 * 
 * @param {import('../song-model.js').Song} song - Canción del modelo
 * @returns {Readonly<SongIdentity>} - Identidad canónica (frozen)
 */
export function buildSongIdentity(song) {
    if (!song || !song.id) {
        throw new Error('buildSongIdentity requiere una canción válida con id');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TÍTULO
    // ═══════════════════════════════════════════════════════════════════════════

    const titleRaw = song.title || '';
    const titleClean = cleanTitle(titleRaw);

    // REPARACIÓN: titleIdentity elimina contexto geográfico
    const titleIdentity = stripGeographicContext(titleClean);

    // Normalizar el título de identidad (no el clean)
    const titleNormalized = normalizeText(titleIdentity);

    // ═══════════════════════════════════════════════════════════════════════════
    // ARTISTAS
    // ═══════════════════════════════════════════════════════════════════════════

    const artistRaw = song.artistNames || [];

    // REPARACIÓN: Filtrar strings vacíos y garantizar length >= 1
    let artistNormalized = artistRaw
        .map(artist => normalizeText(artist))
        .filter(artist => artist.length > 0);

    // Garantizar al menos un artista
    if (artistNormalized.length === 0) {
        artistNormalized = ['unknown'];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VERSIÓN Y DURACIÓN
    // ═══════════════════════════════════════════════════════════════════════════

    const versionType = song.versionType || 'original';

    // REPARACIÓN: Bucket con ventana ±3s
    const durationBucket = calculateDurationBucket(song.duration || 0);

    // ═══════════════════════════════════════════════════════════════════════════
    // CLAVE DE IDENTIDAD
    // ═══════════════════════════════════════════════════════════════════════════

    const identityKey = buildIdentityKey(
        titleNormalized,
        artistNormalized,
        versionType,
        durationBucket
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUIR Y CONGELAR IDENTIDAD
    // ═══════════════════════════════════════════════════════════════════════════

    /** @type {SongIdentity} */
    const identity = {
        songId: song.id,
        titleRaw,
        titleClean,
        titleIdentity,
        titleNormalized,
        artistRaw,
        artistNormalized,
        versionType,
        durationBucket,
        identityKey
    };

    // REPARACIÓN: Congelar identidad para inmutabilidad
    return Object.freeze(identity);
}
