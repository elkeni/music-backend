/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 MUSIC SEARCH ENGINE v5.1 - STUDIO QUALITY ONLY
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * REGLA DE ORO: Solo música de estudio
 * 
 * ✅ PERMITIDO:
 *    - Singles, álbumes, EPs oficiales
 *    - Remixes oficiales
 *    - Remasters oficiales
 *    - Radio edits
 *    - Extended versions
 * 
 * ❌ PROHIBIDO (rechazo inmediato):
 *    - Live versions
 *    - Acoustic versions
 *    - Unplugged
 *    - Covers
 *    - Karaoke
 *    - Instrumental
 *    - Sped up / Slowed
 *    - Nightcore
 *    - Tribute versions
 * 
 * PIPELINE:
 *    FASE 1: Identidad primaria (artista manda)
 *    FASE 2: Detección de versión PROHIBIDA → rechazo
 *    FASE 3: Contexto musical (duración, álbum)
 *    FASE 4: Decisión final basada en identidad
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const config = { runtime: 'nodejs' };

const SOURCE_API = 'https://appmusic-phi.vercel.app';

// ═══════════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════════

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    return await fn(req, res);
};

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

const LEET_MAP = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' };

function normalize(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split('').map(c => LEET_MAP[c] || c).join('')
        .replace(/&/g, ' and ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanEditorialNoise(text) {
    if (!text) return text;
    return text
        .replace(/\(official\s*(music\s*)?video\)/gi, '')
        .replace(/\(official\s*audio\)/gi, '')
        .replace(/\(official\)/gi, '')
        .replace(/\(lyrics?\s*(video)?\)/gi, '')
        .replace(/\(audio\s*(oficial)?\)/gi, '')
        .replace(/\(video\s*(oficial|clip)?\)/gi, '')
        .replace(/\[official.*?\]/gi, '')
        .replace(/\[lyrics?\]/gi, '')
        .replace(/\[audio\]/gi, '')
        .replace(/\(hd|hq|4k|1080p?\)/gi, '')
        .replace(/\[hd|hq|4k\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERSIONES PROHIBIDAS VS PERMITIDAS
// ═══════════════════════════════════════════════════════════════════════════════

// Versiones que causan RECHAZO INMEDIATO (no son de estudio)
const FORBIDDEN_VERSIONS = [
    'live', 'acoustic', 'unplugged', 'cover', 'karaoke',
    'instrumental', 'sped_up', 'slowed', 'nightcore', 'demo',
    'tribute', 'en_vivo', 'acustico'
];

// Versiones PERMITIDAS (son de estudio o ediciones oficiales)
const ALLOWED_VERSIONS = ['remix', 'remaster', 'radio_edit', 'extended', 'original'];

/**
 * Detecta el tipo de versión de una canción
 * @returns {{ type: string, detail: string|null, isForbidden: boolean }}
 */
function detectVersion(title) {
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
    // VERSIONES PERMITIDAS
    // ═══════════════════════════════════════════════════════════════════════════

    // Remix (PERMITIDO)
    if (/\bremix\b/i.test(lower)) {
        const match = title.match(/\(([^)]*remix[^)]*)\)/i) || title.match(/\[([^\]]*remix[^\]]*)\]/i);
        return { type: 'remix', detail: match ? match[1].trim() : null, isForbidden: false };
    }

    // Remaster (PERMITIDO)
    if (/\bremaster(ed)?\b/i.test(lower)) {
        const yearMatch = title.match(/(\d{4})\s*remaster/i) || title.match(/remaster(ed)?\s*(\d{4})/i);
        return { type: 'remaster', detail: yearMatch ? (yearMatch[1] || yearMatch[2]) : null, isForbidden: false };
    }

    // Radio Edit (PERMITIDO)
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
// CONTENIDO BASURA (rechazo por artista/contenido)
// ═══════════════════════════════════════════════════════════════════════════════

const TRASH_ARTISTS = [
    'kidz bop', 'rockabye baby', 'vitamin string quartet', 'piano tribute',
    'baby einstein', 'lullaby', 'sweet little band', 'twinkle twinkle'
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
];

function isTrashContent(candidate) {
    const title = (candidate.name || '').toLowerCase();
    const artist = normalize(extractArtistInfo(candidate).full);

    // Artistas basura
    for (const trash of TRASH_ARTISTS) {
        if (artist.includes(trash)) return { isTrash: true, reason: `trash_artist:${trash}` };
    }

    // Patrones basura en título
    for (const pattern of TRASH_PATTERNS) {
        if (pattern.test(title)) return { isTrash: true, reason: 'trash_content' };
    }

    return { isTrash: false, reason: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE ARTISTA
// ═══════════════════════════════════════════════════════════════════════════════

function extractArtistInfo(item) {
    let primary = '';
    const collaborators = [];

    if (item.primaryArtists?.trim()) {
        primary = item.primaryArtists.trim();
    } else if (item.artist && typeof item.artist === 'string') {
        primary = item.artist.trim();
    } else if (Array.isArray(item.artists?.primary)) {
        const names = item.artists.primary.map(a => a.name || a).filter(Boolean);
        primary = names[0] || '';
        if (names.length > 1) collaborators.push(...names.slice(1));
    } else if (Array.isArray(item.artists)) {
        const names = item.artists.map(a => a.name || a).filter(Boolean);
        primary = names[0] || '';
        if (names.length > 1) collaborators.push(...names.slice(1));
    } else if (typeof item.artists === 'string') {
        primary = item.artists.trim();
    } else if (item.subtitle?.trim()) {
        primary = item.subtitle.trim();
    }

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

function extractFeats(title) {
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
// FASE 1: IDENTIDAD PRIMARIA (artista manda)
// ═══════════════════════════════════════════════════════════════════════════════

function evaluatePrimaryIdentity(candidate, targetArtist, targetTitle) {
    const result = {
        passed: false,
        titleScore: 0,
        artistScore: 0,
        combinedScore: 0,
        titleMatch: 'none',
        artistMatch: 'none'
    };

    const candTitle = normalize(cleanEditorialNoise(candidate.name || ''));
    const candArtist = normalize(extractArtistInfo(candidate).primary);
    const targetTitleNorm = normalize(targetTitle || '');
    const targetArtistNorm = normalize(targetArtist || '');

    // ═══════════════════════════════════════════════════════════════════════════
    // TÍTULO
    // ═══════════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════════
    // ARTISTA (más importante que título)
    // ═══════════════════════════════════════════════════════════════════════════
    if (targetArtistNorm) {
        const artistInfo = extractArtistInfo(candidate);
        const allArtists = [artistInfo.primary, ...artistInfo.collaborators].map(a => normalize(a));

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
            // Match por palabras
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

    // ═══════════════════════════════════════════════════════════════════════════
    // DECISIÓN (artista manda)
    // ═══════════════════════════════════════════════════════════════════════════
    // Pesos: artista 60%, título 40%
    result.combinedScore = (result.artistScore * 0.6) + (result.titleScore * 0.4);

    // REGLA CLAVE: Si artista >= 0.8, pasar aunque título sea débil
    result.passed =
        result.artistScore >= 0.8 ||  // Artista fuerte siempre pasa
        result.combinedScore >= 0.5 || // Score combinado decente
        (result.artistScore >= 0.6 && result.titleScore >= 0.4); // Ambos decentes

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3: CONTEXTO MUSICAL
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateMusicalContext(candidate, targetDuration, targetAlbum) {
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

    // Rechazar videos muy largos (compilaciones)
    if (candDuration > 600 && targetDur > 0 && targetDur < 400) {
        result.durationScore = 0.1;
    }

    // ÁLBUM (solo si viene explícito)
    const candAlbum = normalize(candidate.album?.name || candidate.album || '');
    const targetAlbumNorm = normalize(targetAlbum || '');

    if (targetAlbumNorm && candAlbum) {
        if (candAlbum === targetAlbumNorm || candAlbum.includes(targetAlbumNorm) || targetAlbumNorm.includes(candAlbum)) {
            result.albumScore = 1.0;
            result.albumMatch = 'match';
        } else {
            result.albumScore = 0.4;
            result.albumMatch = 'different';
        }
    }
    // Si no hay targetAlbum, albumScore queda en 0.5 (neutral)

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUACIÓN COMPLETA DE CANDIDATO
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateCandidate(candidate, params) {
    const { targetArtist, targetTitle, targetDuration, targetAlbum } = params;

    // ═══════════════════════════════════════════════════════════════════════════
    // PRE-FILTRO: Contenido basura
    // ═══════════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 2: VERSIÓN PROHIBIDA (rechazo inmediato)
    // ═══════════════════════════════════════════════════════════════════════════
    const version = detectVersion(candidate.name || '');

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

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 1: IDENTIDAD PRIMARIA
    // ═══════════════════════════════════════════════════════════════════════════
    const identity = evaluatePrimaryIdentity(candidate, targetArtist, targetTitle);

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 3: CONTEXTO MUSICAL
    // ═══════════════════════════════════════════════════════════════════════════
    const context = evaluateMusicalContext(candidate, targetDuration, targetAlbum);

    // ═══════════════════════════════════════════════════════════════════════════
    // CALCULAR SCORES
    // ═══════════════════════════════════════════════════════════════════════════
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
        album: hasTargetAlbum ? 0.05 : 0.00  // Peso casi cero si no hay target
    };

    // Normalizar pesos
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

    const finalConfidence = (
        (identityScore * weights.identity) +
        (versionScore * weights.version) +
        (durationScore * weights.duration) +
        (context.albumScore * weights.album)
    ) / totalWeight;

    // ═══════════════════════════════════════════════════════════════════════════
    // DECISIÓN FINAL (basada en identidad, no binaria)
    // ═══════════════════════════════════════════════════════════════════════════
    const passed =
        identity.passed || // FASE 1 pasó
        identityScore >= 0.4 || // Identidad decente
        (identityScore >= 0.3 && durationScore >= 0.7); // Identidad baja pero duración correcta

    const feats = extractFeats(candidate.name || '');

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

// ═══════════════════════════════════════════════════════════════════════════════
// API DE BÚSQUEDA
// ═══════════════════════════════════════════════════════════════════════════════

async function searchApi(query, limit = 30) {
    try {
        const url = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 15000);

        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);

        if (!res.ok) return [];
        const data = await res.json();
        return data?.data?.results || [];
    } catch (e) {
        console.log('[search] Error:', e.message);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    const query = req.query.q || req.query.query || '';
    const limit = parseInt(req.query.limit) || 10;

    const params = {
        targetTitle: req.query.track || req.query.title || '',
        targetArtist: req.query.artist || '',
        targetAlbum: req.query.album || '',
        targetDuration: parseInt(req.query.duration) || 0
    };

    if (!query) {
        return res.status(400).json({ success: false, error: 'Missing q parameter' });
    }

    console.log(`[search] "${query}" | artist="${params.targetArtist}" track="${params.targetTitle}"`);

    // Buscar
    const rawResults = await searchApi(query, limit * 3);

    // Evaluar
    const evaluated = [];
    const rejected = [];

    for (const item of rawResults) {
        const evaluation = evaluateCandidate(item, params);

        const result = {
            title: item.name || '',
            artist: extractArtistInfo(item).full,
            album: item.album?.name || item.album || null,
            duration: item.duration || 0,
            year: item.year || item.releaseDate?.substring(0, 4) || null,
            videoId: item.id,
            thumbnail: item.image?.find(i => i.quality === '500x500')?.url || item.image?.[0]?.url || '',
            source: 'youtube',
            evaluation
        };

        if (evaluation.passed) {
            evaluated.push(result);
        } else {
            rejected.push({
                title: result.title,
                artist: result.artist,
                reason: evaluation.rejectReason,
                identityScore: evaluation.scores.identityScore
            });
        }
    }

    // Ordenar por confidence
    evaluated.sort((a, b) => b.evaluation.scores.finalConfidence - a.evaluation.scores.finalConfidence);

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK: Nunca devolver 0 resultados válidos
    // ═══════════════════════════════════════════════════════════════════════════
    let results = evaluated.slice(0, limit);

    if (results.length === 0 && rejected.length > 0) {
        // Buscar rechazados que NO son versiones prohibidas y tienen identidad decente
        const salvageable = rejected
            .filter(r =>
                !r.reason?.startsWith('forbidden_version') &&
                r.identityScore >= 0.35
            )
            .slice(0, 3);

        // Reconstruir con confidence bajo
        for (const rej of salvageable) {
            const originalItem = rawResults.find(r => (r.name || '') === rej.title);
            if (originalItem) {
                results.push({
                    title: originalItem.name || '',
                    artist: extractArtistInfo(originalItem).full,
                    album: originalItem.album?.name || originalItem.album || null,
                    duration: originalItem.duration || 0,
                    year: originalItem.year || originalItem.releaseDate?.substring(0, 4) || null,
                    videoId: originalItem.id,
                    thumbnail: originalItem.image?.find(i => i.quality === '500x500')?.url || originalItem.image?.[0]?.url || '',
                    source: 'youtube',
                    evaluation: {
                        passed: false,
                        scores: {
                            identityScore: rej.identityScore,
                            versionScore: 0.5,
                            durationScore: 0.5,
                            albumScore: 0.5,
                            finalConfidence: Math.max(0.3, rej.identityScore * 0.8)
                        },
                        version: { type: 'unknown', detail: null, isForbidden: false },
                        feats: [],
                        details: { fallback: true, originalRejection: rej.reason }
                    }
                });
            }
        }
        if (results.length > 0) {
            console.log(`[search] FALLBACK: rescued ${results.length} from rejected`);
        }
    }

    // Stats
    const exactMatches = results.filter(r => r.evaluation.scores.finalConfidence >= 0.85).length;
    const goodMatches = results.filter(r => r.evaluation.scores.finalConfidence >= 0.6).length;

    console.log(`[search] ${results.length} results | ${exactMatches} exact | ${goodMatches} good | ${rejected.length} rejected`);

    return res.status(200).json({
        success: true,
        query,
        params,
        stats: {
            totalCandidates: rawResults.length,
            passed: evaluated.length,
            rejected: rejected.length,
            exactMatches,
            goodMatches
        },
        results: results.map(r => ({
            title: r.title,
            artist: r.artist,
            album: r.album,
            duration: r.duration,
            year: r.year,
            videoId: r.videoId,
            thumbnail: r.thumbnail,
            source: r.source,
            scores: r.evaluation.scores,
            version: r.evaluation.version,
            feats: r.evaluation.feats
        })),
        rejectedSample: rejected.slice(0, 5)
    });
}

export default allowCors(handler);
