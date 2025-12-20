/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 SONG MODEL - FASE 1: MODELO DE DATOS UNIFICADO
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Este archivo define el modelo de datos Song que sirve como base obligatoria
 * para todas las fases posteriores del buscador de canciones.
 * 
 * PROPÓSITO:
 * - Representar una canción específica (no ambigua)
 * - Diferenciar versiones (original, remix, remaster, live, etc.)
 * - Almacenar metadatos multi-criterio (álbum, fecha, duración)
 * - Ser indexable y extensible
 * 
 * REGLAS ESTRICTAS:
 * - title NO debe limpiarse ni normalizarse
 * - versionType DEBE obtenerse usando detectValidVersion() existente
 * - No mezclar artistas con grupo: si es banda → groupName, si son feats → artistNames[]
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * @typedef {'original' | 'remix' | 'remaster' | 'radio_edit' | 'extended' | 'album_version' | 'live'} VersionType
 * 
 * Tipos de versión válidos:
 * - original: Versión original de estudio
 * - remix: Remix oficial (solo si autoridad es válida)
 * - remaster: Versión remasterizada
 * - radio_edit: Edición para radio (más corta)
 * - extended: Versión extendida
 * - album_version: Versión de álbum/single específica
 * - live: Versión en vivo (marcada para clasificación, se filtra en fases posteriores)
 */

/**
 * @typedef {'youtube' | 'deezer' | 'saavn'} SourceType
 * 
 * Fuentes de datos soportadas:
 * - youtube: Resultados de YouTube via youtube-search
 * - deezer: Metadatos de Deezer API via deezer-proxy
 * - saavn: Futura integración con Saavn
 */

/**
 * @typedef {Object} SongMetadata
 * Metadatos libres (JSON) que pueden variar según la fuente:
 * - YouTube: channelId, channelTitle, thumbnails, description, viewCount
 * - Deezer: disk_number, track_position, explicit_lyrics, bpm, contributors
 * - Saavn: language, year, 320kbps, downloadUrl
 * 
 * Este campo es extensible y no tiene estructura fija.
 */

/**
 * @typedef {Object} Song
 * @property {string} id - Identificador único (YouTube ID, Deezer ID o hash estable)
 * @property {string} title - Título original SIN normalizar
 * @property {string[]} artistNames - Artistas principales (array)
 * @property {string} [groupName] - Banda o dúo si aplica (opcional)
 * @property {string} [album] - Álbum o EP oficial (opcional)
 * @property {string} [releaseDate] - Fecha de lanzamiento YYYY-MM-DD (ISO) (opcional)
 * @property {number} duration - Duración en segundos
 * @property {VersionType} versionType - Tipo de versión clasificada
 * @property {string} [versionDetails] - Año de remaster, nombre del remixer, etc. (opcional)
 * @property {SourceType} source - Fuente de datos ('youtube' | 'deezer' | 'saavn')
 * @property {string} sourceId - ID original de la fuente
 * @property {SongMetadata} metadata - JSON libre (canal, descripción, thumbnails, etc.)
 */

/**
 * Tipos de versión válidos para el campo versionType
 * Mapeo directo con los valores de detectValidVersion() en youtube-search.js
 */
export const VERSION_TYPES = {
    ORIGINAL: 'original',
    REMIX: 'remix',
    REMASTER: 'remaster',
    RADIO_EDIT: 'radio_edit',
    EXTENDED: 'extended',
    ALBUM_VERSION: 'album_version',
    LIVE: 'live'
};

/**
 * Fuentes de datos soportadas
 */
export const SOURCE_TYPES = {
    YOUTUBE: 'youtube',
    DEEZER: 'deezer',
    SAAVN: 'saavn'
};

/**
 * Crea un nuevo objeto Song con validación básica
 * 
 * @param {Object} params - Parámetros del Song
 * @param {string} params.id - Identificador único
 * @param {string} params.title - Título original SIN normalizar
 * @param {string[]} params.artistNames - Array de artistas principales
 * @param {string} [params.groupName] - Banda o dúo (opcional)
 * @param {string} [params.album] - Álbum (opcional)
 * @param {string} [params.releaseDate] - Fecha YYYY-MM-DD (opcional)
 * @param {number} params.duration - Duración en segundos
 * @param {VersionType} params.versionType - Tipo de versión
 * @param {string} [params.versionDetails] - Detalles de versión (opcional)
 * @param {SourceType} params.source - Fuente de datos
 * @param {string} params.sourceId - ID original de la fuente
 * @param {Object} [params.metadata] - Metadatos adicionales (opcional)
 * @returns {Song} Objeto Song validado
 * @throws {Error} Si faltan campos obligatorios o tienen formatos inválidos
 */
