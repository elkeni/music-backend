/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 MUSIC SEARCH ENGINE v4.0 - REFACTORED & OPTIMIZED
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * PIPELINE v4.0:
 * FASE 0: Normalización
 * FASE 1: Identidad primaria (artista + título)
 * FASE 2: Detección de versión PROHIBIDA
 * FASE 3: Autoridad del canal
 * FASE 4: Remix oficial vs trucho
 * FASE 5: Decisión FINAL
 * FASE 6: Regla UX (nunca vacío, nunca covers)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const config = { runtime: 'nodejs' };

const SOURCE_API = 'https://appmusic-phi.vercel.app';

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const searchCache = new Map();
const frozenDecisions = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h
const FREEZE_TTL = 1000 * 60 * 60 * 24 * 30; // 30 días
const MIN_CONFIDENCE_TO_CACHE = 0.7;
const MIN_CONFIDENCE_TO_FREEZE = 0.85;

// Limpieza automática cada hora
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of searchCache) {
        if (now - val.timestamp > CACHE_TTL) searchCache.delete(key);
    }
    for (const [key, val] of frozenDecisions) {
        if (now - val.timestamp > FREEZE_TTL) frozenDecisions.delete(key);
    }
}, 1000 * 60 * 60);

// ═══════════════════════════════════════════════════════════════════════════════
// CORS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    return await fn(req, res);
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE NORMALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

const LEET_MAP = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' };

function normalize(text) {
    if (!text) return '';
    let r = text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split('').map(c => LEET_MAP[c] || c).join('')
        .replace(/&/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return r;
}

function buildCacheKey({ title, artist, duration }) {
    return [normalize(title || ''), normalize(artist || ''), Math.round(duration || 0)].join('|');
}

const NOISE_PATTERNS = [
    /\(official\s*(music\s*)?video\)/gi, /\(official\s*audio\)/gi, /\(official\)/gi,
    /\(lyrics?\s*(video)?\)/gi, /\(audio\s*(oficial)?\)/gi, /\(video\s*(oficial|clip)?\)/gi,
    /\(hd|hq|4k|1080p?\)/gi, /\(explicit\)/gi, /\(clean\s*version\)/gi,
    /\(from\s+[^)]+\)/gi, /\[official\s*(music\s*)?video\]/gi, /\[hd|hq|4k\]/gi,
    /\[lyrics?\]/gi, /\[audio\]/gi, /\[explicit\]/gi,
];

function cleanTitle(text) {
    if (!text) return '';
    let clean = text;
    for (const p of NOISE_PATTERNS) clean = clean.replace(p, '');
    return clean.replace(/\s+/g, ' ').trim();
}

