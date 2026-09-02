/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 YOUTUBE EXTRACTOR - MÓDULO CENTRAL DE EXTRACCIÓN
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Módulo compartido para extracción y validación de canciones.
 * Usado por: api/youtube-search.js, api/search.js, song-loader.js
 * 
 * REGLA DE ORO: Respetar la versión solicitada por el usuario
 * 
 * ✅ PERMITIDO: Original, live, acústica, instrumental y edits oficiales
 *                 cuando coinciden con la versión solicitada.
 * ❌ PROHIBIDO: Covers, karaoke, tributos y edits no oficiales.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { normalizeText, normalizeArtist } from '../normalization/normalize-text.js';
import { cleanTitle } from '../normalization/clean-title.js';
import { calculateStringSimilarity } from './string-similarity.js';

// ═══════════════════════════════════════════════════════════════════════════════
// VERSIONES PROHIBIDAS VS PERMITIDAS
// ═══════════════════════════════════════════════════════════════════════════════

// Versiones que causan RECHAZO INMEDIATO (no son de estudio)
export const FORBIDDEN_VERSIONS = [
    // Versiones alternativas
    'live', 'acoustic', 'unplugged', 'cover', 'karaoke',
    'instrumental', 'sped_up', 'slowed', 'nightcore', 'demo',
    'tribute', 'en_vivo', 'acustico',
    // Edits no oficiales
    'turreo_edit', 'rkt_edit', 'bootleg', 'mashup',
    'vip_edit', 'dj_edit', 'flip', 'rework'
];

// Versiones PERMITIDAS (son de estudio o ediciones oficiales)
export const ALLOWED_VERSIONS = ['remix', 'remaster', 'radio_edit', 'extended', 'original'];

/**
 * Detecta el tipo de versión de una canción
 * @param {string} title - Título de la canción
 * @returns {{ type: string, detail: string|null, isForbidden: boolean }}
 */
export function detectVersion(title) {
    if (!title) return { type: 'original', detail: null, isForbidden: false };

    const lower = title.toLowerCase();

    // ═══════════════════════════════════════════════════════════════════════════
    // VERSIONES PROHIBIDAS (rechazo inmediato)
    // ═══════════════════════════════════════════════════════════════════════════

    // Live
    if (/\blive\b/i.test(lower) && /\b(at|from|in|on|session)\b/i.test(lower)) {
        return { type: 'live', detail: 'live_venue', isForbidden: true };
    }
    if (/\b(live\s*version|live\s*performance|en\s*vivo|en\s*directo)\b/i.test(lower)
        || /(?:[\[(]\s*live\s*[\])]|\blive\s*$)/i.test(lower)) {
        return { type: 'live', detail: 'live_explicit', isForbidden: true };
    }

    // Acoustic / Unplugged
    if (/\b(acoustic|acustic[ao]?|unplugged|stripped)\b/i.test(lower)) {
        return { type: 'acoustic', detail: null, isForbidden: true };
    }

    // Cover
    if (/\bcover\b/i.test(lower)) {
        return { type: 'cover', detail: null, isForbidden: true };
    }
    if (/\b(tribute|homenaje|originally\s*by|performed\s*by|in\s*the\s*style\s*of)\b/i.test(lower)) {
        return { type: 'cover', detail: 'tribute', isForbidden: true };
    }

    // Karaoke y backing tracks nunca sustituyen a una grabación musical.
    if (/\b(karaoke|backing\s*track)\b/i.test(lower)) {
        return { type: 'karaoke', detail: null, isForbidden: true };
    }

    // Un instrumental sí es válido cuando fue solicitado explícitamente.
    if (/\binstrumental\b/i.test(lower)) {
        return { type: 'instrumental', detail: null, isForbidden: true };
    }

    // Sped up / Slowed / Nightcore
    if (/\b(sped\s*up|speed\s*up|nightcore)\b/i.test(lower)) {
        return { type: 'sped_up', detail: null, isForbidden: true };
    }
    if (/\b(slowed|slowed\s*[\+&]\s*reverb|8d\s*audio)\b/i.test(lower)) {
        return { type: 'slowed', detail: null, isForbidden: true };
    }

    // Demo
    if (/\bdemo\b/i.test(lower)) {
        return { type: 'demo', detail: null, isForbidden: true };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EDITS LATINOS / MODERNOS (Aceptados como Remix/Original)
    // ═══════════════════════════════════════════════════════════════════════════

    // Turreo Edit / Turreo Remix (género argentino modificado - PERMITIDO)
    if (/\bturreo\b/i.test(lower)) {
        return { type: 'remix', detail: 'turreo', isForbidden: false };
    }

    // RKT / Rkt (Reggaetón argentino modificado - PERMITIDO)
    if (/\brkt\b/i.test(lower) || /\brktero\b/i.test(lower)) {
        return { type: 'remix', detail: 'rkt', isForbidden: false };
    }

    // Bootleg
    if (/\bbootleg\b/i.test(lower)) {
        return { type: 'bootleg', detail: null, isForbidden: true };
    }

    // Mashup
    if (/\bmashup\b/i.test(lower) || /\bmash\s*up\b/i.test(lower)) {
        return { type: 'mashup', detail: null, isForbidden: true };
    }

    // VIP (DJ edit no oficial)
    if (/\bvip\b/i.test(lower) && /\b(edit|mix|version)\b/i.test(lower)) {
        return { type: 'vip_edit', detail: null, isForbidden: true };
    }

    // Edit genérico (con contexto de DJ/productor)
    if (/\bedit\b/i.test(lower) && !/\bradio\s*edit\b/i.test(lower)) {
        // Solo rechazar si es un edit tipo DJ (no radio edit)
        if (/\b(dj|club|party|turreo|rkt|bootleg)\b/i.test(lower)) {
            return { type: 'dj_edit', detail: 'club_edit', isForbidden: true };
        }
    }

    // Flip (reinterpretación no oficial)
    if (/\bflip\b/i.test(lower)) {
        return { type: 'flip', detail: null, isForbidden: true };
    }

    // Rework (no oficial generalmente)
    if (/\brework\b/i.test(lower)) {
        return { type: 'rework', detail: null, isForbidden: true };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VERSIONES PERMITIDAS
    // ═══════════════════════════════════════════════════════════════════════════

    // Remix (PERMITIDO - remix oficial)
    if (/\bremix\b/i.test(lower)) {
        const match = title.match(/\(([^)]*remix[^)]*)\)/i)
            || title.match(/\[([^\]]*remix[^\]]*)\]/i)
            || title.match(/\b([^()[\]|-]{2,40}\s+remix)\s*$/i);
        return { type: 'remix', detail: match ? match[1].trim() : null, isForbidden: false };
    }

    // Remaster (PERMITIDO)
    if (/\bremaster(ed)?\b/i.test(lower)) {
        const yearMatch = title.match(/(\d{4})\s*remaster/i) || title.match(/remaster(ed)?\s*(\d{4})/i);
        return { type: 'remaster', detail: yearMatch ? (yearMatch[1] || yearMatch[2]) : null, isForbidden: false };
    }

    // Radio Edit (PERMITIDO - es oficial)
    if (/\bradio\s*(edit|version)\b/i.test(lower)) {
        return { type: 'radio_edit', detail: null, isForbidden: false };
    }

    // Extended (PERMITIDO)
    if (/\bextended\b/i.test(lower)) {
        return { type: 'extended', detail: null, isForbidden: false };
    }

    // Original / Sin versión especial
    return { type: 'original', detail: null, isForbidden: false };
}