export function createSong(params) {
    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDACIÓN DE CAMPOS OBLIGATORIOS
    // ═══════════════════════════════════════════════════════════════════════════

    if (!params.id || typeof params.id !== 'string') {
        throw new Error('Song.id es obligatorio y debe ser un string');
    }

    if (!params.title || typeof params.title !== 'string') {
        throw new Error('Song.title es obligatorio y debe ser un string');
    }

    if (!Array.isArray(params.artistNames) || params.artistNames.length === 0) {
        throw new Error('Song.artistNames es obligatorio y debe ser un array no vacío');
    }

    if (typeof params.duration !== 'number' || params.duration < 0) {
        throw new Error('Song.duration es obligatorio y debe ser un número >= 0');
    }

    if (!params.versionType || !Object.values(VERSION_TYPES).includes(params.versionType)) {
        throw new Error(`Song.versionType debe ser uno de: ${Object.values(VERSION_TYPES).join(', ')}`);
    }

    if (!params.source || !Object.values(SOURCE_TYPES).includes(params.source)) {
        throw new Error(`Song.source debe ser uno de: ${Object.values(SOURCE_TYPES).join(', ')}`);
    }

    if (!params.sourceId || typeof params.sourceId !== 'string') {
        throw new Error('Song.sourceId es obligatorio y debe ser un string');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDACIÓN DE CAMPOS OPCIONALES
    // ═══════════════════════════════════════════════════════════════════════════

    // Validar formato de fecha si viene (YYYY-MM-DD)
    if (params.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(params.releaseDate)) {
        console.warn(`Song.releaseDate "${params.releaseDate}" no tiene formato ISO (YYYY-MM-DD), se guardará undefined`);
        params.releaseDate = undefined;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCCIÓN DEL OBJETO SONG
    // ═══════════════════════════════════════════════════════════════════════════

    /** @type {Song} */
    const song = {
        // Campos obligatorios
        id: params.id,
        title: params.title,  // SIN normalizar - regla estricta
        artistNames: params.artistNames.filter(Boolean),  // Limpiar valores vacíos
        duration: params.duration,
        versionType: params.versionType,
        source: params.source,
        sourceId: params.sourceId,
        metadata: params.metadata || {}
    };

    // Campos opcionales (solo agregar si tienen valor)
    if (params.groupName && typeof params.groupName === 'string') {
        song.groupName = params.groupName;
    }

    if (params.album && typeof params.album === 'string') {
        song.album = params.album;
    }

    if (params.releaseDate) {
        song.releaseDate = params.releaseDate;
    }

    if (params.versionDetails && typeof params.versionDetails === 'string') {
        song.versionDetails = params.versionDetails;
    }

    return song;
}

/**
 * Valida si un objeto cumple con la estructura Song
 * Útil para validar datos externos antes de insertarlos
 * 
 * @param {any} obj - Objeto a validar
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSong(obj) {
    const errors = [];

    if (!obj || typeof obj !== 'object') {
        return { valid: false, errors: ['Input no es un objeto'] };
    }

    // Campos obligatorios
    if (!obj.id) errors.push('Falta id');
    if (!obj.title) errors.push('Falta title');
    if (!Array.isArray(obj.artistNames)) errors.push('artistNames no es un array');
    if (typeof obj.duration !== 'number') errors.push('duration no es un número');
    if (!obj.versionType) errors.push('Falta versionType');
    if (!obj.source) errors.push('Falta source');
    if (!obj.sourceId) errors.push('Falta sourceId');

    // Valores válidos
    if (obj.versionType && !Object.values(VERSION_TYPES).includes(obj.versionType)) {
        errors.push(`versionType "${obj.versionType}" no es válido`);
    }

    if (obj.source && !Object.values(SOURCE_TYPES).includes(obj.source)) {
        errors.push(`source "${obj.source}" no es válida`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
