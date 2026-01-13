/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 YOUTUBE EXTRACTOR - MÓDULO CENTRAL DE EXTRACCIÓN
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Módulo compartido para extracción y validación de canciones.
 * Usado por: api/youtube-search.js, api/search.js, song-loader.js
 * 
 * REGLA DE ORO: Solo música de estudio
 * 
 * ✅ PERMITIDO: Singles, álbumes, EPs, remixes, remasters, radio edits
 * ❌ PROHIBIDO: Live, acoustic, covers, karaoke, slowed, nightcore
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { normalizeText, normalizeArtist } from '../normalization/normalize-text.js';
import { cleanTitle } from '../normalization/clean-title.js';

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
    if (/\b(live\s*version|live\s*performance|en\s*vivo|en\s*directo)\b/i.test(lower)) {
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

    // Karaoke / Instrumental
    if (/\b(karaoke|instrumental|backing\s*track)\b/i.test(lower)) {
        return { type: 'karaoke', detail: null, isForbidden: true };
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
        const match = title.match(/\(([^)]*remix[^)]*)\)/i) || title.match(/\[([^\]]*remix[^\]]*)\]/i);
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

/**
 * Extrae información detallada del artista
 * @param {Object} item - Item de la API
 * @returns {{ primary: string, collaborators: string[], full: string }}
 */
