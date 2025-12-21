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

import { normalizeText } from '../normalization/normalize-text.js';
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
    // EDITS NO OFICIALES (rechazo inmediato) - NUEVO
    // ═══════════════════════════════════════════════════════════════════════════

    // Turreo Edit / Turreo Remix (género argentino modificado)
    if (/\bturreo\b/i.test(lower)) {
        return { type: 'turreo_edit', detail: 'turreo', isForbidden: true };
    }

    // RKT / Rkt (Reggaetón argentino modificado)
    if (/\brkt\b/i.test(lower) || /\brktero\b/i.test(lower)) {
        return { type: 'rkt_edit', detail: 'rkt', isForbidden: true };
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

/**
 * Detecta versión prohibida (legacy - para compatibilidad)
 * @deprecated Usar detectVersion() en su lugar
 */
export function detectForbiddenVersion(title) {
    const version = detectVersion(title);
    return version.isForbidden ? version.type : null;
}

/**
 * Detecta versión válida (legacy - para compatibilidad)
 * @deprecated Usar detectVersion() en su lugar
 */
export function detectValidVersion(title) {
    const version = detectVersion(title);
    if (version.isForbidden) return { type: null, details: null };
    return { type: version.type, details: version.detail };
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
    const title = (candidate.name || candidate.title || '').toLowerCase();
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

    const candTitle = normalizeText(cleanTitle(candidate.name || candidate.title || ''));
    const candArtist = normalizeText(extractArtistInfo(candidate).primary);
    const targetTitleNorm = normalizeText(targetTitle || '');
    const targetArtistNorm = normalizeText(targetArtist || '');

    // TÍTULO
    if (targetTitleNorm) {
        const targetWords = targetTitleNorm.split(' ').filter(w => w.length > 2);
        const candWords = candTitle.split(' ');

        if (candTitle === targetTitleNorm) {
            result.titleScore = 1.0;
            result.titleMatch = 'exact';
        } else if (candTitle.includes(targetTitleNorm) || targetTitleNorm.includes(candTitle)) {
            result.titleScore = 0.95;
            result.titleMatch = 'contains';
        } else if (targetWords.length > 0) {
            const matched = targetWords.filter(w => candWords.some(cw => cw.includes(w) || w.includes(cw)));
            const ratio = matched.length / targetWords.length;
            result.titleScore = ratio;
            result.titleMatch = ratio >= 0.7 ? 'partial_high' : ratio >= 0.4 ? 'partial_low' : 'none';
        }
    } else {
        result.titleScore = 0.5;
        result.titleMatch = 'no_target';
    }

    // ARTISTA (más importante que título)
    if (targetArtistNorm) {
        const artistInfo = extractArtistInfo(candidate);
        const allArtists = [artistInfo.primary, ...artistInfo.collaborators].map(a => normalizeText(a));

        if (candArtist === targetArtistNorm) {
            result.artistScore = 1.0;
            result.artistMatch = 'exact';
        } else if (candArtist.includes(targetArtistNorm) || targetArtistNorm.includes(candArtist)) {
            result.artistScore = 0.95;
            result.artistMatch = 'contains';
        } else if (allArtists.some(a => a.includes(targetArtistNorm) || targetArtistNorm.includes(a))) {
            result.artistScore = 0.85;
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

    // DECISIÓN (artista manda)
    result.combinedScore = (result.artistScore * 0.6) + (result.titleScore * 0.4);

    result.passed =
        result.artistScore >= 0.8 ||
        result.combinedScore >= 0.5 ||
        (result.artistScore >= 0.6 && result.titleScore >= 0.4);

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

        if (diff <= 5) result.durationScore = 1.0;
        else if (diff <= 15) result.durationScore = 0.9;
        else if (diff <= 30) result.durationScore = 0.75;
        else if (diff <= 60) result.durationScore = 0.5;
        else result.durationScore = 0.3;
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
        return {
            passed: false,
            rejected: true,
            rejectReason: `forbidden_version:${version.type}`,
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
    const versionScore = version.type === 'original' ? 1.0 :
        version.type === 'remaster' ? 0.98 :
            version.type === 'remix' ? 0.85 :
                version.type === 'radio_edit' ? 0.95 : 0.9;
    const durationScore = context.durationScore;

    // Pesos dinámicos
    const hasTargetAlbum = !!(targetAlbum && targetAlbum.trim());
    const hasTargetDuration = targetDuration > 0;

    const weights = {
        identity: 0.55,
        version: 0.15,
        duration: hasTargetDuration ? 0.25 : 0.05,
        album: hasTargetAlbum ? 0.05 : 0.00
    };

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

    const finalConfidence = (
        (identityScore * weights.identity) +
        (versionScore * weights.version) +
        (durationScore * weights.duration) +
        (context.albumScore * weights.album)
    ) / totalWeight;

    // DECISIÓN FINAL
    const passed =
        identity.passed ||
        identityScore >= 0.4 ||
        (identityScore >= 0.3 && durationScore >= 0.7);

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
export { normalizeText, cleanTitle };