const NEVER_ACCEPT_VERSION_TYPES = new Set([
    'cover', 'karaoke', 'bootleg', 'mashup', 'vip_edit', 'dj_edit', 'flip', 'rework'
]);

const STRICT_VERSION_TYPES = new Set([
    'live', 'acoustic', 'instrumental', 'remix', 'remaster', 'radio_edit',
    'extended', 'slowed', 'sped_up', 'demo'
]);

function normalizeVersionDetail(detail) {
    return normalizeText(detail || '')
        .replace(/\b(remix|remaster(?:ed)?|version|versi[oó]n|mix|edit)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Compara la intención de versión independientemente de artista y título.
 * Una versión explícita es obligatoria; una búsqueda sin descriptor representa
 * la original. Remasters y radio edits quedan como fallbacks oficiales con
 * penalización, para mantener el recall cuando el catálogo no tiene el master.
 */
export function evaluateVersionCompatibility(targetTitle, candidateTitle, options = {}) {
    const target = detectVersion(targetTitle || '');
    const candidate = detectVersion(candidateTitle || '');
    const allowOfficialFallback = options.allowOfficialFallback === true;

    if (NEVER_ACCEPT_VERSION_TYPES.has(candidate.type)) {
        return { passed: false, reason: `forbidden_version:${candidate.type}`, score: 0, exact: false, target, candidate };
    }

    if (STRICT_VERSION_TYPES.has(target.type)) {
        if (candidate.type !== target.type) {
            // Segunda pasada exclusiva para catálogos musicales confiables:
            // algunos guardan el remaster en la edición/álbum, no en cada pista.
            // Nunca se aplica a remix, live, acústico ni otras versiones.
            if (allowOfficialFallback && target.type === 'remaster' && candidate.type === 'original') {
                return {
                    passed: true,
                    reason: 'official_master_fallback',
                    score: 0.68,
                    exact: false,
                    target,
                    candidate
                };
            }
            return { passed: false, reason: `version_mismatch:wanted_${target.type}`, score: 0, exact: false, target, candidate };
        }

        if (target.type === 'remaster' && target.detail && candidate.detail
            && target.detail !== candidate.detail) {
            return { passed: false, reason: 'version_mismatch:remaster_year', score: 0, exact: false, target, candidate };
        }

        // "Remix" genérico acepta cualquier remix oficial. Un remix nombrado
        // (p. ej. "Fred remix") debe conservar ese nombre para no cambiar de mix.
        if (target.type === 'remix') {
            const targetDetail = normalizeVersionDetail(target.detail);
            const candidateDetail = normalizeVersionDetail(candidate.detail);
            if (targetDetail && candidateDetail) {
                const detailScore = calculateStringSimilarity(targetDetail, candidateDetail).score;
                if (detailScore < 0.72) {
                    return { passed: false, reason: 'version_mismatch:remix_identity', score: 0, exact: false, target, candidate };
                }
                return { passed: true, reason: null, score: detailScore, exact: detailScore >= 0.995, target, candidate };
            }
        }

        return { passed: true, reason: null, score: 1, exact: true, target, candidate };
    }

    if (candidate.type === 'original') {
        return { passed: true, reason: null, score: 1, exact: true, target, candidate };
    }

    // Fallbacks oficiales compatibles con la canción original, pero siempre
    // pierden frente al master original cuando ambos están disponibles.
    if (candidate.type === 'remaster') {
        return { passed: true, reason: null, score: 0.88, exact: false, target, candidate };
    }
    if (candidate.type === 'radio_edit') {
        return { passed: true, reason: null, score: 0.80, exact: false, target, candidate };
    }

    return {
        passed: false,
        reason: `version_mismatch:wanted_original_got_${candidate.type}`,
        score: 0,
        exact: false,
        target,
        candidate
    };
}



// ═══════════════════════════════════════════════════════════════════════════════
// CONTENIDO BASURA
// ═══════════════════════════════════════════════════════════════════════════════

const TRASH_ARTISTS = [
    'kidz bop', 'rockabye baby', 'vitamin string quartet', 'piano tribute',
    'baby einstein', 'lullaby', 'sweet little band', 'twinkle twinkle',
    'sleep baby', 'relaxing baby', 'meditation music'
];

const TRASH_PATTERNS = [
    /\bkaraoke\b/i,
    /\blullaby\b/i,
    /\bfor\s*kids\b/i,
    /\binfantil\b/i,
    /\bbacking\s*track\b/i,
    /\bmidi\b/i,
    /\btutorial\b/i,
    /\blesson\b/i,
    /\bringtone\b/i,
    /\bmusic\s*box\b/i,
];

/**
 * Verifica si el contenido es basura
 * @param {Object} candidate - Candidato a evaluar
 * @returns {{ isTrash: boolean, reason: string|null }}
 */
export function isTrashContent(candidate) {
    const rawTitle = candidate.name || candidate.title || '';
    const title = rawTitle.toLowerCase();

    // 1. RECHAZO POR LONGITUD EXCESIVA (Anti-Spam / Anti-Mix)
    // El usuario reportó problemas con títulos enormes tipo "Los Pegaditos: ... / ... / ..."
    if (title.length > 100) {
        return { isTrash: true, reason: `title_too_long:${title.length}` };
    }

    // 2. RECHAZO POR EXCESO DE SEPARADORES (Tracklists en título)
    // Si tiene muchos " / " o " | " es casi seguro un mix o álbum completo en un video
    const separators = (title.match(/\s[\/\|]\s/g) || []).length;
    if (separators >= 3) {
        return { isTrash: true, reason: 'multi_song_title_detected' };
    }

    const artist = normalizeText(extractArtistName(candidate));

    // Artistas basura
    for (const trash of TRASH_ARTISTS) {
        if (artist.includes(trash)) {
            return { isTrash: true, reason: `trash_artist:${trash}` };
        }
    }

    // Patrones basura en título
    for (const pattern of TRASH_PATTERNS) {
        if (pattern.test(title)) {
            return { isTrash: true, reason: 'trash_content' };
        }
    }

    return { isTrash: false, reason: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE ARTISTA
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZACIÓN ADICIONAL - LATAM FRIENDLY
// ═══════════════════════════════════════════════════════════════════════════════

function cleanSpanishTitle(text) {
    if (!text) return '';
    return text
        // Video Clips / Oficiales
        .replace(/\(video\s*oficial\)/gi, '')
        .replace(/\[video\s*oficial\]/gi, '')
        .replace(/\(official\s*video\)/gi, '')
        .replace(/\(video\s*clip\)/gi, '')
        .replace(/\(videoclip\)/gi, '')
        .replace(/\(clip\s*oficial\)/gi, '')
        .replace(/\(video\s*lyric\)/gi, '')
        .replace(/\(letra\s*oficial\)/gi, '')
        .replace(/\(audio\s*oficial\)/gi, '')
        .replace(/\(visualizer\)/gi, '')
        .replace(/\(sesi[oó]n\s*en\s*vivo\)/gi, '')
        // Separadores comunes
        .replace(/\s+\|\s+/g, ' ')
        .replace(/\s+-\s+/g, ' ')
        // Trim final
        .trim();
}

/**
 * Extrae el nombre del artista de un item
 * Compatible con múltiples formatos de API
 * @param {Object} item - Item de la API
 * @returns {string} Nombre del artista
 */
export function extractArtistName(item) {
    if (!item) return '';

    if (item.primaryArtists?.trim()) return item.primaryArtists.trim();
    if (item.artist && typeof item.artist === 'string') return item.artist.trim();

    if (Array.isArray(item.artists?.primary)) {
        const names = item.artists.primary.map(a => a.name || a).filter(Boolean);
        if (names.length) return names.join(', ');
    }
    if (Array.isArray(item.artists)) {
        const names = item.artists.map(a => a.name || a).filter(Boolean);
        if (names.length) return names.join(', ');
    }
    if (typeof item.artists === 'string') return item.artists.trim();

    if (item.more_info?.artistMap?.primary_artists) {
        const artists = item.more_info.artistMap.primary_artists;
        if (Array.isArray(artists)) {
            const names = artists.map(a => a.name || a).filter(Boolean);
            if (names.length) return names.join(', ');
        }
    }
    if (item.more_info?.primary_artists?.trim()) return item.more_info.primary_artists.trim();
    if (item.subtitle?.trim()) return item.subtitle.trim();
    if (item.music?.trim()) return item.music.trim();

    return '';
}

function decodeHtmlEntities(value) {
    return String(value || '')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

export function splitArtistCredits(value) {
    return decodeHtmlEntities(value)
        .split(/\s*,\s*|\s*&\s*|\s+(?:and|y|feat\.?|ft\.?|featuring|with|x)\s+/gi)
        .map(part => part.trim())
        .filter(part => part.length > 0);
}

/**
 * Extrae información detallada del artista
 * @param {Object} item - Item de la API
 * @returns {{ primary: string, collaborators: string[], full: string }}
 */
export function extractArtistInfo(item) {
    let primary = decodeHtmlEntities(extractArtistName(item));
    const collaborators = [];

    // Separar colaboradores
    if (primary && (primary.includes(',') || primary.includes('&') || /\s+(?:and|y|feat|ft|featuring|with|x)\s+/i.test(primary))) {
        const parts = splitArtistCredits(primary);
        primary = parts[0]?.trim() || primary;
        collaborators.push(...parts.slice(1).map(p => p?.trim()).filter(Boolean));
    }

    return {
        primary,
        collaborators: [...new Set(collaborators)],
        full: [primary, ...collaborators].filter(Boolean).join(', ')
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE FEATS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extrae featuring artists del título
 * @param {string} title - Título de la canción
 * @returns {string[]} Lista de artistas feat
 */
export function extractFeats(title) {
    if (!title) return [];
    const feats = [];

    const patterns = [
        /\(feat\.?\s+([^)]+)\)/gi,
        /\(ft\.?\s+([^)]+)\)/gi,
        /\(featuring\s+([^)]+)\)/gi,
        /\(with\s+([^)]+)\)/gi,
        /\[feat\.?\s+([^\]]+)\]/gi,
        /\[ft\.?\s+([^\]]+)\]/gi,
        /\bfeat\.?\s+([^()[\]|]+)(?=$|[\[(|])/gi,
        /\bft\.?\s+([^()[\]|]+)(?=$|[\[(|])/gi,
        /\bfeaturing\s+([^()[\]|]+)(?=$|[\[(|])/gi,
        /\bwith\s+([^()[\]|]+)(?=$|[\[(|])/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(title)) !== null) {
            const artists = splitArtistCredits(match[1]).filter(a => a.length > 1);
            feats.push(...artists);
        }
    }

    return [...new Set(feats)];
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUACIÓN DE IDENTIDAD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evalúa la identidad primaria (artista + título)
 * @param {Object} candidate - Candidato
 * @param {string} targetArtist - Artista buscado
 * @param {string} targetTitle - Título buscado
 * @returns {{ passed: boolean, titleScore: number, artistScore: number, combinedScore: number }}
 */
/**
 * Elimina sufijos propios del canal, no del artista musical.
 */
function normalizeArtistForMatching(value) {
    return normalizeText(value)
        .replace(/\b(official|oficial|vevo|topic|canal oficial|official channel|records?|music)\b\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Limpia descriptores editoriales o de formato sin borrar palabras musicales
 * arbitrarias del título. La versión se valida por separado sobre el título raw.
 */
function normalizeTitleForMatching(value) {
    const cleaned = cleanTitle(value || '')
        .replace(/[\[(]?\s*single\s+version\s*[\])]?/gi, ' ')
        .replace(/\s*[-–—]?\s*(?:19|20)\d{2}\s+remaster(?:ed)?\s*$/gi, '')
        .replace(/\s*[-–—]?\s*remaster(?:ed)?\s+(?:19|20)\d{2}\s*$/gi, '')
        .replace(/[\[(]\s*(salsa|cumbia|bachata|merengue|reggaeton)?\s*(version|versi[oó]n)?\s*[\])]/gi, '')
        .replace(/[\[(][^\])]*\b(remix|remaster(?:ed)?|radio\s+edit|extended\s+mix|original\s+mix)\b[^\])]*[\])]/gi, '')
        .replace(/[\[(]\s*(concierto\s+)?(en\s+vivo|live)(\s+(at|from|in)\s+[^\])]+)?\s*[\])]/gi, '')
        .replace(/[\[(][^\])]*\b(acoustic|acustic[ao]?|unplugged|stripped|instrumental|sped\s*up|slowed(?:\s*[+&]\s*reverb)?|nightcore|demo)\b[^\])]*[\])]/gi, '')
        .replace(/\s*[|]\s*(official|oficial)?\s*(audio|video|lyrics?|letra|visualizer).*$/gi, '')
        .replace(/\s*[|]\s*(audio|video)\s*(official|oficial).*$/gi, '')
        .replace(/\b(audio|video)\s*(official|oficial)\s*\d{0,4}\s*$/gi, '')
        .replace(/\b(official|oficial)\s*(audio|video)\s*\d{0,4}\s*$/gi, '')
        .replace(/\b(lyrics?|letra|visualizer)\s*(official|oficial)?\s*$/gi, '')
        .replace(/\s*[-–—]\s*from\s+['“”\"]?[^'“”\"]+['“”\"]?\s+soundtrack\s*$/gi, '')
        .replace(/[\[(]\s*from\s+[^\])]+(?:soundtrack)?\s*[\])]/gi, '')
        .replace(/\b(remaster(?:ed)?|remix|radio\s+edit|extended\s+mix|original\s+mix)\b/gi, '')
        .replace(/\b(?:19|20)\d{2}\b\s*$/gi, '')
        .replace(/\b(hq|hd|4k)\b\s*$/gi, '')
        .replace(/\b(salsa|cumbia|bachata|merengue)\s+version\b/gi, '')
        .replace(/\b(en\s+vivo|live)\s*$/gi, '')
        .replace(/\b(acoustic|acustic[ao]?|unplugged|stripped|instrumental|sped\s*up|slowed(?:\s*[+&]\s*reverb)?|nightcore|demo)(?:\s+(?:version|versi[oó]n))?\s*$/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    const normalized = normalizeText(cleaned);
    return normalized || normalizeText(cleanTitle(value || ''));
}

function matchTypeForScore(score, hasTarget) {
    if (!hasTarget) return 'no_target';
    if (score >= 0.995) return 'exact';
    if (score >= 0.90) return 'near_exact';
    if (score >= 0.80) return 'high_similarity';
    if (score >= 0.60) return 'partial';
    return 'none';
}

function getFieldThreshold(normalizedValue, field) {
    const tokens = normalizedValue.split(' ').filter(Boolean);

    if (field === 'artist') {
        if (tokens.length === 1 && normalizedValue.length <= 4) return 0.94;
        if (tokens.length === 1) return 0.84;
        return 0.82;
    }

    if (tokens.length === 1 && normalizedValue.length <= 4) return 0.94;
    if (tokens.length === 1) return 0.84;
    if (tokens.length === 2) return 0.82;
    return 0.78;
}

function inferArtistAndTitle(rawTitle, targetArtistNorm) {
    const fallback = { inferredArtist: '', inferredArtistFull: '', inferredTitle: rawTitle || '' };
    if (!rawTitle || !targetArtistNorm) return fallback;

    const parts = rawTitle.split(/\s+[-:|]\s+/).map(part => part.trim()).filter(Boolean);
    if (parts.length < 2) return fallback;

    const cleanInferredArtist = value => String(value || '')
        .replace(/\b(feat(?:uring)?|ft\.?|con|with)\b.*$/i, '')
        .trim();
    const first = normalizeArtistForMatching(cleanInferredArtist(parts[0]));
    const last = normalizeArtistForMatching(cleanInferredArtist(parts[parts.length - 1]));
    const firstScore = calculateStringSimilarity(first, targetArtistNorm).score;
    const lastScore = calculateStringSimilarity(last, targetArtistNorm).score;

    if (firstScore >= 0.78) {
        const remaining = parts.slice(1);
        const trailingIsEditorial = remaining.length > 1
            && /^(?:\d+\s*)?(?:a[nñ]os?|aniversario|official|oficial|audio|video)$/i.test(remaining.at(-1));
        return {
            inferredArtist: cleanInferredArtist(parts[0]),
            inferredArtistFull: parts[0],
            inferredTitle: trailingIsEditorial ? remaining.slice(0, -1).join(' ') : remaining.join(' ')
        };
    }
    if (lastScore >= 0.78) {
        return {
            inferredArtist: cleanInferredArtist(parts[parts.length - 1]),
            inferredArtistFull: parts[parts.length - 1],
            inferredTitle: parts.slice(0, -1).join(' ')
        };
    }

    return fallback;
}

/**
 * Matching primario v2.
 *
 * Artista y título son condiciones independientes: un artista perfecto ya no
 * puede compensar una canción diferente, ni un título exacto puede compensar
 * un artista irrelevante. El score combinado sirve para ordenar, no para eludir
 * esos bloqueos.
 */
export function evaluatePrimaryIdentity(candidate, targetArtist, targetTitle) {
    const rawTitle = candidate?.name || candidate?.title || '';
    const targetArtistNorm = normalizeArtistForMatching(targetArtist || '');
    const targetTitleNorm = normalizeTitleForMatching(targetTitle || '');
    const targetCredits = splitArtistCredits(targetArtist || '')
        .map(normalizeArtistForMatching)
        .filter(Boolean);
    const targetPrimaryNorm = targetCredits[0] || targetArtistNorm;
    const targetCollaborators = [...new Set(targetCredits.slice(1))];
    const inferred = inferArtistAndTitle(rawTitle, targetPrimaryNorm);
    const candidateTitleNorm = normalizeTitleForMatching(inferred.inferredTitle);

    const artistInfo = extractArtistInfo(candidate);
    const inferredArtistInfo = extractArtistInfo({ artist: inferred.inferredArtistFull });
    const metadataPrimary = normalizeArtistForMatching(artistInfo.primary);
    const inferredPrimary = normalizeArtistForMatching(inferredArtistInfo.primary || inferred.inferredArtist);
    const candidatePrimaryVariants = [metadataPrimary, inferredPrimary].filter(Boolean);
    const candidateCollaborators = [
        ...artistInfo.collaborators,
        ...inferredArtistInfo.collaborators,
        ...extractFeats(rawTitle)
    ].map(normalizeArtistForMatching).filter(Boolean);
    const wholeArtistVariants = [
        artistInfo.primary,
        artistInfo.full,
        inferred.inferredArtist,
        inferred.inferredArtistFull
    ].map(normalizeArtistForMatching).filter(Boolean);
    const allArtistVariants = [
        ...wholeArtistVariants,
        ...artistInfo.collaborators.map(normalizeArtistForMatching),
        ...candidateCollaborators
    ].filter(Boolean);

    const bestSimilarity = (target, variants) => {
        let best = {
            score: target ? 0 : 0.5,
            levenshtein: 0,
            tokenPrecision: 0,
            tokenRecall: 0,
            tokenF1: 0,
            value: ''
        };

        if (!target) return best;
        for (const variant of new Set(variants)) {
            const similarity = calculateStringSimilarity(variant, target);
            if (similarity.score > best.score) best = { ...similarity, value: variant };
        }
        return best;
    };

    // Dos rutas independientes y seguras:
    // 1) el crédito completo coincide; 2) coinciden el principal y TODOS los
    // colaboradores, aunque el proveedor sólo los incluya en "feat/with".
    const bestWholeArtist = bestSimilarity(targetArtistNorm, allArtistVariants);
    const bestPrimaryArtist = bestSimilarity(targetPrimaryNorm, candidatePrimaryVariants);
    const titleSimilarity = targetTitleNorm
        ? calculateStringSimilarity(candidateTitleNorm, targetTitleNorm)
        : { score: 0.5, levenshtein: 0, tokenPrecision: 0, tokenRecall: 0, tokenF1: 0 };
    const collaboratorMatches = targetCollaborators.map(target => ({
        target,
        ...bestSimilarity(target, candidateCollaborators)
    }));
    const primaryThreshold = targetPrimaryNorm ? getFieldThreshold(targetPrimaryNorm, 'artist') : 0;
    const primaryPassed = !targetPrimaryNorm || bestPrimaryArtist.score >= primaryThreshold;
    const collaboratorsPassed = collaboratorMatches.every(match =>
        match.score >= getFieldThreshold(match.target, 'artist')
    );
    // Algunos catálogos omiten créditos secundarios en canciones antiguas. Se
    // tolera sólo si principal+título son prácticamente exactos y el candidato
    // no declara un colaborador contradictorio. Ausencia no equivale a conflicto.
    const implicitCollaboratorsPassed = targetCollaborators.length > 0
        && primaryPassed
        && titleSimilarity.score >= 0.98
        && candidateCollaborators.length === 0;
    const componentPassed = targetCollaborators.length > 0
        && primaryPassed
        && (collaboratorsPassed || implicitCollaboratorsPassed);
    const collaboratorAverage = collaboratorMatches.length
        ? collaboratorMatches.reduce((sum, match) => sum + match.score, 0) / collaboratorMatches.length
        : 0;
    const componentScore = componentPassed
        ? (bestPrimaryArtist.score * 0.65) + (collaboratorAverage * 0.35)
        : 0;
    const bestArtist = componentScore > bestWholeArtist.score
        ? {
            ...bestPrimaryArtist,
            score: componentScore,
            value: [bestPrimaryArtist.value, ...collaboratorMatches.map(match => match.value)].filter(Boolean).join(', ')
        }
        : bestWholeArtist;

    const titleThreshold = targetTitleNorm ? getFieldThreshold(targetTitleNorm, 'title') : 0;
    let artistThreshold = targetArtistNorm ? getFieldThreshold(targetArtistNorm, 'artist') : 0;

    // Un título prácticamente exacto permite ruido moderado de canal en artistas
    // compuestos, pero nunca elimina por completo la validación de artista.
    if (targetArtistNorm.includes(' ') && titleSimilarity.score >= 0.94) {
        artistThreshold = Math.min(artistThreshold, 0.78);
    }

    const titlePassed = !targetTitleNorm || titleSimilarity.score >= titleThreshold;
    // Para créditos múltiples, una similitud parcial de la cadena completa no
    // puede ocultar un colaborador ausente. La ruta completa exige cercanía alta.
    const wholeArtistPassed = !targetArtistNorm || bestWholeArtist.score >= (
        targetCollaborators.length ? Math.max(artistThreshold, 0.93) : artistThreshold
    );
    const artistPassed = !targetArtistNorm || wholeArtistPassed || componentPassed;

    let combinedScore;
    if (targetArtistNorm && targetTitleNorm) {
        combinedScore = (titleSimilarity.score * 0.58) + (bestArtist.score * 0.42);
    } else if (targetTitleNorm) {
        combinedScore = titleSimilarity.score;
    } else if (targetArtistNorm) {
        combinedScore = bestArtist.score;
    } else {
        combinedScore = 0.5;
    }

    return {
        passed: titlePassed && artistPassed,
        titleScore: titleSimilarity.score,
        artistScore: bestArtist.score,
        combinedScore,
        titleMatch: matchTypeForScore(titleSimilarity.score, !!targetTitleNorm),
        artistMatch: matchTypeForScore(bestArtist.score, !!targetArtistNorm),
        thresholds: {
            title: titleThreshold,
            artist: artistThreshold
        },
        gates: {
            titlePassed,
            artistPassed
        },
        normalized: {
            targetTitle: targetTitleNorm,
            candidateTitle: candidateTitleNorm,
            targetArtist: targetArtistNorm,
            candidateArtist: bestArtist.value
        },
        metrics: {
            title: titleSimilarity,
            artist: {
                score: bestArtist.score,
                levenshtein: bestArtist.levenshtein,
                tokenPrecision: bestArtist.tokenPrecision,
                tokenRecall: bestArtist.tokenRecall,
                tokenF1: bestArtist.tokenF1
            },
            artistCredits: {
                targetPrimary: targetPrimaryNorm,
                targetCollaborators,
                candidatePrimary: [...new Set(candidatePrimaryVariants)],
                candidateCollaborators: [...new Set(candidateCollaborators)],
                primaryScore: bestPrimaryArtist.score,
                collaboratorMatches: collaboratorMatches.map(({ target, value, score }) => ({ target, value, score })),
                wholeScore: bestWholeArtist.score,
                wholePassed: wholeArtistPassed,
                componentPassed,
                implicitCollaboratorsPassed
            }
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUACIÓN DE CONTEXTO MUSICAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evalúa el contexto musical (duración, álbum)
 * @param {Object} candidate - Candidato
 * @param {number} targetDuration - Duración objetivo
 * @param {string} targetAlbum - Álbum objetivo
 * @returns {{ durationScore: number, albumScore: number }}
 */
export function evaluateMusicalContext(candidate, targetDuration, targetAlbum) {
    const result = {
        durationScore: 1.0,
        durationDiff: null,
        albumScore: 0.5,
        albumMatch: 'unknown'
    };

    // DURACIÓN
    const candDuration = candidate.duration || 0;
    const targetDur = parseInt(targetDuration) || 0;

    if (targetDur > 0 && candDuration > 0) {
        const diff = Math.abs(candDuration - targetDur);
        result.durationDiff = diff;

        // Tolerancia STRICTA para duración (Petición de precisión)
        if (diff <= 5) result.durationScore = 1.0; // Exacto (5s margen)
        else if (diff <= 15) result.durationScore = 0.85;
        else if (diff <= 30) result.durationScore = 0.60;
        else if (diff <= 60) result.durationScore = 0.30;
        else result.durationScore = 0.1;
    }

    // Rechazar videos muy largos
    if (candDuration > 600 && targetDur > 0 && targetDur < 400) {
        result.durationScore = 0.1;
    }

    // ÁLBUM (solo si viene explícito)
    const candAlbum = normalizeText(candidate.album?.name || candidate.album || '');
    const targetAlbumNorm = normalizeText(targetAlbum || '');

    if (targetAlbumNorm && candAlbum) {
        if (candAlbum === targetAlbumNorm || candAlbum.includes(targetAlbumNorm) || targetAlbumNorm.includes(candAlbum)) {
            result.albumScore = 1.0;
            result.albumMatch = 'match';
        } else {
            result.albumScore = 0.4;
            result.albumMatch = 'different';
        }
    }

    return result;
}

function isLikelyMultiTrack(candidateTitle, targetTitle) {
    const raw = String(candidateTitle || '');
    if (!/[\/]/.test(raw)) return false;
    if (/\b(mix|medley|enganchad[oa]s?|compilation|full\s+album|mixes)\b/i.test(targetTitle || '')) return false;

    const segments = raw.split(/\s+[\/]\s+/).map(normalizeText).filter(Boolean);
    if (segments.length < 2) return false;

    const trailingSegment = segments[segments.length - 1];
    const isEditorialSuffix = /^(official|oficial)?\s*(audio|video|lyrics?|letra|visualizer)(\s+\d{4})?$/.test(trailingSegment);

    return !isEditorialSuffix && /\b(mix|medley|enganchad[oa]s?|pegadit[oa]s?)\b/i.test(raw);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUACIÓN COMPLETA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evalúa un candidato completo
 * @param {Object} candidate - Candidato de la API
 * @param {Object} params - Parámetros de búsqueda
 * @returns {Object} Resultado de evaluación
 */
export function evaluateCandidate(candidate, params) {
    const { targetArtist, targetTitle, targetDuration, targetAlbum } = params;

    // PRE-FILTRO: Contenido basura
    const trash = isTrashContent(candidate);
    if (trash.isTrash) {
        return {
            passed: false,
            rejected: true,
            rejectReason: trash.reason,
            scores: { identityScore: 0, versionScore: 0, durationScore: 0, albumScore: 0, finalConfidence: 0 },
            version: null,
            feats: []
        };
    }

    if (isLikelyMultiTrack(candidate.name || candidate.title || '', targetTitle)) {
        return {
            passed: false,
            rejected: true,
            rejectReason: 'multi_song_title_detected',
            scores: { identityScore: 0, versionScore: 0, durationScore: 0, albumScore: 0, finalConfidence: 0 },
            version: null,
            feats: []
        };
    }

    // FASE 2: la versión solicitada es una condición independiente de identidad.
    const candidateTitle = candidate.name || candidate.title || '';
    const versionCompatibility = evaluateVersionCompatibility(targetTitle, candidateTitle, {
        allowOfficialFallback: params.allowOfficialVersionFallback === true
    });
    const version = versionCompatibility.candidate;

    if (!versionCompatibility.passed) {
        return {
            passed: false,
            rejected: true,
            rejectReason: versionCompatibility.reason,
            scores: { identityScore: 0, versionScore: 0, durationScore: 0, albumScore: 0, finalConfidence: 0 },
            version,
            feats: [],
            details: { versionCompatibility }
        };
    }

    // FASE 1: IDENTIDAD PRIMARIA
    const identity = evaluatePrimaryIdentity(candidate, targetArtist, targetTitle);

    // FASE 3: CONTEXTO MUSICAL
    const context = evaluateMusicalContext(candidate, targetDuration, targetAlbum);

    // CALCULAR SCORES
    const identityScore = identity.combinedScore;

    // DETECTAR CENSURA / EXPLICIT (Preferir explicit sobre clean)
    // Usamos el título raw porque cleanTitle() ya eliminó estas etiquetas
    const candTitleRawLower = (candidate.name || candidate.title || '').toLowerCase();

    // Patrones seguros para detectar versiones (evita falsos positivos)
    const cleanPattern = /[\(\[]\s*(clean|censored|edited)\s*[\]\)]|\bclean\s*version\b|\bcensored\s*version\b/i;
    const explicitPattern = /[\(\[]\s*(explicit|uncensored|dirty)\s*[\]\)]|\bexplicit\s*version\b|\buncensored\s*version\b|\bparental\s*advisory\b/i;

    const isClean = cleanPattern.test(candTitleRawLower) && !explicitPattern.test(candTitleRawLower);
    const isExplicit = explicitPattern.test(candTitleRawLower);

    let versionScore = versionCompatibility.score;

    // AJUSTE POR PREFERENCIA DE USUARIO (Sin censura > Censurado)
    if (isClean) {
        // Penalizar fuertemente versiones censuradas para que pierdan contra la original/explicit
        versionScore *= 0.6;
    } else if (isExplicit) {
        // Boost ligero para asegurar que gane contra versiones ambiguas (sin etiqueta)
        // Ejemplo: "Song (Explicit)" gana a "Song" (que podría ser clean o explicit)
        versionScore = Math.min(1.0, versionScore * 1.05);
    }
    const durationScore = context.durationScore;

    // Pesos dinámicos (MODO ESTRICTO 2.0: Identidad es ABSOLUTA)
    const hasTargetAlbum = !!(targetAlbum && targetAlbum.trim());
    const hasTargetDuration = targetDuration > 0;

    const weights = {
        identity: 0.90, // SUBIDO al 90% (Usuario pide 95-100% de match)
        version: 0.05,
        duration: hasTargetDuration ? 0.05 : 0.05,
        album: hasTargetAlbum ? 0.0 : 0.0 // Album es irrelevante si la identidad no es perfecta
    };

    // Normalizar pesos
    const currentTotal = weights.identity + weights.version + weights.duration + weights.album;

    const finalConfidence = (
        (identityScore * weights.identity) +
        (versionScore * weights.version) +
        (durationScore * weights.duration) +
        (context.albumScore * weights.album)
    ) / currentTotal;

    // Artista y título son gates independientes. Nunca se compensan entre sí.
    const hasTargetTitle = !!(targetTitle && targetTitle.trim());
    const hasTargetArtist = !!(targetArtist && targetArtist.trim());

    const feats = extractFeats(candidate.name || candidate.title || '');

    let rejectReason = null;
    if (hasTargetTitle && !identity.gates.titlePassed) {
        rejectReason = `same_artist_different_track:title_${identity.titleScore.toFixed(2)}_required_${identity.thresholds.title.toFixed(2)}`;
    } else if (hasTargetArtist && !identity.gates.artistPassed) {
        rejectReason = `artist_mismatch:artist_${identity.artistScore.toFixed(2)}_required_${identity.thresholds.artist.toFixed(2)}`;
    } else if (targetDuration > 0 && candidate.duration > 0) {
        const maximumSafeDifference = Math.max(75, Number(targetDuration) * 0.30);
        if (context.durationDiff > maximumSafeDifference) {
            rejectReason = `duration_mismatch:diff_${context.durationDiff}s`;
        }
    }

    // Sin título específico se mantiene el modo de descubrimiento, pero si se
    // proporcionó artista sigue siendo obligatorio superar su gate.
    const passed = hasTargetTitle
        ? !rejectReason && identity.passed
        : !rejectReason && (!hasTargetArtist || identity.gates.artistPassed);

    return {
        passed,
        rejected: !passed,
        rejectReason,
        scores: {
            identityScore: Math.round(identityScore * 100) / 100,
            versionScore: Math.round(versionScore * 100) / 100,
            durationScore: Math.round(durationScore * 100) / 100,
            albumScore: Math.round(context.albumScore * 100) / 100,
            finalConfidence: passed ? Math.round(finalConfidence * 100) / 100 : 0
        },
        version,
        feats,
        details: {
            identity,
            context,
            versionCompatibility
        }
    };
}

// Re-exportar funciones de normalización para conveniencia
export { normalizeText, normalizeArtist, cleanTitle };
