/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧹 CLEAN TITLE - FASE 2: LIMPIEZA EDITORIAL DEL TÍTULO
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Elimina SOLO ruido editorial del título.
 * 
 * ELIMINAR:
 * - (official video), (official audio), (official)
 * - (lyrics), (lyric video)
 * - [HD], [4K], [1080p], (HQ)
 * - (video oficial), (audio oficial)
 * - (audio), (video)
 * - (explicit), (clean version)
 * - (from "movie/album")
 * 
 * NO ELIMINAR (definen versiones):
 * - remix
 * - remaster
 * - radio edit
 * - extended
 * - live
 * - album version
 * - acoustic
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Patrones de ruido editorial a eliminar
 * Estos NO afectan la identidad de la canción
 */
const EDITORIAL_NOISE_PATTERNS = [
    // Official markers
    /[\[\(]official\s*(music\s*)?video[\]\)]/gi,
    /[\[\(]official\s*audio[\]\)]/gi,
    /[\[\(]official[\]\)]/gi,

    // Spanish equivalents
    /[\[\(]video\s*oficial[\]\)]/gi,
    /[\[\(]audio\s*oficial[\]\)]/gi,
    /[\[\(]oficial[\]\)]/gi,

    // Lyrics markers
    /[\[\(]lyrics?\s*(video)?[\]\)]/gi,
    /[\[\(]lyric\s*video[\]\)]/gi,
    /[\[\(]con\s*letra[\]\)]/gi,

    // Quality markers
    /[\[\(]hd[\]\)]/gi,
    /[\[\(]hq[\]\)]/gi,
    /[\[\(]4k[\]\)]/gi,
    /[\[\(]1080p?[\]\)]/gi,
    /[\[\(]720p?[\]\)]/gi,

    // Audio/Video generic
    /[\[\(]audio[\]\)]/gi,
    /[\[\(]video[\]\)]/gi,
    /[\[\(]videoclip[\]\)]/gi,

    // Explicit/Clean markers
    /[\[\(]explicit[\]\)]/gi,
    /[\[\(]clean(\s*version)?[\]\)]/gi,

    // Soundtrack/From markers
    /[\[\(]from\s+["'][^"']+["'][\]\)]/gi,
    /[\[\(]from\s+[^)\]]+[\]\)]/gi,

    // Premiere/New markers
    /[\[\(]premiere[\]\)]/gi,
    /[\[\(]new\s*\d*[\]\)]/gi,

    // Year markers alone (not part of remaster)
    /[\[\(]\d{4}[\]\)]$/gi
];

/**
 * Limpia ruido editorial del título
 * Preserva información de versión (remix, remaster, live, etc.)
 * 
 * @param {string} title - Título original
 * @returns {string} Título limpio de ruido editorial
 */
export function cleanTitle(title) {
    if (!title || typeof title !== 'string') {
        return '';
    }

    let result = title;

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX: Normalizar apóstrofes y comillas especiales
    // 'Beto's Horns' (Unicode) → 'Beto's Horns' (ASCII)
    // ═══════════════════════════════════════════════════════════════════════════
    result = result
        .replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, "'") // Apóstrofes Unicode y acentos agudos usados como tal
        .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"');      // Comillas Unicode

    // Aplicar cada patrón de limpieza
    for (const pattern of EDITORIAL_NOISE_PATTERNS) {
        result = result.replace(pattern, '');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 4: EXCEPCIONES SEMÁNTICAS
    // Estos paréntesis SON parte del título real, no ruido editorial.
    // Los normalizamos sin paréntesis para comparación más limpia.
    // ═══════════════════════════════════════════════════════════════════════════
    const SEMANTIC_SUBTITLE_PATTERNS = [
        /\s*\(for a film\)/gi,
        /\s*\(from the motion picture[^)]*\)/gi,
        /\s*\(original motion picture soundtrack\)/gi,
        /\s*\(from "[^"]+"\)/gi,
        /\s*\(feat\.\s*[^)]+\)/gi,   // Keep feats but maybe normalize elsewhere
        /\s*\(ft\.\s*[^)]+\)/gi,
    ];

    for (const pattern of SEMANTIC_SUBTITLE_PATTERNS) {
        result = result.replace(pattern, '');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX 5: UNPARENTHESIZED FEATS (YouTube Standard)
    // "Song Name feat. Artist" -> "Song Name"
    // "Song Name ft. Artist" -> "Song Name"
    // Must be at end of string or before other separators
    // ═══════════════════════════════════════════════════════════════════════════
    const UNPARENTHESIZED_FEAT_PATTERNS = [
        /\s+feat\.\s+.*$/i,
        /\s+ft\.\s+.*$/i,
        /\s+featuring\s+.*$/i,
        /\s+with\s+.*$/i
    ];

    for (const pattern of UNPARENTHESIZED_FEAT_PATTERNS) {
        result = result.replace(pattern, '');
    }

    // Colapsar múltiples espacios y trim
    result = result.replace(/\s+/g, ' ').trim();

    // Eliminar guiones o puntuación al final si quedaron huérfanos
    result = result.replace(/[-–—:]\s*$/, '').trim();

    return result;
}
