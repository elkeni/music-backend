/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚫 DETECT NON-OFFICIAL - FASE 3: DETECCIÓN DE CONTENIDO NO OFICIAL
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Detecta y MARCA (no elimina) contenido no oficial:
 * - Covers
 * - Karaoke
 * - Instrumental
 * - Tribute
 * - 8D Audio
 * - Nightcore
 * - Slowed/Reverb
 * - Sped up
 * - Chipmunk
 * 
 * REGLAS:
 * - NO eliminar la canción
 * - SOLO marcar
 * - No usar NLP
 * - No usar scoring
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Patrones que indican contenido NO OFICIAL
 * Cada patrón tiene una razón descriptiva
 */
const NON_OFFICIAL_PATTERNS = [
    { pattern: /\bcover\b/i, reason: 'cover' },
    { pattern: /\bkaraoke\b/i, reason: 'karaoke' },
    { pattern: /\binstrumental\b/i, reason: 'instrumental' },
    { pattern: /\btribute\b/i, reason: 'tribute' },
    { pattern: /\b8d\s*(audio)?\b/i, reason: '8d_audio' },
    { pattern: /\bnightcore\b/i, reason: 'nightcore' },
    { pattern: /\bslowed\b/i, reason: 'slowed' },
    { pattern: /\breverb\b/i, reason: 'reverb' },
    { pattern: /\bsped\s*up\b/i, reason: 'sped_up' },
    { pattern: /\bchipmunk\b/i, reason: 'chipmunk' },
    { pattern: /\bspeed\s*up\b/i, reason: 'speed_up' },
    { pattern: /\bbass\s*boost(ed)?\b/i, reason: 'bass_boosted' },
    { pattern: /\bremake\b/i, reason: 'remake' },
    { pattern: /\bbootleg\b/i, reason: 'bootleg' },
    { pattern: /\bunofficial\b/i, reason: 'unofficial' },
    { pattern: /\bfan\s*made\b/i, reason: 'fan_made' },
    { pattern: /\blyric\s*video\s*by\b/i, reason: 'fan_lyric_video' },
];

/**
 * @typedef {Object} NonOfficialResult
 * @property {boolean} isNonOfficial - true si el contenido es no oficial
 * @property {string} [reason] - Razón de la clasificación
 */

/**
 * Detecta si una canción es contenido no oficial
 * 
 * @param {import('../song-model.js').Song} song - Canción a evaluar
 * @returns {NonOfficialResult}
 */
export function detectNonOfficial(song) {
    if (!song) {
        return { isNonOfficial: false };
    }

    // Campos a evaluar
    const title = song.title || '';
    const channelTitle = song.metadata?.channelTitle || '';
    const description = song.metadata?.description || '';

    // Texto combinado para búsqueda
    const searchText = `${title} ${channelTitle}`;

    // Buscar patrones
    for (const { pattern, reason } of NON_OFFICIAL_PATTERNS) {
        if (pattern.test(searchText)) {
            return {
                isNonOfficial: true,
                reason
            };
        }
    }

    return { isNonOfficial: false };
}

/**
 * Detecta si el canal indica contenido no oficial
 * 
 * @param {string} channelTitle - Nombre del canal
 * @returns {{ isNonOfficial: boolean, reason?: string }}
 */
export function detectNonOfficialChannel(channelTitle) {
    if (!channelTitle) {
        return { isNonOfficial: false };
    }

    const lowerChannel = channelTitle.toLowerCase();

    // Patrones de canales no oficiales
    const channelPatterns = [
        { test: /\bcover\b/, reason: 'cover_channel' },
        { test: /\bkaraoke\b/, reason: 'karaoke_channel' },
        { test: /\btribute\b/, reason: 'tribute_channel' },
        { test: /\bfan\b/, reason: 'fan_channel' },
        { test: /\bnightcore\b/, reason: 'nightcore_channel' },
        { test: /\b8d\b/, reason: '8d_channel' },
    ];

    for (const { test, reason } of channelPatterns) {
        if (test.test(lowerChannel)) {
            return { isNonOfficial: true, reason };
        }
    }

    return { isNonOfficial: false };
}

/**
 * Evaluación completa de no oficialidad
 * Combina título y canal
 * 
 * @param {import('../song-model.js').Song} song
 * @returns {NonOfficialResult}
 */
export function evaluateNonOfficial(song) {
    // Primero verificar título
    const titleResult = detectNonOfficial(song);
    if (titleResult.isNonOfficial) {
        return titleResult;
    }

    // Luego verificar canal
    const channelResult = detectNonOfficialChannel(song.metadata?.channelTitle || '');
    if (channelResult.isNonOfficial) {
        return channelResult;
    }

    return { isNonOfficial: false };
}