export function extractArtistInfo(item) {
    let primary = extractArtistName(item);
    const collaborators = [];

    // Separar colaboradores
    if (primary && (primary.includes(',') || primary.includes('&') || /\s+(and|y|feat|ft|featuring|with|x)\s+/i.test(primary))) {
        const parts = primary.split(/[,&]|\s+(and|y|feat\.?|ft\.?|featuring|with|x)\s+/gi).filter(Boolean);
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
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(title)) !== null) {
            const artists = match[1].split(/[,&]/).map(a => a.trim()).filter(a => a.length > 1);
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
export function evaluatePrimaryIdentity(candidate, targetArtist, targetTitle) {
    const result = {
        passed: false,
        titleScore: 0,
        artistScore: 0,
        combinedScore: 0,
        titleMatch: 'none',
        artistMatch: 'none'
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 2: NORMALIZACIÓN SIMÉTRICA (MEJORADA PARA LATAM)
    // ═══════════════════════════════════════════════════════════════════════════
    // Aplicamos cleanTitle + cleanSpanishTitle local
    const rawCandTitle = candidate.name || candidate.title || '';

    // FIX: Eliminar el artista del título si aparece al inicio (común en YouTube)
    // ESTRATEGIA: Detectar separadores " - " antes de normalizar
    let cleanRawTitle = rawCandTitle;

    // Separadores fuertes: " - ", " : ", " | "
    const separatorRegex = /\s+[-:|]\s+/;
    if (targetArtist && separatorRegex.test(rawCandTitle)) {
        const parts = rawCandTitle.split(separatorRegex);
        // Solo si hay 2 o 3 partes (Artist - Title) o (Artist - Title - Official)
        if (parts.length >= 2) {
            const p0 = normalizeText(parts[0]);
            const pLast = normalizeText(parts[parts.length - 1]);
            const targetSimple = normalizeText(targetArtist);

            // Caso 1: "Artist... - Title" (Prefijo)
            // Verificamos si la primera parte CONTIENE al artista buscado
            if (p0.includes(targetSimple) || targetSimple.includes(p0)) {
                // Asumimos que todo lo que sigue es el título
                cleanRawTitle = parts.slice(1).join(' ');
            }
            // Caso 2: "Title - Artist" (Sufijo)
            else if (pLast.includes(targetSimple) || targetSimple.includes(pLast)) {
                cleanRawTitle = parts.slice(0, parts.length - 1).join(' ');
            }
        }
    }

    let candTitle = normalizeText(cleanSpanishTitle(cleanTitle(cleanRawTitle)));
    const candArtist = normalizeArtist(extractArtistInfo(candidate).primary);

    // Fallback: Si la limpieza por separador no funcionó (o no había separador), 
    // intentamos quitar el artista del inicio del string normalizado.
    if (targetArtist) {
        const artistSimple = normalizeText(targetArtist);
        if (artistSimple.length > 0 && candTitle.startsWith(artistSimple)) {
            const remainder = candTitle.replace(artistSimple, '').trim();
            if (remainder.length > 0) {
                candTitle = remainder;
            }
        }
    }

    // normalizar target completo
    const targetTitleFullNorm = normalizeText(cleanSpanishTitle(cleanTitle(targetTitle || '')));
    const targetArtistNorm = normalizeArtist(targetArtist || '');

    // normalizar target "main" (sin paréntesis)
    // Ej: "Voltage (See You Again)" -> "Voltage"
    let targetTitleMainRaw = targetTitle || '';
    if (targetTitleMainRaw.includes('(') || targetTitleMainRaw.includes('[')) {
        targetTitleMainRaw = targetTitleMainRaw.replace(/[\(\[].*?[\)\]]/g, '');
    }
    const targetTitleMainNorm = normalizeText(cleanSpanishTitle(cleanTitle(targetTitleMainRaw)));

    // HELPER: Limpiar spam de versiones para comparar "Esencia vs Esencia"
    // Ahora incluye "en vivo", "concierto", "live" para que la excepción peruana funcione con scores altos
    const removeVersionSpam = (t) => t ? t.replace(/\b(remaster|remastered|remix|mix|radio edit|extended|version|edit|vivo|en vivo|concierto|live)\b/gi, '').replace(/\s+/g, ' ').trim() : '';

    const candTitleBase = removeVersionSpam(candTitle);

    // FUNCIÓN DE SIMILITUD ESTRICTA (0 - 1.0)
    const calculateStrictScore = (cand, target) => {
        if (!cand || !target) return 0;
        if (cand === target) return 1.0;

        // Si uno contiene al otro, penalizar por longitud extra (basura / palabras extra)
        // Ejemplo: Target="Hello" (5), Cand="Hello Live" (10) -> Score 0.5
        if (cand.includes(target)) {
            return target.length / cand.length;
        }
        if (target.includes(cand)) {
            return cand.length / target.length;
        }

        // Palabras compartidas (Jaccard simple ponderado)
        const candWords = cand.split(' ').filter(w => w.length > 1);
        const targetWords = target.split(' ').filter(w => w.length > 1);
        if (targetWords.length === 0 || candWords.length === 0) return 0;

        const intersection = targetWords.filter(w => candWords.includes(w));
        // Penalizar fuertemente si hay menos palabras o más palabras de las necesarias
        const union = new Set([...candWords, ...targetWords]).size;

        return intersection.length / union;
    };

    // Usaremos la lógica de matching para ambos y nos quedamos con el mejor resultado
    const evaluateTitleAgainst = (targetNorm) => {
        if (!targetNorm) return { score: 0, match: 'none' };

        let score = calculateStrictScore(candTitle, targetNorm);

        // 🧠 RESCATE INTELIGENTE (Base Identity):
        // Si falla la comparación directa, probamos comparando las versiones LIMPIAS (sin remix/remaster).
        // Esto permite que "Song (Remaster)" haga match con "Song".
        if (score < 0.85) {
            const targetBase = removeVersionSpam(targetNorm);
            // Solo aplicar si los títulos base no quedaron vacíos
            if (candTitleBase.length > 1 && targetBase.length > 1) {
                const baseScore = calculateStrictScore(candTitleBase, targetBase);

                // Si la comparación base es excelente, la usamos.
                // Penalizamos ligeramente (0.98) para que un match EXACTO real gane prioridad si existe.
                if (baseScore > score) {
                    score = Math.max(score, baseScore * 0.98);
                }
            }
        }

        let matchType = 'none';
        if (score === 1.0) matchType = 'exact';
        else if (score >= 0.95) matchType = 'near_exact'; // Cumple criterio 95%
        else if (score >= 0.8) matchType = 'high_similarity';
        else if (score >= 0.5) matchType = 'partial';

        // Logica legacy de palabras clave para fallback (solo si score es bajo pero tiene palabras clave)
        // Por ahora confiamos en el score estricto

        return { score, match: matchType };
    };

    // Calcular scores
    const resFull = evaluateTitleAgainst(targetTitleFullNorm);
    const resMain = (targetTitleMainNorm && targetTitleMainNorm !== targetTitleFullNorm)
        ? evaluateTitleAgainst(targetTitleMainNorm)
        : { score: 0, match: 'none' };

    // Quedarse con el mejor
    if (resMain.score > resFull.score) {
        result.titleScore = resMain.score;
        result.titleMatch = resMain.match;
    } else {
        result.titleScore = resFull.score;
        result.titleMatch = resFull.match;
    }

    if (!result.titleMatch || result.titleMatch === 'none') {
        // Fallback si nada matcheó
        if (!targetTitleFullNorm) {
            result.titleScore = 0.5;
            result.titleMatch = 'no_target';
        }
    }

    // ARTISTA (más importante que título)
    if (targetArtistNorm) {
        const artistInfo = extractArtistInfo(candidate);
        const allArtists = [artistInfo.primary, ...artistInfo.collaborators].map(a => normalizeText(a));
        const candArtistFull = normalizeArtist(artistInfo.full);

        if (candArtist === targetArtistNorm) {
            result.artistScore = 1.0;
            result.artistMatch = 'exact';
        } else if (candArtistFull === targetArtistNorm) {
            // MATCH EXACTO DEL NOMBRE COMPLETO (Recuperación de splits incorrectos)
            // Ej: "Tyler, The Creator" -> Split ["Tyler", "The Creator"]
            // candArtist="tyler", candArtistFull="tyler the creator" == target="tyler the creator"
            result.artistScore = 1.0;
            result.artistMatch = 'exact_full';
        } else if (candArtist.includes(targetArtistNorm)) {
            // Penalizar longitud extra en artista tambien
            // Ej: Target="Artist", Cand="Artist Vevo" -> Score alto
            // Ej: Target="Artist", Cand="Artist & Other" -> Score medio
            // Ej: Target="Artist", Cand="Artist Tribute Band" -> Score bajo (manejado arriba, pero aqui tambien por ratio)
            const ratio = targetArtistNorm.length / candArtist.length;
            result.artistScore = ratio >= 0.9 ? 0.95 : ratio;
            result.artistMatch = 'contains';
        } else if (targetArtistNorm.includes(candArtist)) {
            const ratio = candArtist.length / targetArtistNorm.length;
            result.artistScore = ratio >= 0.9 ? 0.95 : ratio;
            result.artistMatch = 'contains_reverse';
        } else if (allArtists.some(a => a.includes(targetArtistNorm) || targetArtistNorm.includes(a))) {
            result.artistScore = 0.90; // Colaborador directo encontrado
            result.artistMatch = 'collaborator';
        } else {
            const targetWords = targetArtistNorm.split(' ').filter(w => w.length > 2);
            const candWords = candArtist.split(' ');
            const matched = targetWords.filter(w => candWords.some(cw => cw.includes(w)));
            const ratio = matched.length / Math.max(targetWords.length, 1);
            result.artistScore = ratio * 0.8;
            result.artistMatch = ratio >= 0.5 ? 'partial' : 'none';
        }
    } else {
        result.artistScore = 0.5;
        result.artistMatch = 'no_target';
    }

    // DECISIÓN (artist centric, relajada)
    result.combinedScore = (result.artistScore * 0.6) + (result.titleScore * 0.4);

    // CRITERIOS DE PASO RELAJADOS (Más resultados)
    result.passed =
        result.artistScore >= 0.75 || // Era 0.8
        result.combinedScore >= 0.45 || // Era 0.5
        (result.artistScore >= 0.55 && result.titleScore >= 0.35); // Era 0.6 y 0.4

    return result;
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

    // FASE 2: VERSIÓN PROHIBIDA
    const version = detectVersion(candidate.name || candidate.title || '');

    if (version.isForbidden) {
        // EXCEPCIÓN: Si el usuario busca explícitamente "En Vivo" o "Live", permitimos la versión
        const targetWantsLive = /\b(live|en\s*vivo|concierto|vivo|directo)\b/i.test(targetTitle || '');
        let isLiveException = targetWantsLive && (version.type === 'live' || version.type === 'cover');

        // 🇵🇪 EXCEPCIÓN PERÚ (Cumbia/Salsa Friendly):
        // Permitimos versiones en vivo para artistas de cumbia/salsa donde el hit suele ser en vivo.
        // Lista blanca de artistas y palabras clave comunes en Perú.
        if (!isLiveException && version.type === 'live') {
            const artistLower = (extractArtistInfo(candidate).primary || '').toLowerCase();
            const LIVE_FRIENDLY_KEYWORDS = [
                'grupo 5', 'agua marina', 'armonía 10', 'armonia 10', 'corazón serrano', 'corazon serrano',
                'daniela darcourt', 'combinación de la habana', 'son tentación', 'josimar',
                'yahaira plasencia', 'gran orquesta', 'hermanos', 'orquesta', 'zaperoko',
                'septeto', 'papillón', 'deyvis orosco'
            ];

            const isFriendlyArtist = LIVE_FRIENDLY_KEYWORDS.some(kw => artistLower.includes(kw));

            if (isFriendlyArtist) {
                // Solo permitimos si la identidad del título es muy fuerte (evitar falsos positivos en vivo)
                // Se evaluará más adelante, por ahora levantamos el flag de rechazo.
                isLiveException = true;
                // Marcamos el detalle para penalizar score después, no rechazar.
                version.detail = 'live_exception_peru';
            }
        }

        if (!isLiveException) {
            return {
                passed: false,
                rejected: true,
                rejectReason: `forbidden_version:${version.type}`,
                scores: { identityScore: 0, versionScore: 0, durationScore: 0, albumScore: 0, finalConfidence: 0 },
                version,
                feats: []
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 5: VERSION MATCHING (FLEXIBLE)
    // Si el target pide remix, el candidato debe ser remix O contener 'remix' en título
    // ═══════════════════════════════════════════════════════════════════════════
    const targetLower = (targetTitle || '').toLowerCase();
    const candTitleLower = (candidate.name || candidate.title || '').toLowerCase();

    const targetWantsRemix = /\bremix\b/i.test(targetLower);
    const targetWantsRemaster = /\bremaster/i.test(targetLower);

    // Para remix: verificar detectVersion O que el título contenga 'remix'
    const candidateIsRemix = version.type === 'remix' || /\bremix\b/i.test(candTitleLower);
    const candidateIsRemaster = version.type === 'remaster' || /\bremaster/i.test(candTitleLower);

    if (targetWantsRemix && !candidateIsRemix) {
        return {
            passed: false,
            rejected: true,
            rejectReason: 'version_mismatch:wanted_remix',
            scores: { identityScore: 0, versionScore: 0, durationScore: 0, albumScore: 0, finalConfidence: 0 },
            version,
            feats: []
        };
    }

    if (targetWantsRemaster && !candidateIsRemaster) {
        return {
            passed: false,
            rejected: true,
            rejectReason: 'version_mismatch:wanted_remaster',
            scores: { identityScore: 0, versionScore: 0, durationScore: 0, albumScore: 0, finalConfidence: 0 },
            version,
            feats: []
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

    let versionScore = 1.0;

    if (version.type === 'original') versionScore = 1.0;
    else if (version.type === 'remaster') versionScore = 0.98;
    else if (version.type === 'radio_edit') versionScore = 0.95;
    else if (version.type === 'extended') versionScore = 0.90;
    else if (version.type === 'remix') versionScore = 0.90;
    else if (version.type === 'live' && version.detail === 'live_exception_peru') {
        // Penalización moderada para "En Vivo" aceptado (para que pierda contra estudio si existe)
        versionScore = 0.75;
    } else {
        versionScore = 0.9;
    }

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

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔐 FASE A: HARD TITLE CONSTRAINT (HTC) - ULTRA ESTRICTO
    // ═══════════════════════════════════════════════════════════════════════════

    const hasTargetTitle = !!(targetTitle && targetTitle.trim());

    if (hasTargetTitle) {
        // 🔐 MATCHING ADAPTATIVO 2.0:
        // El usuario quiere "exacto" pero que "encuentre todo".
        // ESTRATEGIA: Si el Artista es INDISCUTIBLEMENTE el correcto, permitimos variaciones menores en el título.
        // Si el Artista es solo un "match parcial", exigimos perfección en el título.

        const artistIsPerfect = identity.artistMatch === 'exact' || identity.artistMatch === 'exact_full';

        // Umbral dinámico:
        // - Artista Perfecto: 82% match en título (tolera errores de dedo, palabras extra irrelevantes)
        // - Artista Dudoso:   94% match en título (debe ser casi idéntico)
        const titleThreshold = artistIsPerfect ? 0.82 : 0.94;

        const isTitleAcceptable =
            identity.titleMatch === 'exact' ||
            identity.titleMatch === 'near_exact' ||
            identity.titleScore >= titleThreshold;

        if (!isTitleAcceptable) {
            return {
                passed: false,
                rejected: true,
                rejectReason: `title_mismatch_strict (score: ${identity.titleScore.toFixed(2)} < required: ${titleThreshold})`,
                scores: {
                    identityScore: Math.round(identityScore * 100) / 100,
                    versionScore: Math.round(versionScore * 100) / 100,
                    durationScore: Math.round(durationScore * 100) / 100,
                    albumScore: Math.round(context.albumScore * 100) / 100,
                    finalConfidence: 0
                },
                version,
                feats: extractFeats(candidate.name || candidate.title || ''),
                details: { identity, context }
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🏆 FASE B: SCORING / UMBRAL FINAL
    // ═══════════════════════════════════════════════════════════════════════════

    let passed;
    if (hasTargetTitle) {
        // MODO ULTRA ESTRICTO: 
        // 1. Identity Score debe ser >= 0.95
        // 2. Y el score de artista debe ser también muy alto (>= 0.9)
        passed = (identityScore >= 0.94 && identity.artistScore >= 0.90);
    } else {
        passed = identity.passed ||
            identityScore >= 0.35 ||
            (identityScore >= 0.25 && durationScore >= 0.7);
    }

    const feats = extractFeats(candidate.name || candidate.title || '');

    return {
        passed,
        rejected: false,
        rejectReason: null,
        scores: {
            identityScore: Math.round(identityScore * 100) / 100,
            versionScore: Math.round(versionScore * 100) / 100,
            durationScore: Math.round(durationScore * 100) / 100,
            albumScore: Math.round(context.albumScore * 100) / 100,
            finalConfidence: Math.round(finalConfidence * 100) / 100
        },
        version,
        feats,
        details: {
            identity,
            context
        }
    };
}

// Re-exportar funciones de normalización para conveniencia
export { normalizeText, normalizeArtist, cleanTitle };