function splitArtists(str) {
    if (!str) return [];
    return str.split(/[,&]|\s+(?:and|y|feat\.?|ft\.?|featuring|with|x)\s+/gi)
        .map(a => normalize(a)).filter(a => a.length > 1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERSIONES PROHIBIDAS
// ═══════════════════════════════════════════════════════════════════════════════

const FORBIDDEN_PATTERNS = [
    { p: /\blive\b/i, n: 'live' }, { p: /\ben\s*vivo\b/i, n: 'en vivo' },
    { p: /\bconcierto\b/i, n: 'concierto' }, { p: /\bconcert\b/i, n: 'concert' },
    { p: /\blive\s+(at|from)\b/i, n: 'live venue' },
    { p: /\b(at|from)\s+(the\s+)?(o2|wembley|stadium|arena|festival|mtv|bbc)/i, n: 'venue' },
    { p: /\bacoustic\b/i, n: 'acoustic' }, { p: /\bacustic[ao]?\b/i, n: 'acustico' },
    { p: /\bunplugged\b/i, n: 'unplugged' }, { p: /\bstripped\b/i, n: 'stripped' },
    { p: /\bcover\b/i, n: 'cover' }, { p: /\btribute\b/i, n: 'tribute' },
    { p: /\bin\s*the\s*style\s*of\b/i, n: 'style of' },
    { p: /\bperformed\s*by\b/i, n: 'performed by' },
    { p: /\boriginally\s*(performed\s*)?by\b/i, n: 'originally by' },
    { p: /\bkaraoke\b/i, n: 'karaoke' }, { p: /\binstrumental\b/i, n: 'instrumental' },
    { p: /\bbacking\s*track\b/i, n: 'backing track' },
    { p: /\bsped\s*up\b/i, n: 'sped up' }, { p: /\bspeed\s*up\b/i, n: 'speed up' },
    { p: /\bnightcore\b/i, n: 'nightcore' }, { p: /\bslowed\b/i, n: 'slowed' },
    { p: /\b8d\s*audio\b/i, n: '8d audio' }, { p: /\bchipmunk\b/i, n: 'chipmunk' },
    { p: /\blullaby\b/i, n: 'lullaby' }, { p: /\bdemo\b/i, n: 'demo' },
];

const EDITORIAL_NOISE = [
    /\bofficial\s*(music\s*)?video\b/i, /\bofficial\s*audio\b/i, /\bofficial\b/i,
    /\boficial\b/i, /\b(audio|video)\s*oficial\b/i, /\blyrics?\b/i,
    /\bhd\b/i, /\bhq\b/i, /\b4k\b/i, /\bexplicit\b/i,
];

function detectForbiddenVersion(title) {
    if (!title) return null;
    const lower = title.toLowerCase();
    if (/\bremaster(ed)?\b/i.test(lower)) return null; // Remaster siempre válido

    let clean = lower;
    for (const p of EDITORIAL_NOISE) clean = clean.replace(p, ' ');
    clean = clean.replace(/\s+/g, ' ').trim();

    if (/\bremix\b/i.test(lower)) return null; // Remix se evalúa después

    for (const { p, n } of FORBIDDEN_PATTERNS) {
        if (p.test(clean)) {
            // Excepción: "live" solo como palabra puede ser parte del título
            if (n === 'live' && !/\blive\s+(at|from|in|on)\b/i.test(lower)) continue;
            return n;
        }
    }
    return null;
}

function detectValidVersion(title) {
    if (!title) return { type: 'original', details: null };
    const lower = title.toLowerCase();

    if (/\bremix\b/i.test(lower)) {
        const m = title.match(/\(([^)]+)\s*remix\)/i) || title.match(/\[([^\]]+)\s*remix\]/i);
        return { type: 'remix', details: m ? m[1].trim() : null };
    }
    if (/\bremaster(ed)?\b/i.test(lower)) {
        const m = title.match(/(\d{4})\s*remaster/i) || title.match(/remaster(ed)?\s*(\d{4})/i);
        return { type: 'remaster', details: m ? (m[1] || m[2]) : null };
    }
    if (/\bradio\s*(edit|version)\b/i.test(lower)) return { type: 'radio_edit', details: null };
    if (/\bextended\b/i.test(lower)) return { type: 'extended', details: null };
    if (/\b(single|album)\s*version\b/i.test(lower)) return { type: 'album_version', details: null };
    return { type: 'original', details: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE ARTISTA
// ═══════════════════════════════════════════════════════════════════════════════

function extractFeaturing(title) {
    if (!title) return [];
    const feat = [];
    const patterns = [/\(?feat\.?\s+([^)(\[\]]+)\)?/gi, /\(?ft\.?\s+([^)(\[\]]+)\)?/gi,
        /\(?featuring\s+([^)(\[\]]+)\)?/gi, /\(?with\s+([^)(\[\]]+)\)?/gi];
    for (const p of patterns) {
        let m;
        while ((m = p.exec(title)) !== null) {
            if (m[1]) feat.push(...m[1].split(/[,&]/).map(a => a.trim()).filter(a => a.length > 1));
        }
    }
    return [...new Set(feat)];
}

function extractArtistName(item) {
    if (item.primaryArtists?.trim()) return item.primaryArtists.trim();
    if (item.artist && typeof item.artist === 'string') return item.artist.trim();
    if (item.artists) {
        if (Array.isArray(item.artists.primary)) {
            const names = item.artists.primary.map(a => a.name || a).filter(Boolean);
            if (names.length) return names.join(', ');
        }
        if (Array.isArray(item.artists)) {
            const names = item.artists.map(a => a.name || a).filter(Boolean);
            if (names.length) return names.join(', ');
        }
        if (typeof item.artists === 'string') return item.artists.trim();
    }
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

// ═══════════════════════════════════════════════════════════════════════════════
// DÚOS Y ARTISTAS CONOCIDOS
// ═══════════════════════════════════════════════════════════════════════════════

const KNOWN_DUOS = {
    'ca7riel & paco amoroso': { members: ['ca7riel', 'catriel', 'paco amoroso', 'paco'], canonical: 'CA7RIEL & Paco Amoroso' },
    'daft punk': { members: ['daft punk', 'thomas bangalter', 'guy-manuel'], canonical: 'Daft Punk' },
    'silk sonic': { members: ['silk sonic', 'bruno mars', 'anderson paak'], canonical: 'Silk Sonic' },
};

const KNOWN_ARTISTS = {
    'mana': ['mana', 'maná'], 'radiohead': ['radiohead'], 'coldplay': ['coldplay'],
    'ca7riel': ['catriel', 'ca7riel'], 'shakira': ['shakira'], 'bad bunny': ['bad bunny'],
    'daddy yankee': ['daddy yankee'], 'duki': ['duki'], 'bizarrap': ['bizarrap', 'bzrp'],
    'taylor swift': ['taylor swift'], 'the weeknd': ['weeknd', 'the weeknd'],
    'queen': ['queen'], 'nirvana': ['nirvana'], 'metallica': ['metallica'],
    'ac dc': ['acdc', 'ac dc', 'ac/dc'], 'linkin park': ['linkin park'],
    'arctic monkeys': ['arctic monkeys'], 'imagine dragons': ['imagine dragons'],
    'bruno mars': ['bruno mars'], 'ed sheeran': ['ed sheeran'],
    'drake': ['drake'], 'eminem': ['eminem'], 'kendrick lamar': ['kendrick lamar'],
    'dua lipa': ['dua lipa'], 'billie eilish': ['billie eilish'],
    'ariana grande': ['ariana grande'], 'lady gaga': ['lady gaga'],
    'j balvin': ['j balvin'], 'karol g': ['karol g'], 'feid': ['feid'],
    'peso pluma': ['peso pluma'], 'rauw alejandro': ['rauw alejandro'],
};

function detectDuo(artistString) {
    if (!artistString) return null;
    const norm = normalize(artistString);
    const hasSep = /[&]|\s+y\s+|\s+and\s+/i.test(artistString);

    for (const [key, duo] of Object.entries(KNOWN_DUOS)) {
        if (norm.includes(normalize(key))) return { isDuo: true, members: duo.members, canonical: duo.canonical };
        for (const m of duo.members) {
            if (hasSep && norm.includes(normalize(m))) return { isDuo: true, members: duo.members, canonical: duo.canonical };
        }
    }

    if (hasSep) {
        const parts = artistString.split(/[&]|\s+y\s+|\s+and\s+/i).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) return { isDuo: true, members: parts.map(normalize), canonical: artistString };
    }
    return null;
}

function detectKnownArtist(query) {
    const qNorm = normalize(query);
    const hasDuoSep = /[&]|\s+y\s+/i.test(query);

    if (hasDuoSep) {
        const duo = detectDuo(query);
        if (duo) return { artist: duo.canonical, track: '', isDuo: true, duoMembers: duo.members };
        return { artist: null, track: query, isDuo: true };
    }

    let best = null, bestLen = 0, cleanQ = query;
    for (const [name, aliases] of Object.entries(KNOWN_ARTISTS)) {
        for (const alias of aliases) {
            if (new RegExp(`\\b${alias}\\b`, 'i').test(qNorm) && alias.length > bestLen) {
                best = name;
                bestLen = alias.length;
                cleanQ = query.replace(new RegExp(alias, 'gi'), '').replace(/\s+/g, ' ').trim();
            }
        }
    }
    return { artist: best, track: cleanQ, isDuo: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTRO DE BASURA
// ═══════════════════════════════════════════════════════════════════════════════

const TRASH_ARTISTS = ['sweet little band', 'rockabye baby', 'lullaby', 'kidz bop', 'piano tribute', 'cover band'];
const TRASH_PATTERNS = ['ringtone', 'tono de llamada', 'music box', 'tutorial', 'midi version'];

function isTrashContent(candidate, targetDuration = 0) {
    const title = (candidate.name || '').toLowerCase();
    const artist = normalize(extractArtistName(candidate) || '');

    for (const t of TRASH_ARTISTS) if (artist.includes(t)) return true;
    for (const t of TRASH_PATTERNS) if (title.includes(t)) return true;
    if ((candidate.duration || 0) > 900 && targetDuration > 0) return true;
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3: AUTORIDAD DEL CANAL
// ═══════════════════════════════════════════════════════════════════════════════

const COVER_INDICATORS = ['cover', 'tribute', 'instrumental', 'karaoke', 'acoustic', 'live', 'remake', 'performed by', 'homenaje'];
const KNOWN_LABELS = ['sony music', 'universal music', 'warner music', 'emi', 'atlantic', 'columbia', 'interscope', 'def jam', 'republic', 'rca records', 'capitol records'];

function evaluateChannelAuthority(candidate, targetArtist, identityScore = 0) {
    const channel = (candidate.channelTitle || candidate.subtitle || candidate.label || '').toLowerCase();
    const desc = (candidate.description || candidate.more_info?.copyright_text || '').toLowerCase();
    const artistNorm = normalize(targetArtist || '');

    // HIGH: Canal oficial
    if (artistNorm && channel.includes(artistNorm)) return { level: 'HIGH', score: 1.0, reasons: ['channel_has_artist'] };
    if (channel.includes('vevo') || channel.endsWith('- topic') || channel.includes('official'))
        return { level: 'HIGH', score: 1.0, reasons: ['official_channel'] };
    if (desc.includes('℗') || desc.includes('©')) return { level: 'HIGH', score: 1.0, reasons: ['copyright_symbols'] };
    for (const label of KNOWN_LABELS) {
        if (channel.includes(label) || desc.includes(label)) return { level: 'HIGH', score: 1.0, reasons: [`label:${label}`] };
    }

    // MEDIUM: Sin flags de cover + identidad alta
    let hasCover = false;
    for (const ind of COVER_INDICATORS) {
        if (channel.includes(ind) || desc.includes(ind)) { hasCover = true; break; }
    }
    if (!hasCover && identityScore >= 0.85) return { level: 'MEDIUM', score: 0.6, reasons: ['no_cover_flags_high_identity'] };

    // LOW
    return { level: 'LOW', score: 0.0, reasons: hasCover ? ['has_cover_indicators'] : ['no_authority'] };
}

function detectImplicitCover(authority, titleScore, artistScore) {
    if (authority.level === 'LOW' && titleScore >= 0.9 && artistScore >= 0.8)
        return { isImplicitCover: true, reason: `implicit_cover_low_authority (t:${titleScore.toFixed(2)}, a:${artistScore.toFixed(2)})` };
    return { isImplicitCover: false, reason: null };
}

function evaluateRemixValidity(isRemix, authority, artistScore) {
    if (!isRemix) return { isValid: true, reason: 'not_a_remix' };
    if (authority.level === 'HIGH') return { isValid: true, reason: 'official_remix' };
    if (authority.level === 'MEDIUM' && artistScore >= 0.9) return { isValid: true, reason: 'semi_official_remix' };
    return { isValid: false, reason: `unofficial_remix_${authority.level.toLowerCase()}` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 1: IDENTIDAD PRIMARIA
// ═══════════════════════════════════════════════════════════════════════════════

function evaluatePrimaryIdentity(candidate, targetArtist, targetTitle) {
    const details = { titleMatch: 'none', artistMatch: 'none', titleScore: 0, artistScore: 0, isDuoMatch: false, rejectionReason: null };

    const candTitle = normalize(cleanTitle(candidate.name || ''));
    const candArtist = normalize(extractArtistName(candidate) || '');

    let targetClean = targetTitle || '';
    for (const bad of ['live', 'concert', 'vivo', 'cover', 'karaoke', 'instrumental'])
        targetClean = targetClean.replace(new RegExp(`\\b${bad}\\b`, 'gi'), '');
    const targetTitleNorm = normalize(cleanTitle(targetClean));
    const targetArtistNorm = normalize(targetArtist || '');

    // Validar artista
    let artistPass = false;
    const duo = detectDuo(targetArtist || '');

    if (duo) {
        if (duo.members.some(m => candArtist.includes(normalize(m))) || candArtist.includes(normalize(duo.canonical))) {
            artistPass = true;
            details.isDuoMatch = true;
        }
    } else {
        if (candArtist.includes(targetArtistNorm) || targetArtistNorm.includes(candArtist)) {
            artistPass = true;
        } else {
            const tTokens = targetArtistNorm.split(' ').filter(t => t.length > 1);
            const cTokens = candArtist.split(' ');
            const matchCount = tTokens.filter(t => cTokens.some(c => c.includes(t))).length;
            if (tTokens.length > 0 && (matchCount / tTokens.length) >= 0.6) artistPass = true;
        }
    }

    // Remix override: si el artista aparece en el título como remixer
    if (!artistPass && targetArtistNorm && /\bremix\b/i.test(candTitle) && candTitle.includes(targetArtistNorm)) artistPass = true;

    if (!artistPass) return { score: 0, details: { ...details, rejectionReason: 'WRONG_ARTIST' } };
    details.artistScore = 1.0;

    // Validar título
    const targetTokens = targetTitleNorm.split(' ').filter(w => w.length > 2);
    if (targetTokens.length === 0) {
        if (!candTitle.includes(targetTitleNorm)) return { score: 0, details: { ...details, rejectionReason: 'WRONG_TITLE_SHORT' } };
    } else {
        let miss = 0;
        for (const t of targetTokens) if (!candTitle.includes(t)) miss++;
        const allowed = targetTokens.length > 3 ? 1 : 0;
        if (miss > allowed) return { score: 0, details: { ...details, rejectionReason: 'WRONG_TITLE_MISMATCH' } };
    }

    details.titleScore = 1.0;
    return { score: 1.0, details };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXTO MUSICAL
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateMusicalContext(candidate, targetDuration, targetAlbum) {
    const details = { durationDiff: null, durationScore: 1.0, albumMatch: 'unknown', albumScore: 0.5 };
    const candDur = candidate.duration || 0;

    if (targetDuration > 0 && candDur > 0) {
        const diff = Math.abs(candDur - targetDuration);
        details.durationDiff = diff;
        details.durationScore = diff <= 5 ? 1.0 : diff <= 15 ? 0.9 : diff <= 30 ? 0.75 : diff <= 60 ? 0.5 : 0.3;
    }

    const albumName = normalize(candidate.album?.name || candidate.album || '');
    const targetAlbumNorm = normalize(targetAlbum || '');
    if (targetAlbumNorm && albumName) {
        if (albumName.includes(targetAlbumNorm) || targetAlbumNorm.includes(albumName)) {
            details.albumMatch = 'exact';
            details.albumScore = 1.0;
        }
    }

    const durW = targetDuration > 0 ? 0.8 : 0;
    const albW = targetAlbumNorm ? 0.2 : 0;
    const score = (details.durationScore * durW) + (details.albumScore * albW) + (1.0 * (1 - durW - albW));
    return { score: Math.max(0, Math.min(1, score)), details };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUACIÓN COMPLETA
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateCandidate(candidate, params) {
    const { targetArtist, targetTitle, targetDuration, targetAlbum } = params;
    const title = candidate.name || '';
    const reject = (reason, extra = {}) => ({
        passed: false, rejected: true, rejectReason: reason, identityScore: 0, authorityScore: 0,
        authorityLevel: 'LOW', finalConfidence: 0, matchDetails: { reason, ...extra }
    });

    // Pre-filtros
    if (isTrashContent(candidate, targetDuration)) return reject('trash_content');
    const words = title.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length < 2 && !/[()-]/.test(title)) return reject('title_too_short');

    // Fase 1: Identidad
    const phase1 = evaluatePrimaryIdentity(candidate, targetArtist, targetTitle);
    if (phase1.details.rejectionReason) return reject(phase1.details.rejectionReason);

    // Fase 2: Versión prohibida
    const forbidden = detectForbiddenVersion(title);
    if (forbidden) return { ...reject('forbidden_version'), forbiddenType: forbidden, identityScore: phase1.score };

    // Fase 3: Autoridad
    const authority = evaluateChannelAuthority(candidate, targetArtist, phase1.score);

    // Fase 3.2: Cover implícito
    const implicit = detectImplicitCover(authority, phase1.details.titleScore, phase1.details.artistScore);
    if (implicit.isImplicitCover) return { ...reject('implicit_cover'), identityScore: phase1.score, authorityScore: authority.score, authorityLevel: authority.level };

    // Fase 4: Remix válido
    const isRemix = /\bremix\b/i.test(title);
    const remix = evaluateRemixValidity(isRemix, authority, phase1.details.artistScore);
    if (!remix.isValid) return { ...reject('unofficial_remix'), identityScore: phase1.score, authorityScore: authority.score, authorityLevel: authority.level };

    // Contexto musical
    const version = detectValidVersion(title);
    const context = evaluateMusicalContext(candidate, targetDuration, targetAlbum);

    // Fase 5: Decisión final
    const finalScore = (phase1.score * 0.6) + (authority.score * 0.4);
    const passed = finalScore >= 0.45 || (phase1.score >= 0.5 && context.details.durationScore >= 0.7 && authority.level !== 'LOW');

    return {
        passed, rejected: false, rejectReason: null,
        identityScore: phase1.score, versionScore: 1.0, durationScore: context.details.durationScore,
        albumScore: context.details.albumScore, authorityScore: authority.score, authorityLevel: authority.level,
        finalConfidence: finalScore,
        matchDetails: {
            titleScore: phase1.details.titleScore, artistScore: phase1.details.artistScore,
            isDuoMatch: phase1.details.isDuoMatch, version, durationDiff: context.details.durationDiff,
            authority: { level: authority.level, score: authority.score, reasons: authority.reasons },
            remixValidity: remix.reason
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════════════════

async function searchApi(query, limit) {
    try {
        const url = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 12000);
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

function generateRetryQueries(artist, track, original) {
    const queries = [], a = (artist || '').trim(), t = (track || '').trim();
    if (a && t) queries.push(`${a} ${t}`, `${t} ${a}`);
    if (t && t.length > 2) queries.push(t);
    if (a && a.length > 2) queries.push(a);
    const seen = new Set([original.toLowerCase()]);
    return queries.filter(q => { const l = q.toLowerCase(); if (seen.has(l)) return false; seen.add(l); return true; });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    const qRaw = req.query.q || req.query.query || '';
    let targetArtist = req.query.artist || '';
    let targetTrack = req.query.track || '';
    const targetDuration = parseInt(req.query.duration) || 0;
    const targetAlbum = req.query.album || '';
    const limit = parseInt(req.query.limit) || 10;

    if (!qRaw) return res.status(400).json({ success: false, error: 'Missing q parameter' });

    let searchQuery = qRaw;
    if (!targetArtist) {
        const detected = detectKnownArtist(qRaw);
        if (detected.artist) {
            targetArtist = detected.artist;
            targetTrack = detected.track || targetTrack;
            searchQuery = detected.isDuo ? qRaw : (detected.track?.length > 1 ? `${detected.artist} ${detected.track}` : qRaw);
        }
    }

    console.log(`[search] q="${searchQuery}" artist="${targetArtist}" track="${targetTrack}" dur=${targetDuration}`);

    const cacheKey = buildCacheKey({ title: targetTrack || qRaw, artist: targetArtist, duration: targetDuration });

    // Frozen check
    const frozen = frozenDecisions.get(cacheKey);
    if (frozen && Date.now() - frozen.timestamp < FREEZE_TTL) {
        console.log(`[frozen] HIT: ${cacheKey}`);
        const fb = frozen.frozenBest;
        return res.status(200).json({
            success: true, source: 'frozen', frozenAt: new Date(frozen.timestamp).toISOString(),
            query: { original: qRaw, targetArtist, targetTrack, targetDuration, targetAlbum },
            results: [{ title: fb.title, author: { name: fb.artist }, duration: fb.duration, videoId: fb.videoId, thumbnail: fb.thumbnail || '', album: fb.album, source: 'frozen', scores: { finalConfidence: fb.confidence } }]
        });
    }

    // Cache check
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[cache] HIT: ${cacheKey}`);
        return res.status(200).json({ success: true, source: 'cache', cachedAt: new Date(cached.timestamp).toISOString(), ...cached.result });
    }

    // Search
    const results = await searchApi(searchQuery, 35);
    const passedCandidates = [], fallbackCandidates = [];
    const evalParams = { targetArtist, targetTitle: targetTrack || qRaw, targetDuration, targetAlbum };

    for (const item of results) {
        const ev = evaluateCandidate(item, evalParams);
        item._evaluation = ev;
        item._artistName = extractArtistName(item);
        if (ev.rejected) continue;
        if (ev.passed) passedCandidates.push(item);
        else if (ev.identityScore >= 0.35 && ev.authorityLevel !== 'LOW') fallbackCandidates.push(item);
    }

    let finalCandidates = passedCandidates, usedFallback = false, usedRetry = false, retryQuery = null;

    if (!passedCandidates.length && fallbackCandidates.length) {
        finalCandidates = fallbackCandidates;
        usedFallback = true;
    }

    // Retries
    if (!finalCandidates.length) {
        for (const altQ of generateRetryQueries(targetArtist, targetTrack || qRaw, searchQuery)) {
            console.log(`[retry] "${altQ}"`);
            const retryRes = await searchApi(altQ, 25);
            for (const item of retryRes) {
                const ev = evaluateCandidate(item, evalParams);
                item._evaluation = ev;
                item._artistName = extractArtistName(item);
                if (ev.passed) finalCandidates.push(item);
                else if (ev.identityScore >= 0.35 && !ev.rejected) fallbackCandidates.push(item);
            }
            if (finalCandidates.length) { usedRetry = true; retryQuery = altQ; break; }
        }
        if (!finalCandidates.length && fallbackCandidates.length) {
            finalCandidates = fallbackCandidates;
            usedFallback = true;
            usedRetry = true;
        }
    }

    finalCandidates.sort((a, b) => b._evaluation.finalConfidence - a._evaluation.finalConfidence);

    const final = finalCandidates.slice(0, limit).map(item => {
        const ev = item._evaluation;
        return {
            title: item.name || 'Sin título', author: { name: item._artistName || 'Unknown' },
            duration: item.duration || 0, videoId: item.id,
            thumbnail: item.image?.find(i => i.quality === '500x500')?.url || item.image?.[0]?.url || '',
            album: item.album?.name || item.album || null, source: 'saavn',
            scores: { identityScore: Math.round(ev.identityScore * 100) / 100, versionScore: Math.round(ev.versionScore * 100) / 100, durationScore: Math.round(ev.durationScore * 100) / 100, albumScore: Math.round(ev.albumScore * 100) / 100, finalConfidence: Math.round(ev.finalConfidence * 100) / 100 },
            matchDetails: ev.matchDetails
        };
    });

    if (final.length) {
        const best = final[0];
        console.log(`[best] "${best.title}" by ${best.author.name} | conf=${best.scores.finalConfidence}`);
        if (best.scores.finalConfidence >= MIN_CONFIDENCE_TO_CACHE) {
            searchCache.set(cacheKey, { timestamp: Date.now(), result: { query: { original: qRaw, targetArtist, targetTrack, targetDuration, targetAlbum }, totalCandidates: results.length, passedCandidates: passedCandidates.length, usedFallback, usedRetry, retryQuery, results: final } });
        }
        if (best.scores.finalConfidence >= MIN_CONFIDENCE_TO_FREEZE) {
            frozenDecisions.set(cacheKey, { timestamp: Date.now(), frozenBest: { videoId: best.videoId, title: best.title, artist: best.author.name, confidence: best.scores.finalConfidence, duration: best.duration, thumbnail: best.thumbnail, album: best.album } });
            console.log(`[frozen] SET: ${cacheKey}`);
        }
    }

    return res.status(200).json({
        success: true, source: usedRetry ? 'retry' : 'api',
        query: { original: qRaw, targetArtist, targetTrack, targetDuration, targetAlbum },
        totalCandidates: results.length, passedCandidates: passedCandidates.length, usedFallback, usedRetry, retryQuery, results: final
    });
}

export default allowCors(handler);
