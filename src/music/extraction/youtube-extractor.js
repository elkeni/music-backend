/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🛠️ YOUTUBE EXTRACTOR - Lógica Compartida (Browser/Node/CLI)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Contiene la lógica pura de negocio para:
 * 1. Normalización de texto
 * 2. Detección de versiones (remix, live, cover)
 * 3. Evaluación de autoridad de canal
 * 4. Extracción de artistas
 * 
 * Diseñado para ser usado tanto en la API Serverless como en Scripts CLI.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

const LEET_MAP = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' };

const KNOWN_DUOS = {
    'ca7riel & paco amoroso': { members: ['ca7riel', 'paco amoroso'], canonicalName: 'CA7RIEL & Paco Amoroso', aliases: ['ca7riel y paco amoroso'] },
    'daft punk': { members: ['thomas bangalter', 'guy-manuel'], canonicalName: 'Daft Punk', aliases: [] },
    'silk sonic': { members: ['bruno mars', 'anderson paak'], canonicalName: 'Silk Sonic', aliases: [] }
};

const TRASH_ARTISTS = [
    'sweet little band', 'rockabye baby', 'lullaby', 'twinkle',
    'vitamin string quartet', 'piano tribute', 'tribute players',
    'kidz bop', 'para ninos', 'baby einstein', 'cover band',
    'sleep baby', 'relaxing baby', 'meditation music'
];

const TRASH_PATTERNS = [
    'ringtone', 'tono de llamada', 'music box',
    'tutorial', 'lesson', 'how to play',
    'midi version', 'midi file'
];

const FORBIDDEN_VERSION_PATTERNS = [
    { pattern: /\blive\b/i, name: 'live' },
    { pattern: /\ben\s*vivo\b/i, name: 'en vivo' },
    { pattern: /\bconcierto\b/i, name: 'concierto' },
    { pattern: /\bcover\b/i, name: 'cover' },
    { pattern: /\btribute\b/i, name: 'tribute' },
    { pattern: /\bin\s*the\s*style\s*of\b/i, name: 'style of' },
    { pattern: /\bkaraoke\b/i, name: 'karaoke' },
    { pattern: /\binstrumental\b/i, name: 'instrumental' },
    { pattern: /\bsped\s*up\b/i, name: 'sped up' },
    { pattern: /\bslowed\b/i, name: 'slowed' },
    { pattern: /\b8d\s*audio\b/i, name: '8d audio' }
];

const EDITORIAL_NOISE_PATTERNS = [
    /\bofficial\s*(music\s*)?video\b/i,
    /\bofficial\s*audio\b/i,
    /\bofficial\b/i,
    /\boficial\b/i,
    /\bvideo\s*clip\b/i,
    /\blyrics?\b/i,
    /\bhd\b/i,
    /\bhq\b/i,
    /\b4k\b/i
];

const COVER_INDICATORS = [
    'cover', 'tribute', 'instrumental', 'karaoke', 'acoustic',
    'live', 'remake', 'rework', 'version', 'rendition',
    'performed by', 'played by', 'sung by', 'covered by',
    'mi version', 'homenaje'
];

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE TEXTO
// ═══════════════════════════════════════════════════════════════════════════════

export function normalize(text) {
    if (!text) return '';
    let r = text.toLowerCase();
    r = r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    r = r.split('').map(c => LEET_MAP[c] || c).join('');
    r = r.replace(/&/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return r;
}

export function cleanTitle(text) {
    if (!text) return '';
    let clean = text;
    // Simplificado para extractor compartido
    const noisePatterns = [
        /\(official\s*(music\s*)?video\)/gi,
        /\(official\s*audio\)/gi,
        /\(lyrics?\)/gi,
        /\[official\s*(music\s*)?video\]/gi,
        /\[lyrics?\]/gi
    ];
    for (const pattern of noisePatterns) {
        clean = clean.replace(pattern, '');
    }
    return clean.replace(/\s+/g, ' ').trim();
}

export function extractArtistName(item) {
    let rawArtist = '';
    if (item.primaryArtists?.trim()) rawArtist = item.primaryArtists.trim();
    else if (item.artist && typeof item.artist === 'string') rawArtist = item.artist.trim();
    else if (item.channelTitle) rawArtist = item.channelTitle; // Fallback común en YouTube

    // Limpiar "- Topic"
    return rawArtist.replace(/\s*-\s*topic$/i, '').trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// LÓGICA DE NEGOCIO (CORE)
// ═══════════════════════════════════════════════════════════════════════════════

export function detectValidVersion(title) {
    if (!title) return { type: 'original', details: null };
    const lower = title.toLowerCase();

    if (/\bremix\b/i.test(lower)) return { type: 'remix', details: null };
    if (/\bremaster(ed)?\b/i.test(lower)) return { type: 'remaster', details: null };
    if (/\bradio\s*edit\b/i.test(lower)) return { type: 'radio_edit', details: null };
    if (/\bextended\b/i.test(lower)) return { type: 'extended', details: null };

    return { type: 'original', details: null };
}

export function detectForbiddenVersion(title) {
    if (!title) return null;
    const lower = title.toLowerCase();

    if (/\bremaster(ed)?\b/i.test(lower)) return null; // Safe

    let clean = lower;
    for (const p of EDITORIAL_NOISE_PATTERNS) clean = clean.replace(p, ' ');

    for (const { pattern, name } of FORBIDDEN_VERSION_PATTERNS) {
        if (pattern.test(clean)) return name;
    }
    return null;
}

export function isTrashContent(candidate) {
    const title = (candidate.name || candidate.title || '').toLowerCase();
    const artist = normalize(candidate.artist || candidate.channelTitle || '');

    for (const trash of TRASH_ARTISTS) if (artist.includes(trash)) return true;
    for (const pat of TRASH_PATTERNS) if (title.includes(pat)) return true;

    // Duración extrema (> 15 min)
    if ((candidate.duration || 0) > 900) return true;

    return false;
}

export function evaluateChannelAuthority(candidate, targetArtist, identityScore = 0) {
    const result = { level: 'LOW', score: 0.0, reasons: [] };

    const channel = (candidate.channelTitle || '').toLowerCase();
    const desc = (candidate.description || '').toLowerCase();
    const artistNorm = normalize(targetArtist || '');

    // HIGH
    if (artistNorm && channel.includes(artistNorm)) {
        return { level: 'HIGH', score: 1.0, reasons: ['channel_matches_artist'] };
    }
    if (channel.includes('vevo') || channel.includes('official')) {
        return { level: 'HIGH', score: 1.0, reasons: ['official_channel'] };
    }

    // MEDIUM
    let hasCoverFlag = false;
    for (const ind of COVER_INDICATORS) {
        if (channel.includes(ind) || desc.includes(ind)) {
            hasCoverFlag = true;
            break;
        }
    }

    if (!hasCoverFlag && identityScore >= 0.85) {
        return { level: 'MEDIUM', score: 0.6, reasons: ['high_identity_no_flags'] };
    }

    // LOW
    return { level: 'LOW', score: 0.0, reasons: ['default_low'] };
}
