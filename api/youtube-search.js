/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 MUSIC SEARCH ENGINE v3.5 - STUDIO QUALITY + CHANNEL AUTHORITY
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * VISIÓN DEL PRODUCTO:
 * - SOLO música de estudio de calidad
 * - Singles, álbumes y EPs oficiales
 * - Remixes oficiales SÍ son válidos
 * - Remasters oficiales SÍ son válidos
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * PIPELINE v3.5 - ORDEN EXACTO, NO NEGOCIABLE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * FASE 0: Normalización (entrada)
 * FASE 1: Identidad primaria (artista + título + duración)
 * FASE 2: Detección de versión PROHIBIDA (live, cover explícito, karaoke)
 * FASE 3: AUTORIDAD DE LA FUENTE (NUEVA - CRÍTICA) ← mata covers implícitos
 * FASE 4: Remix oficial vs remix trucho
 * FASE 5: Decisión FINAL (score combinado)
 * FASE 6: Regla UX (nunca vacío, pero nunca covers)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * CAMBIO CLAVE v3.5: EL CANAL MANDA, NO EL TÍTULO
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * � AUTORIDAD DEL CANAL:
 * - HIGH: Artista oficial, VEVO, -Topic, ℗/© en descripción
 * - MEDIUM: Canal no oficial PERO sin flags de cover + identidad >= 0.85
 * - LOW: Canal random sin indicadores de oficialidad
 * 
 * � REGLA ANTI-COVER IMPLÍCITO:
 * Si authority = LOW && titleScore >= 0.9 && artistScore >= 0.8
 * → RECHAZO: "implicit_cover_by_low_authority_channel"
 * 
 * 🎧 REMIX:
 * - HIGH authority → aceptar
 * - MEDIUM + artistScore >= 0.9 → aceptar
 * - LOW → RECHAZAR siempre
 * 
 * 📊 SCORE FINAL:
 * finalScore = identity.score * 0.6 + authority.score * 0.4
 * passed = finalScore >= 0.45 || (identity >= 0.5 && duration >= 0.7 && authority !== LOW)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const config = {
    runtime: 'nodejs'
};

const SOURCE_API = 'https://appmusic-phi.vercel.app';

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE EN MEMORIA
// ═══════════════════════════════════════════════════════════════════════════════

// Cache estándar (24 horas)
const searchCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 horas
const MIN_CONFIDENCE_TO_CACHE = 0.7; // Solo cachear resultados confiables

// ❄️ FROZEN DECISIONS: Cache de muy largo plazo para resultados con alta confianza
// Bypassea completamente el motor de búsqueda
const frozenDecisions = new Map();
const FREEZE_TTL = 1000 * 60 * 60 * 24 * 30; // 30 días
const MIN_CONFIDENCE_TO_FREEZE = 0.85; // Solo congelar resultados muy confiables

// ═══════════════════════════════════════════════════════════════════════════════
// CORS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    return await fn(req, res);
};



// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE NORMALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

const LEET_MAP = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' };

/**
 * Normaliza texto: minúsculas, sin acentos, sin leetspeak
 */
function normalize(text) {
    if (!text) return '';
    let r = text.toLowerCase();
    r = r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    r = r.split('').map(c => LEET_MAP[c] || c).join('');
    r = r.replace(/&/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return r;
}

/**
 * Construye clave de cache basada en identidad normalizada
 * Evita duplicados por mayúsculas, queries ligeramente distintas, etc.
 */
function buildCacheKey({ title, artist, duration }) {
    return [
        normalize(title || ''),
        normalize(artist || ''),
        Math.round(duration || 0)
    ].join('|');
}

/**
 * Limpia sufijos comunes de títulos (Official Video, Lyrics, etc.)
 * NO elimina remix/remaster porque son válidos
 */
function cleanTitle(text) {
    if (!text) return '';
    let clean = text;

    const noisePatterns = [
        /\(official\s*(music\s*)?video\)/gi,
        /\(official\s*audio\)/gi,
        /\(official\)/gi,
        /\(lyrics?\s*(video)?\)/gi,
        /\(audio\s*(oficial)?\)/gi,
        /\(video\s*(oficial|clip)?\)/gi,
        /\(hd|hq|4k|1080p?\)/gi,
        /\(explicit\)/gi,
        /\(clean\s*version\)/gi,
        /\(from\s+[^)]+\)/gi,
        /\[official\s*(music\s*)?video\]/gi,
        /\[hd|hq|4k\]/gi,
        /\[lyrics?\]/gi,
        /\[audio\]/gi,
        /\[explicit\]/gi,
    ];

    for (const pattern of noisePatterns) {
        clean = clean.replace(pattern, '');
    }

    return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Divide string de artistas en array individual
 */
function splitArtists(artistString) {
    if (!artistString) return [];
    const separators = /[,&]|\s+(?:and|y|feat\.?|ft\.?|featuring|with|x)\s+/gi;
    return artistString
        .split(separators)
        .map(a => normalize(a))
        .filter(a => a.length > 1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERSIONES PROHIBIDAS (RECHAZO INMEDIATO - NO NEGOCIABLE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Patrones de versiones que NUNCA deben devolverse
 * Si se detecta cualquiera de estos → RECHAZO INMEDIATO
 * 
 * EXCEPCIONES (ruido editorial, NO versiones):
 * - "official audio", "official video", "oficial" → IGNORAR
 * - "remaster", "remastered" → SIEMPRE VÁLIDO
 * - "remix" → Válido si identidad es fuerte (se evalúa después)
 */
const FORBIDDEN_VERSION_PATTERNS = [
    // Live versions
    { pattern: /\blive\b/i, name: 'live' },
    { pattern: /\ben\s*vivo\b/i, name: 'en vivo' },
    { pattern: /\bconcierto\b/i, name: 'concierto' },
    { pattern: /\bconcert\b/i, name: 'concert' },
    { pattern: /\blive\s+at\b/i, name: 'live at' },
    { pattern: /\blive\s+from\b/i, name: 'live from' },
    { pattern: /\b(at|from)\s+(the\s+)?(o2|wembley|stadium|arena|festival|mtv|bbc)/i, name: 'live venue' },

    // Acoustic/Unplugged
    { pattern: /\bacoustic\b/i, name: 'acoustic' },
    { pattern: /\bacustic[ao]?\b/i, name: 'acustico' },
    { pattern: /\bunplugged\b/i, name: 'unplugged' },
    { pattern: /\bstripped\b/i, name: 'stripped' },

    // Cover/Tribute
    { pattern: /\bcover\b/i, name: 'cover' },
    { pattern: /\btribute\b/i, name: 'tribute' },
    { pattern: /\bin\s*the\s*style\s*of\b/i, name: 'style of' },
    { pattern: /\bperformed\s*by\b/i, name: 'performed by' },
    { pattern: /\boriginally\s*(performed\s*)?by\b/i, name: 'originally by' },
    { pattern: /\bas\s*made\s*famous\s*by\b/i, name: 'made famous by' },
    { pattern: /\bversion\s*de\b/i, name: 'version de' },
    { pattern: /\bhomenaje\b/i, name: 'homenaje' },

    // Karaoke/Instrumental
    { pattern: /\bkaraoke\b/i, name: 'karaoke' },
    { pattern: /\binstrumental\b/i, name: 'instrumental' },
    { pattern: /\bbacking\s*track\b/i, name: 'backing track' },
    { pattern: /\bperformance\s*track\b/i, name: 'performance track' },

    // Sped up/Slowed/Nightcore
    { pattern: /\bsped\s*up\b/i, name: 'sped up' },
    { pattern: /\bspeed\s*up\b/i, name: 'speed up' },
    { pattern: /\bnightcore\b/i, name: 'nightcore' },
    { pattern: /\bslowed\b/i, name: 'slowed' },
    { pattern: /\bslowed\s*[\+&]\s*reverb\b/i, name: 'slowed reverb' },
    { pattern: /\b8d\s*audio\b/i, name: '8d audio' },

    // Chipmunk/Kids versions
    { pattern: /\bchipmunk\b/i, name: 'chipmunk' },
    { pattern: /\blullaby\b/i, name: 'lullaby' },
    { pattern: /\bpara\s*bebes\b/i, name: 'para bebes' },
    { pattern: /\bfor\s*kids\b/i, name: 'for kids' },
    { pattern: /\binfantil\b/i, name: 'infantil' },

    // Demo (not studio quality)
    { pattern: /\bdemo\b/i, name: 'demo' },
];

/**
 * Palabras que son RUIDO EDITORIAL, no versiones
 * Estas NUNCA deben causar rechazo
 */
const EDITORIAL_NOISE_PATTERNS = [
    /\bofficial\s*(music\s*)?video\b/i,
    /\bofficial\s*audio\b/i,
    /\bofficial\b/i,
    /\boficial\b/i,
    /\b(audio|video)\s*oficial\b/i,
    /\bvideo\s*clip\b/i,
    /\blyrics?\b/i,
    /\bhd\b/i,
    /\bhq\b/i,
    /\b4k\b/i,
    /\b1080p\b/i,
    /\bexplicit\b/i,
];

/**
 * Detecta si el título contiene una versión PROHIBIDA
 * @param {string} title - Título de la canción
 * @param {boolean} checkRemix - Si true, también marca remix como prohibido (default: false)
 * @returns {string|null} Tipo de versión prohibida o null si es válido
 */
function detectForbiddenVersion(title, checkRemix = false) {
    if (!title) return null;

    const lowerTitle = title.toLowerCase();

    // ⭐ REGLA 2: Remaster SIEMPRE es válido - verificar primero
    if (/\bremaster(ed)?\b/i.test(lowerTitle)) {
        return null; // NUNCA rechazar remaster
    }


    // ⭐ REGLA 1: Limpiar ruido editorial antes de evaluar
    let cleanTitle = lowerTitle;
    for (const noisePattern of EDITORIAL_NOISE_PATTERNS) {
        cleanTitle = cleanTitle.replace(noisePattern, ' ');
    }
    cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();

    // ⭐ REGLA 3: Remix se evalúa en otro lugar (no aquí por defecto)
    // Solo rechazar remix si checkRemix es true
    if (!checkRemix && /\bremix\b/i.test(lowerTitle)) {
        return null; // Remix se evalúa después con identityScore
    }

    // Evaluar patrones prohibidos en el título limpio
    for (const { pattern, name } of FORBIDDEN_VERSION_PATTERNS) {
        if (pattern.test(cleanTitle)) {
            return name;
        }
    }

    // También verificar en título original para casos edge
    // (por si el patrón prohibido está junto al ruido editorial)
    for (const { pattern, name } of FORBIDDEN_VERSION_PATTERNS) {
        if (pattern.test(lowerTitle)) {
            // Doble check: asegurarse que no es falso positivo por ruido
            // Ej: "Live" en "Live Your Life" no debería rechazar
            // pero "Live at Wembley" sí
            if (name === 'live' && !/\blive\s+(at|from|in|on)\b/i.test(lowerTitle)) {
                // "live" solo como palabra suelta puede ser parte del título
                // Solo rechazar si tiene contexto de concierto
                continue;
            }
            return name;
        }
    }

    return null;
}

/**
 * Detecta versiones VÁLIDAS: remix, remaster, radio edit, extended
 */
function detectValidVersion(title) {
    if (!title) return { type: 'original', details: null };

    const lowerTitle = title.toLowerCase();

    // Remix (VÁLIDO)
    if (/\bremix\b/i.test(lowerTitle) || /\brmx\b/i.test(lowerTitle)) {
        const remixMatch = title.match(/\(([^)]+)\s*remix\)/i) || title.match(/\[([^\]]+)\s*remix\]/i);
        return {
            type: 'remix',
            details: remixMatch ? remixMatch[1].trim() : null
        };
    }

    // Remaster (VÁLIDO)
    if (/\bremaster(ed)?\b/i.test(lowerTitle)) {
        const yearMatch = title.match(/(\d{4})\s*remaster/i) || title.match(/remaster(ed)?\s*(\d{4})/i);
        return {
            type: 'remaster',
            details: yearMatch ? yearMatch[1] || yearMatch[2] : null
        };
    }

    // Radio Edit (VÁLIDO)
    if (/\bradio\s*edit\b/i.test(lowerTitle) || /\bradio\s*version\b/i.test(lowerTitle)) {
        return { type: 'radio_edit', details: null };
    }

    // Extended (VÁLIDO)
    if (/\bextended\b/i.test(lowerTitle)) {
        return { type: 'extended', details: null };
    }

    // Single/Album version (VÁLIDO)
    if (/\b(single|album)\s*version\b/i.test(lowerTitle)) {
        return { type: 'album_version', details: null };
    }

    return { type: 'original', details: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE FEATURING/COLABORADORES
// ═══════════════════════════════════════════════════════════════════════════════

function extractFeaturing(title) {
    if (!title) return [];

    const featuring = [];
    const patterns = [
        /\(?feat\.?\s+([^)([\]]+)\)?/gi,
        /\(?ft\.?\s+([^)([\]]+)\)?/gi,
        /\(?featuring\s+([^)([\]]+)\)?/gi,
        /\(?with\s+([^)([\]]+)\)?/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(title)) !== null) {
            const artistPart = match[1];
            if (artistPart) {
                const artists = artistPart.split(/[,&]/).map(a => a.trim()).filter(a => a.length > 1);
                featuring.push(...artists);
            }
        }
    }

    return [...new Set(featuring)];
}

function extractArtistName(item) {
    let rawArtist = '';

    if (item.primaryArtists?.trim()) {
        rawArtist = item.primaryArtists.trim();
    } else if (item.artist && typeof item.artist === 'string' && item.artist.trim()) {
        rawArtist = item.artist.trim();
    } else if (item.artists) {
        if (item.artists.primary && Array.isArray(item.artists.primary)) {
            const names = item.artists.primary.map(a => a.name || a).filter(Boolean);
            if (names.length > 0) rawArtist = names.join(', ');
        } else if (Array.isArray(item.artists)) {
            const names = item.artists.map(a => a.name || a).filter(Boolean);
            if (names.length > 0) rawArtist = names.join(', ');
        } else if (typeof item.artists === 'string' && item.artists.trim()) {
            rawArtist = item.artists.trim();
        }
    }

    if (!rawArtist && item.more_info) {
        if (item.more_info.artistMap?.primary_artists) {
            const artists = item.more_info.artistMap.primary_artists;
            if (Array.isArray(artists)) {
                const names = artists.map(a => a.name || a).filter(Boolean);
                if (names.length > 0) rawArtist = names.join(', ');
            }
        }
        if (!rawArtist && item.more_info.primary_artists?.trim()) {
            rawArtist = item.more_info.primary_artists.trim();
        }
    }

    if (!rawArtist && item.subtitle?.trim()) {
        rawArtist = item.subtitle.trim();
    }

    if (!rawArtist && item.music?.trim()) {
        rawArtist = item.music.trim();
    }

    return rawArtist;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTISTAS CONOCIDOS + DÚOS ESTABLES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DÚOS ESTABLES: Artistas que funcionan como unidad (equivalente a Daft Punk)
 * Si aparece cualquiera de los miembros, el match es válido para el dúo.
 */
const KNOWN_DUOS = {
    'ca7riel & paco amoroso': {
        members: ['ca7riel', 'catriel', 'c47riel', 'paco amoroso', 'paco'],
        canonicalName: 'CA7RIEL & Paco Amoroso',
        aliases: ['ca7riel y paco amoroso', 'paco amoroso y ca7riel', 'paco amoroso & ca7riel']
    },
    'daft punk': {
        members: ['daft punk', 'thomas bangalter', 'guy-manuel'],
        canonicalName: 'Daft Punk',
        aliases: []
    },
    'silk sonic': {
        members: ['silk sonic', 'bruno mars', 'anderson paak'],
        canonicalName: 'Silk Sonic',
        aliases: ['anderson paak & bruno mars', 'bruno mars & anderson paak']
    }
};

const KNOWN_ARTISTS = {
    'mana': ['mana', 'maná'],
    'radiohead': ['radiohead'],
    'coldplay': ['coldplay'],
    'ca7riel': ['catriel', 'ca7riel', 'c47riel'],
    'paco amoroso': ['paco amoroso', 'paco', 'amoroso'],
    'soda stereo': ['soda stereo', 'soda', 'stereo'],
    'gustavo cerati': ['cerati', 'gustavo cerati'],
    'shakira': ['shakira'],
    'bad bunny': ['bad bunny', 'badbunny'],
    'daddy yankee': ['daddy yankee', 'daddyyankee'],
    'duki': ['duki'],
    'bizarrap': ['bizarrap', 'bzrp', 'biza'],
    'taylor swift': ['taylor swift', 'taylor'],
    'the weeknd': ['weeknd', 'the weeknd'],
    'queen': ['queen'],
    'nirvana': ['nirvana'],
    'metallica': ['metallica'],
    'guns n roses': ['guns n roses', 'guns and roses', 'gnr'],
    'pink floyd': ['pink floyd', 'floyd'],
    'led zeppelin': ['led zeppelin', 'zeppelin'],
    'the beatles': ['beatles', 'the beatles'],
    'ac dc': ['acdc', 'ac dc', 'ac/dc'],
    'linkin park': ['linkin park', 'linkinpark'],
    'green day': ['green day', 'greenday'],
    'oasis': ['oasis'],
    'arctic monkeys': ['arctic monkeys'],
    'imagine dragons': ['imagine dragons'],
    'maroon 5': ['maroon 5', 'maroon'],
    'bruno mars': ['bruno mars'],
    'ed sheeran': ['ed sheeran', 'sheeran'],
    'adele': ['adele'],
    'rihanna': ['rihanna'],
    'beyonce': ['beyonce', 'beyoncé'],
    'drake': ['drake'],
    'eminem': ['eminem'],
    'kendrick lamar': ['kendrick lamar', 'kendrick'],
    'kanye west': ['kanye west', 'kanye', 'ye'],
    'travis scott': ['travis scott'],
    'post malone': ['post malone'],
    'dua lipa': ['dua lipa'],
    'billie eilish': ['billie eilish', 'billie', 'eilish'],
    'harry styles': ['harry styles'],
    'ariana grande': ['ariana grande', 'ariana'],
    'justin bieber': ['justin bieber', 'bieber'],
    'selena gomez': ['selena gomez'],
    'katy perry': ['katy perry'],
    'lady gaga': ['lady gaga', 'gaga'],
    'miley cyrus': ['miley cyrus', 'miley'],
    'sia': ['sia'],
    'lana del rey': ['lana del rey'],
    'hozier': ['hozier'],
    'tame impala': ['tame impala'],
    'gorillaz': ['gorillaz'],
    'daft punk': ['daft punk'],
    'deadmau5': ['deadmau5'],
    'skrillex': ['skrillex'],
    'calvin harris': ['calvin harris'],
    'david guetta': ['david guetta', 'guetta'],
    'avicii': ['avicii'],
    'marshmello': ['marshmello'],
    'j balvin': ['j balvin', 'balvin'],
    'ozuna': ['ozuna'],
    'maluma': ['maluma'],
    'anuel aa': ['anuel aa', 'anuel'],
    'karol g': ['karol g', 'karol'],
    'rauw alejandro': ['rauw alejandro', 'rauw'],
    'feid': ['feid'],
    'myke towers': ['myke towers'],
    'peso pluma': ['peso pluma'],
    'fuerza regida': ['fuerza regida'],
    'grupo frontera': ['grupo frontera'],
    'junior h': ['junior h']
};

/**
 * Detecta si el targetArtist es un DÚO ESTABLE
 * @returns {{ isDuo: boolean, members: string[], canonicalName: string } | null}
 */
function detectDuo(artistString) {
    if (!artistString) return null;

    const normalized = normalize(artistString);

    // Verificar si contiene separadores de dúo
    const hasDuoSeparator = /[&]|\s+y\s+|\s+and\s+/i.test(artistString);

    // Buscar en dúos conocidos
    for (const [key, duo] of Object.entries(KNOWN_DUOS)) {
        // Match directo por clave
        if (normalized.includes(normalize(key))) {
            return { isDuo: true, members: duo.members, canonicalName: duo.canonicalName };
        }
        // Match por aliases
        for (const alias of duo.aliases) {
            if (normalized.includes(normalize(alias))) {
                return { isDuo: true, members: duo.members, canonicalName: duo.canonicalName };
            }
        }
        // Match por cualquier miembro (si hay separador de dúo en query)
        if (hasDuoSeparator) {
            for (const member of duo.members) {
                if (normalized.includes(normalize(member))) {
                    return { isDuo: true, members: duo.members, canonicalName: duo.canonicalName };
                }
            }
        }
    }

    // Si tiene separador pero no está en KNOWN_DUOS, tratarlo como dúo genérico
    if (hasDuoSeparator) {
        const parts = artistString.split(/[&]|\s+y\s+|\s+and\s+/i).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
            return {
                isDuo: true,
                members: parts.map(p => normalize(p)),
                canonicalName: artistString
            };
        }
    }

    return null;
}

/**
 * detectKnownArtist MEJORADO:
 * - Si el query contiene & o "y" (dúo), NO lo rompe
 * - Preserva la identidad compuesta
 */
function detectKnownArtist(query) {
    const qNorm = normalize(query);

    // ⚠️ REGLA CRÍTICA: Si el query contiene separadores de dúo, NO limpiar
    // Esto preserva "CA7RIEL & Paco Amoroso" como unidad
    const hasDuoSeparator = /[&]|\s+y\s+/i.test(query);

    if (hasDuoSeparator) {
        // Detectar si es un dúo conocido
        const duoInfo = detectDuo(query);
        if (duoInfo) {
            console.log(`[detectKnownArtist] DÚO DETECTADO: "${duoInfo.canonicalName}"`);
            // Devolver el query completo como artista, sin limpiar
            return {
                artist: duoInfo.canonicalName,
                track: '',  // El track se extrae de otra forma
                isDuo: true,
                duoMembers: duoInfo.members
            };
        }
        // Dúo genérico: preservar query completo
        console.log(`[detectKnownArtist] Dúo genérico detectado, preservando query: "${query}"`);
        return { artist: null, track: query, isDuo: true };
    }

    // Lógica original para artistas individuales
    let bestMatch = null;
    let bestMatchLength = 0;
    let cleanQuery = query;

    for (const [realName, aliases] of Object.entries(KNOWN_ARTISTS)) {
        for (const alias of aliases) {
            const regex = new RegExp(`\\b${alias}\\b`, 'i');
            if (regex.test(qNorm)) {
                if (!bestMatch || alias.length > bestMatchLength) {
                    bestMatch = realName;
                    bestMatchLength = alias.length;
                    cleanQuery = query.replace(new RegExp(alias, 'gi'), '').replace(/\s+/g, ' ').trim();
                }
            }
        }
    }

    return { artist: bestMatch, track: cleanQuery, isDuo: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTRO DE CONTENIDO BASURA (Simplificado - Solo basura real)
// ═══════════════════════════════════════════════════════════════════════════════

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

/**
 * Verifica si es contenido BASURA (no música real)
 * Solo rechaza: karaoke artists, kids music, ringtones, tutorials
 * NO rechaza: compilaciones, remasters, radio edits
 * NO rechaza por canal/uploader - la identidad musical define validez
 * @param {Object} candidate - El candidato a evaluar
 * @param {number} targetDuration - Duración objetivo (para detectar album-mix)
 */
function isTrashContent(candidate, targetDuration = 0) {
    const rawTitle = (candidate.name || '').toLowerCase();
    const artist = normalize(extractArtistName(candidate) || '');

    // Artista basura
    for (const trash of TRASH_ARTISTS) {
        if (artist.includes(trash)) return true;
    }

    // Patrones basura en título
    for (const pattern of TRASH_PATTERNS) {
        if (rawTitle.includes(pattern)) return true;
    }

    // ⭐ Rechazar videos muy largos (album-mix, compilaciones de video)
    // Máximo 15 minutos = 900 segundos
    // Solo aplicar si tenemos targetDuration para comparar
    const duration = candidate.duration || 0;
    if (duration > 900 && targetDuration > 0) {
        return true; // Probablemente es un album-mix o compilación
    }

    return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3: AUTORIDAD DE LA FUENTE (CRÍTICA - mata covers implícitos)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Palabras clave que indican cover/tributo/remake en descripción
 * Si el canal NO es oficial y la descripción contiene estas → LOW authority
 */
const COVER_INDICATORS = [
    'cover', 'tribute', 'instrumental', 'karaoke', 'acoustic',
    'live', 'remake', 'rework', 'version', 'rendition',
    'performed by', 'played by', 'sung by', 'covered by',
    'mi version', 'mi versión', 'homenaje', 'dedicado a'
];

/**
 * FASE 3: Evalúa la autoridad del canal/uploader
 * 
 * Niveles:
 * - HIGH (1.0): Canal oficial del artista, VEVO, Topic, ℗/©
 * - MEDIUM (0.6): No oficial pero sin flags de cover + identidad fuerte
 * - LOW (0.0): Canal random sin indicadores de oficialidad
 * 
 * @param {Object} candidate - El candidato a evaluar
 * @param {string} targetArtist - Artista buscado (normalizado)
 * @param {number} identityScore - Score de identidad (de FASE 1)
 * @returns {{ level: 'HIGH'|'MEDIUM'|'LOW', score: number, reasons: string[] }}
 */
function evaluateChannelAuthority(candidate, targetArtist, identityScore = 0) {
    const result = {
        level: 'LOW',
        score: 0.0,
        reasons: []
    };

    // Extraer datos del canal
    const channelTitle = (candidate.channelTitle || candidate.subtitle || candidate.label || '').toLowerCase();
    const description = (candidate.description || candidate.more_info?.copyright_text || '').toLowerCase();
    const artistNorm = normalize(targetArtist || '');

    // ═══════════════════════════════════════════════════════════════════════════
    // NIVEL HIGH: Canal oficial del artista
    // ═══════════════════════════════════════════════════════════════════════════

    // Check 1: Canal contiene nombre del artista
    if (artistNorm && channelTitle.includes(artistNorm)) {
        result.level = 'HIGH';
        result.score = 1.0;
        result.reasons.push(`channel_contains_artist: "${channelTitle}"`);
        return result;
    }

    // Check 2: Canal oficial (VEVO, Topic, Official)
    if (
        channelTitle.includes('vevo') ||
        channelTitle.endsWith('- topic') ||
        channelTitle.includes(' - topic') ||
        channelTitle.includes('official')
    ) {
        result.level = 'HIGH';
        result.score = 1.0;
        result.reasons.push(`official_channel: "${channelTitle}"`);
        return result;
    }

    // Check 3: Símbolos de copyright en descripción
    if (description.includes('℗') || description.includes('©')) {
        result.level = 'HIGH';
        result.score = 1.0;
        result.reasons.push('copyright_symbols_in_description');
        return result;
    }

    // Check 4: Label conocido
    const knownLabels = [
        'sony music', 'universal music', 'warner music', 'emi',
        'atlantic', 'columbia', 'interscope', 'def jam', 'republic',
        'rca records', 'capitol records', 'island records'
    ];
    for (const label of knownLabels) {
        if (channelTitle.includes(label) || description.includes(label)) {
            result.level = 'HIGH';
            result.score = 1.0;
            result.reasons.push(`known_label: "${label}"`);
            return result;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NIVEL MEDIUM: No oficial pero sin flags de cover + identidad fuerte
    // ═══════════════════════════════════════════════════════════════════════════

    // Verificar si el canal/descripción tiene indicadores de cover
    let hasCoverIndicators = false;
    for (const indicator of COVER_INDICATORS) {
        if (channelTitle.includes(indicator) || description.includes(indicator)) {
            hasCoverIndicators = true;
            result.reasons.push(`cover_indicator: "${indicator}"`);
            break;
        }
    }

    // MEDIUM: Sin flags de cover Y identidad >= 0.85
    if (!hasCoverIndicators && identityScore >= 0.85) {
        result.level = 'MEDIUM';
        result.score = 0.6;
        result.reasons.push(`no_cover_flags_high_identity: ${identityScore.toFixed(2)}`);
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NIVEL LOW: Canal random sin indicadores de oficialidad
    // ═══════════════════════════════════════════════════════════════════════════

    result.level = 'LOW';
    result.score = 0.0;
    result.reasons.push(`no_authority_indicators`);
    if (hasCoverIndicators) {
        result.reasons.push('has_cover_indicators');
    }

    return result;
}

/**
 * FASE 3.2: Detecta covers IMPLÍCITOS
 * 
 * REGLA: Si el canal tiene LOW authority PERO el título/artista matchean perfectamente,
 * es casi seguro que es un cover (JuanitoGuitar subiendo "Radiohead - Creep")
 * 
 * @param {Object} authority - Resultado de evaluateChannelAuthority
 * @param {number} titleScore - Score del título (de FASE 1)
 * @param {number} artistScore - Score del artista (de FASE 1)
 * @returns {{ isImplicitCover: boolean, reason: string|null }}
 */
function detectImplicitCover(authority, titleScore, artistScore) {
    // REGLA CRÍTICA: Authority LOW + scores altos = cover implícito
    if (
        authority.level === 'LOW' &&
        titleScore >= 0.9 &&
        artistScore >= 0.8
    ) {
        return {
            isImplicitCover: true,
            reason: `implicit_cover_by_low_authority_channel (title: ${titleScore.toFixed(2)}, artist: ${artistScore.toFixed(2)})`
        };
    }

    return { isImplicitCover: false, reason: null };
}

/**
 * FASE 4: Evalúa si un remix es oficial o trucho
 * 
 * REGLAS:
 * - HIGH authority → aceptar
 * - MEDIUM + artistScore >= 0.9 → aceptar  
 * - LOW → RECHAZAR siempre (no existe remix válido de canal random)
 * 
 * @param {boolean} isRemix - Si el título contiene "remix"
 * @param {Object} authority - Resultado de evaluateChannelAuthority
 * @param {number} artistScore - Score del artista
 * @returns {{ isValid: boolean, reason: string }}
 */
function evaluateRemixValidity(isRemix, authority, artistScore) {
    if (!isRemix) {
        return { isValid: true, reason: 'not_a_remix' };
    }

    if (authority.level === 'HIGH') {
        return { isValid: true, reason: 'official_remix_high_authority' };
    }

    if (authority.level === 'MEDIUM' && artistScore >= 0.9) {
        return { isValid: true, reason: 'semi_official_remix_medium_authority' };
    }

    return {
        isValid: false,
        reason: `unofficial_remix_${authority.level.toLowerCase()}_authority`
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 1: IDENTIDAD PRIMARIA (Corregida para DÚOS)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FASE 1: Confirma título y artista
 * 
 * REGLA DÚOS (v3.4):
 * Si targetArtist es un DÚO (contiene & / y / and):
 * - artistScore >= 0.85 si coincide AL MENOS UNO de los miembros
 * - artistScore = 1.0 si coinciden AMBOS
 * - NUNCA penalizar por no aparecer juntos
 * 
 * Esto corrige el problema CA7RIEL & Paco Amoroso donde YouTube
 * puede tener "CA7RIEL, Paco Amoroso" o "Paco Amoroso & CA7RIEL"
 */
function evaluatePrimaryIdentity(candidate, targetArtist, targetTitle) {
    const details = {
        titleMatch: 'none',
        artistMatch: 'none',
        titleScore: 0,
        artistScore: 0,
        isDuoMatch: false
    };

    // === TÍTULO ===
    const candidateTitle = normalize(cleanTitle(candidate.name || ''));
    const targetTitleNorm = normalize(cleanTitle(targetTitle || ''));
    const targetTitleWords = targetTitleNorm.split(' ').filter(w => w.length > 1);

    if (!candidateTitle || targetTitleWords.length === 0) {
        details.titleMatch = 'unknown';
        details.titleScore = 0.5; // Sin info, asumimos neutral
    } else {
        let matchedWords = 0;
        for (const word of targetTitleWords) {
            if (candidateTitle.includes(word)) matchedWords++;
        }

        const titleRatio = matchedWords / targetTitleWords.length;

        if (titleRatio >= 0.8) {
            details.titleMatch = 'exact';
            details.titleScore = 1.0;
        } else if (titleRatio >= 0.5) {
            details.titleMatch = 'partial';
            details.titleScore = titleRatio;
        } else if (titleRatio > 0) {
            details.titleMatch = 'weak';
            details.titleScore = titleRatio * 0.7;
        } else {
            details.titleMatch = 'none';
            details.titleScore = 0.2;
        }
    }

    // === ARTISTA ===
    const candidateArtist = normalize(extractArtistName(candidate) || '');
    const candidateArtistList = splitArtists(candidateArtist);
    const targetArtistNorm = normalize(targetArtist || '');

    // ⭐ DETECCIÓN DE DÚO
    const duoInfo = detectDuo(targetArtist);
    const isDuo = duoInfo !== null;

    if (!targetArtistNorm) {
        details.artistMatch = 'unknown';
        details.artistScore = 0.6;
    } else if (isDuo) {
        // ═══════════════════════════════════════════════════════════════════
        // 🎭 LÓGICA ESPECIAL PARA DÚOS
        // ═══════════════════════════════════════════════════════════════════
        details.isDuoMatch = true;
        const duoMembers = duoInfo.members;
        let matchedMembers = 0;

        // Contar cuántos miembros del dúo aparecen en el candidato
        for (const member of duoMembers) {
            const memberNorm = normalize(member);
            // Verificar en lista de artistas del candidato
            for (const candA of candidateArtistList) {
                if (candA.includes(memberNorm) || memberNorm.includes(candA)) {
                    matchedMembers++;
                    break;
                }
            }
            // También verificar en string completo
            if (candidateArtist.includes(memberNorm)) {
                matchedMembers = Math.max(matchedMembers, 1);
            }
        }

        // También verificar si el candidato contiene el nombre completo del dúo
        if (candidateArtist.includes(normalize(duoInfo.canonicalName))) {
            matchedMembers = duoMembers.length; // Match completo
        }

        // REGLA DÚO:
        // - Al menos 1 miembro → artistScore 0.85 (FUERTE)
        // - Ambos miembros → artistScore 1.0 (PERFECTO)
        if (matchedMembers >= 2 || matchedMembers === duoMembers.length) {
            details.artistMatch = 'duo_full';
            details.artistScore = 1.0;
            console.log(`[duo] MATCH COMPLETO: ${duoInfo.canonicalName} en "${candidateArtist}"`);
        } else if (matchedMembers >= 1) {
            details.artistMatch = 'duo_partial';
            details.artistScore = 0.85; // ⭐ NO penalizar por solo uno
            console.log(`[duo] MATCH PARCIAL (${matchedMembers}/${duoMembers.length}): ${duoInfo.canonicalName} en "${candidateArtist}"`);
        } else {
            details.artistMatch = 'none';
            details.artistScore = 0.1;
        }
    } else {
        // ═══════════════════════════════════════════════════════════════════
        // LÓGICA ORIGINAL PARA ARTISTAS INDIVIDUALES
        // ═══════════════════════════════════════════════════════════════════
        const targetArtistList = splitArtists(targetArtist || '');
        let foundExact = false;
        let foundPartial = false;

        for (const targetA of targetArtistList.length > 0 ? targetArtistList : [targetArtistNorm]) {
            for (const candA of candidateArtistList) {
                if (candA === targetA || candA.includes(targetA) || targetA.includes(candA)) {
                    foundExact = true;
                    break;
                }
                const targetTokens = targetA.split(' ');
                const candTokens = candA.split(' ');
                const commonTokens = targetTokens.filter(t => candTokens.includes(t));
                if (commonTokens.length >= targetTokens.length * 0.5) {
                    foundPartial = true;
                }
            }
            if (foundExact) break;
        }

        if (!foundExact && (candidateArtist.includes(targetArtistNorm) || targetArtistNorm.includes(candidateArtist))) {
            foundExact = true;
        }

        if (!foundExact && !foundPartial) {
            const featuring = extractFeaturing(candidate.name || '');
            for (const feat of featuring) {
                const normFeat = normalize(feat);
                if (normFeat.includes(targetArtistNorm) || targetArtistNorm.includes(normFeat)) {
                    foundExact = true;
                    break;
                }
            }
        }

        if (foundExact) {
            details.artistMatch = 'exact';
            details.artistScore = 1.0;
        } else if (foundPartial) {
            details.artistMatch = 'partial';
            details.artistScore = 0.8;
        } else {
            details.artistMatch = 'none';
            details.artistScore = 0.1;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎧 REGLA REMIX AS PRIMARY ARTIST
    // ═══════════════════════════════════════════════════════════════════════════
    // Si el título indica un remix oficial y el artista buscado aparece como
    // remixer en el título, se permite que el remixer actúe como artista principal.
    // 
    // Caso de uso: "Fred again.. - Beto's Horns (fred remix)"
    // - Fred again.. es el remixer, NO el artista original
    // - En YouTube aparece como "Beto's Horns (Fred Again.. Remix)"
    // - Sin esta regla: artistScore cae porque Fred no es artista principal
    // - Con esta regla: Fred gana identidad porque el título lo respalda
    //
    // CONDICIONES SEGURAS:
    // 1. El título debe contener "remix" (versión válida)
    // 2. El artistScore actual debe ser bajo (< 0.5)
    // 3. El nombre del artista buscado debe aparecer en el título del candidato
    // 4. NO es live/cover/bootleg (ya filtrado antes)
    // ═══════════════════════════════════════════════════════════════════════════
    const isRemix = /\bremix\b/i.test(candidate.name || ''); // Usar título original, no limpiado

    if (isRemix && details.artistScore < 0.5 && targetArtistNorm) {
        // Verificar si el artista buscado aparece en el título (como remixer)
        const artistInTitle = candidateTitle.includes(targetArtistNorm);

        // También verificar tokens individuales para nombres compuestos
        // Ej: "fred again" -> verificar si "fred" y "again" están en el título
        const targetArtistTokens = targetArtistNorm.split(' ').filter(t => t.length > 2);
        const tokenMatchRatio = targetArtistTokens.filter(t => candidateTitle.includes(t)).length / targetArtistTokens.length;

        if (artistInTitle || tokenMatchRatio >= 0.7) {
            // Boost artistScore: el remixer es identidad válida
            details.artistScore = Math.max(details.artistScore, 0.7);
            details.artistMatch = 'remixer';
        }
    }

    // Score combinado - artista tiene más peso
    let combinedScore = (details.titleScore * 0.35) + (details.artistScore * 0.65);

    // ⭐ VETO TOTAL POR TÍTULO: Si el título no se parece, ES BASURA.
    // Si buscas "Thunderstruck" y sale "Back In Black", titleScore será muy bajo.
    // MATAMOS el resultado (score 0) para que ni siquiera se considere.
    if (details.titleScore < 0.4) {
        console.log(`[veto] Título no coincide: "${targetTitle}" vs "${candidateTitle}" (score: ${details.titleScore})`);
        combinedScore = 0.0;
    }

    return {
        score: combinedScore,
        details
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 2: TIPO DE VERSIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FASE 2: Detecta el tipo de versión
 * Las versiones prohibidas se rechazan antes de llegar aquí
 * Solo evalúa versiones válidas (original, remix, remaster, radio edit)
 */
function evaluateVersion(candidate) {
    const title = candidate.name || '';
    const version = detectValidVersion(title);
    const featuring = extractFeaturing(title);

    // Las versiones válidas tienen score alto
    const versionScores = {
        'original': 1.0,
        'remaster': 1.0,      // Remasters son excelentes
        'album_version': 1.0,
        'radio_edit': 0.95,   // Radio edits son válidos
        'remix': 0.90,        // Remixes oficiales son válidos
        'extended': 0.90
    };

    const score = versionScores[version.type] || 1.0;

    return {
        score,
        details: {
            version,
            featuring
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3: CONTEXTO MUSICAL (Simplificado)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FASE 3: Evalúa duración y álbum
 * - albumScore SOLO tiene peso si targetAlbum viene explícito
 * - NO penaliza compilaciones automáticamente
 */
function evaluateMusicalContext(candidate, targetDuration, targetAlbum) {
    const details = {
        durationDiff: null,
        durationScore: 1.0,
        albumMatch: 'unknown',
        albumScore: 0.5,
        isCompilation: false
    };

    // === DURACIÓN ===
    const candidateDuration = candidate.duration || 0;
    if (targetDuration > 0 && candidateDuration > 0) {
        const diff = Math.abs(candidateDuration - targetDuration);
        details.durationDiff = diff;

        if (diff <= 5) {
            details.durationScore = 1.0;
        } else if (diff <= 15) {
            details.durationScore = 0.9;
        } else if (diff <= 30) {
            details.durationScore = 0.75;
        } else if (diff <= 60) {
            details.durationScore = 0.5;
        } else {
            details.durationScore = 0.3;
        }
    }

    // === ÁLBUM (solo si viene explícito) ===
    const albumName = normalize(candidate.album?.name || candidate.album || '');
    const targetAlbumNorm = normalize(targetAlbum || '');

    // Detectar compilaciones (solo para info, no penaliza)
    const compilationPatterns = [
        'greatest hits', 'best of', 'the essential', 'anthology',
        'the very best', 'hits collection', 'grandes exitos'
    ];

    for (const pattern of compilationPatterns) {
        if (albumName.includes(pattern)) {
            details.isCompilation = true;
            break;
        }
    }

    // Comparar álbum SOLO si tenemos objetivo explícito
    if (targetAlbumNorm && albumName) {
        if (albumName.includes(targetAlbumNorm) || targetAlbumNorm.includes(albumName)) {
            details.albumMatch = 'exact';
            details.albumScore = 1.0;
        } else {
            const targetWords = targetAlbumNorm.split(' ').filter(w => w.length > 2);
            const albumWords = albumName.split(' ').filter(w => w.length > 2);
            const common = targetWords.filter(w => albumWords.includes(w));
            if (common.length >= targetWords.length * 0.5) {
                details.albumMatch = 'partial';
                details.albumScore = 0.7;
            }
        }
    }

    // Score: duración es lo único que realmente importa si no hay álbum target
    const durationWeight = targetDuration > 0 ? 0.8 : 0;
    const albumWeight = targetAlbumNorm ? 0.2 : 0; // Peso SOLO si viene explícito
    const baseWeight = 1 - durationWeight - albumWeight;

    const score = (details.durationScore * durationWeight) +
        (details.albumScore * albumWeight) +
        (1.0 * baseWeight);

    return {
        score: Math.max(0, Math.min(1, score)),
        details
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUACIÓN COMPLETA DE CANDIDATO v3.5 (Pipeline con Authority)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evalúa un candidato usando el pipeline v3.5
 * 
 * ORDEN EXACTO (NO NEGOCIABLE):
 * 1. Contenido basura → RECHAZO
 * 2. Título inválido → RECHAZO
 * 3. FASE 1: Identidad Primaria (artista + título)
 * 4. FASE 2: Versión prohibida (live, cover explícito, karaoke) → RECHAZO
 * 5. FASE 3: Autoridad del Canal ← NUEVA FASE CRÍTICA
 * 6. FASE 3.2: Cover implícito (authority LOW + scores altos) → RECHAZO
 * 7. FASE 4: Remix válido (solo HIGH/MEDIUM authority)
 * 8. Contexto Musical (duración)
 * 9. FASE 5: Decisión FINAL (identity * 0.6 + authority * 0.4)
 */
function evaluateCandidate(candidate, params) {
    const { targetArtist, targetTitle, targetDuration, targetAlbum } = params;
    const title = candidate.name || '';

    // ═══════════════════════════════════════════════════════════════════════════
    // PRE-FILTRO 1: Contenido basura
    // ═══════════════════════════════════════════════════════════════════════════
    if (isTrashContent(candidate, targetDuration)) {
        return {
            passed: false,
            rejected: true,
            rejectReason: 'trash_content',
            identityScore: 0,
            authorityScore: 0,
            authorityLevel: 'LOW',
            finalConfidence: 0,
            matchDetails: { reason: 'Contenido basura' }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRE-FILTRO 2: Título inválido (muy corto)
    // ═══════════════════════════════════════════════════════════════════════════
    const titleWords = title.trim().split(/\s+/).filter(w => w.length > 0);
    const hasMusicalSeparators = /[()-]/.test(title);

    if (titleWords.length < 2 && !hasMusicalSeparators) {
        return {
            passed: false,
            rejected: true,
            rejectReason: 'title_too_short',
            identityScore: 0,
            authorityScore: 0,
            authorityLevel: 'LOW',
            finalConfidence: 0,
            matchDetails: { reason: `Título inválido: "${title}" (muy corto)` }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 1: IDENTIDAD PRIMARIA
    // ═══════════════════════════════════════════════════════════════════════════
    const phase1 = evaluatePrimaryIdentity(candidate, targetArtist, targetTitle);
    const artistScore = phase1.details.artistScore;
    const titleScore = phase1.details.titleScore;

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 2: VERSIÓN PROHIBIDA (live, cover explícito, karaoke)
    // ═══════════════════════════════════════════════════════════════════════════
    const forbiddenVersion = detectForbiddenVersion(title, false);
    if (forbiddenVersion) {
        return {
            passed: false,
            rejected: true,
            rejectReason: 'forbidden_version',
            forbiddenType: forbiddenVersion,
            identityScore: phase1.score,
            authorityScore: 0,
            authorityLevel: 'LOW',
            finalConfidence: 0,
            matchDetails: { reason: `Versión prohibida: ${forbiddenVersion}` }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 3: AUTORIDAD DEL CANAL (CRÍTICA)
    // ═══════════════════════════════════════════════════════════════════════════
    const authority = evaluateChannelAuthority(candidate, targetArtist, phase1.score);

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 3.2: COVER IMPLÍCITO (authority LOW + scores altos = cover)
    // ═══════════════════════════════════════════════════════════════════════════
    const implicitCover = detectImplicitCover(authority, titleScore, artistScore);
    if (implicitCover.isImplicitCover) {
        console.log(`[reject] "${title}" - ${implicitCover.reason}`);
        return {
            passed: false,
            rejected: true,
            rejectReason: 'implicit_cover',
            identityScore: phase1.score,
            authorityScore: authority.score,
            authorityLevel: authority.level,
            finalConfidence: 0,
            matchDetails: {
                reason: implicitCover.reason,
                authorityReasons: authority.reasons
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 4: REMIX VÁLIDO (solo con autoridad HIGH/MEDIUM)
    // ═══════════════════════════════════════════════════════════════════════════
    const isRemix = /\bremix\b/i.test(title);
    const remixValidity = evaluateRemixValidity(isRemix, authority, artistScore);

    if (!remixValidity.isValid) {
        console.log(`[reject] "${title}" - ${remixValidity.reason}`);
        return {
            passed: false,
            rejected: true,
            rejectReason: 'unofficial_remix',
            identityScore: phase1.score,
            authorityScore: authority.score,
            authorityLevel: authority.level,
            finalConfidence: 0,
            matchDetails: {
                reason: remixValidity.reason,
                authorityReasons: authority.reasons
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTEXTO MUSICAL (duración, álbum)
    // ═══════════════════════════════════════════════════════════════════════════
    const phase2 = evaluateVersion(candidate);
    const phase3 = evaluateMusicalContext(candidate, targetDuration, targetAlbum);
    const durationScore = phase3.details.durationScore;

    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 5: DECISIÓN FINAL (identity * 0.6 + authority * 0.4)
    // ═══════════════════════════════════════════════════════════════════════════

    // Score combinado con Authority
    const finalScore = (phase1.score * 0.6) + (authority.score * 0.4);

    // Reglas de paso:
    // 1. finalScore >= 0.45
    // 2. O: identity >= 0.5 AND duration >= 0.7 AND authority !== LOW
    const passed =
        finalScore >= 0.45 ||
        (phase1.score >= 0.5 && durationScore >= 0.7 && authority.level !== 'LOW');

    // Log detallado para debugging
    if (passed) {
        console.log(`[accept] "${title}" | identity: ${phase1.score.toFixed(2)} | authority: ${authority.level} (${authority.score.toFixed(2)}) | final: ${finalScore.toFixed(2)}`);
    }

    return {
        passed,
        rejected: false,
        rejectReason: null,
        identityScore: phase1.score,
        versionScore: phase2.score,
        durationScore: durationScore,
        albumScore: phase3.details.albumScore,
        authorityScore: authority.score,
        authorityLevel: authority.level,
        finalConfidence: finalScore,
        matchDetails: {
            titleMatch: phase1.details.titleMatch,
            artistMatch: phase1.details.artistMatch,
            titleScore: phase1.details.titleScore,
            artistScore: phase1.details.artistScore,
            isDuoMatch: phase1.details.isDuoMatch,
            version: phase2.details.version,
            featuring: phase2.details.featuring,
            durationDiff: phase3.details.durationDiff,
            isCompilation: phase3.details.isCompilation,
            authority: {
                level: authority.level,
                score: authority.score,
                reasons: authority.reasons
            },
            remixValidity: remixValidity.reason
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API: BÚSQUEDA EXTERNA
// ═══════════════════════════════════════════════════════════════════════════════

async function searchApi(query, limit) {
    try {
        const url = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        console.log('[search] Fetching:', url);

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

// ═══════════════════════════════════════════════════════════════════════════════
// GENERADOR DE QUERIES DE REINTENTO INTELIGENTE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera secuencia de queries degradadas para reintentos.
 * Orden: artist+track → track+artist → track only → artist only
 * NUNCA relajar filtros de calidad.
 */
function generateRetryQueries(artist, track, originalQuery) {
    const queries = [];
    const artistNorm = (artist || '').trim();
    const trackNorm = (track || '').trim();

    // 1. Query original (ya intentada)
    // queries.push(originalQuery); // No incluir, ya se intentó

    // 2. artist + track (si ambos existen)
    if (artistNorm && trackNorm) {
        queries.push(`${artistNorm} ${trackNorm}`);
    }

    // 3. track + artist (orden invertido)
    if (trackNorm && artistNorm) {
        queries.push(`${trackNorm} ${artistNorm}`);
    }

    // 4. Solo track (sin artista)
    if (trackNorm && trackNorm.length > 2) {
        queries.push(trackNorm);
    }

    // 5. Solo artista (último recurso, puede dar resultado genérico)
    if (artistNorm && artistNorm.length > 2) {
        queries.push(artistNorm);
    }

    // Eliminar duplicados manteniendo orden
    const seen = new Set([originalQuery.toLowerCase()]);
    return queries.filter(q => {
        const lower = q.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL (con reintentos inteligentes)
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    const qRaw = req.query.q || req.query.query || '';
    let targetArtist = req.query.artist || '';
    let targetTrack = req.query.track || '';
    const targetDuration = parseInt(req.query.duration) || 0;
    const targetAlbum = req.query.album || '';
    const limit = parseInt(req.query.limit) || 10;

    if (!qRaw) {
        return res.status(400).json({ success: false, error: 'Missing q parameter' });
    }

    // Detección inteligente de artista si no viene explícito
    let searchQuery = qRaw;
    let detectedDuo = null;

    if (!targetArtist) {
        const detected = detectKnownArtist(qRaw);
        if (detected.artist) {
            console.log(`[SmartSearch] Detected Artist: "${detected.artist}"${detected.isDuo ? ' (DÚO)' : ''} | Track: "${detected.track}"`);
            targetArtist = detected.artist;
            targetTrack = detected.track || targetTrack;
            detectedDuo = detected.isDuo ? detected : null;

            // ⚠️ Para DÚOS: NO limpiar la query, usar completa
            if (detected.isDuo) {
                searchQuery = qRaw; // Preservar query original con ambos artistas
            } else if (!detected.track || detected.track.length < 2) {
                searchQuery = qRaw;
            } else {
                searchQuery = `${detected.artist} ${detected.track}`;
            }
        }
    }

    console.log(`[backend] Searching: "${searchQuery}" | Artist: "${targetArtist}" | Track: "${targetTrack}" (${targetDuration}s)`);

    // Construir clave (común para frozen y cache)
    const cacheKey = buildCacheKey({
        title: targetTrack || qRaw,
        artist: targetArtist,
        duration: targetDuration
    });

    // ❄️ FROZEN: Verificar primero - bypassea TODO el motor
    const frozen = frozenDecisions.get(cacheKey);
    if (frozen && Date.now() - frozen.timestamp < FREEZE_TTL) {
        const ageDays = Math.round((Date.now() - frozen.timestamp) / (1000 * 60 * 60 * 24));
        console.log(`[❄️ frozen] HIT for key: ${cacheKey} | Age: ${ageDays} days`);

        // Devolver la decisión congelada en formato compatible
        const fb = frozen.frozenBest;
        return res.status(200).json({
            success: true,
            source: 'frozen',
            frozenAt: new Date(frozen.timestamp).toISOString(),
            query: {
                original: qRaw,
                targetArtist,
                targetTrack,
                targetDuration,
                targetAlbum
            },
            // Resultado único (la decisión congelada)
            results: [{
                title: fb.title,
                author: { name: fb.artist },
                duration: fb.duration,
                videoId: fb.videoId,
                thumbnail: fb.thumbnail || '',
                album: fb.album || null,
                source: 'frozen',
                scores: {
                    finalConfidence: fb.confidence
                }
            }]
        });
    }

    // ⭐ CACHE: Verificar cache estándar (24h)
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[cache] HIT for key: ${cacheKey}`);
        return res.status(200).json({
            success: true,
            source: 'cache',
            cachedAt: new Date(cached.timestamp).toISOString(),
            ...cached.result
        });
    }

    // Buscar candidatos
    const results = await searchApi(searchQuery, 35);

    // Evaluar cada candidato
    const passedCandidates = [];
    const fallbackCandidates = []; // Para evitar 0 resultados

    const evaluationParams = {
        targetArtist,
        targetTitle: targetTrack || qRaw,
        targetDuration,
        targetAlbum
    };

    for (const item of results) {
        const evaluation = evaluateCandidate(item, evaluationParams);

        item._evaluation = evaluation;
        item._artistName = extractArtistName(item);

        if (evaluation.rejected) {
            // Rechazado (versión prohibida o basura)
            console.log(`[reject] "${item.name}" - ${evaluation.rejectReason}: ${evaluation.forbiddenType || evaluation.matchDetails?.reason}`);
        } else if (evaluation.passed) {
            // Pasó el filtro
            passedCandidates.push(item);
        } else {
            // ═══════════════════════════════════════════════════════════════════
            // FASE 6 (UX): Fallback pero NUNCA covers
            // ═══════════════════════════════════════════════════════════════════
            // Solo agregar a fallback si:
            // 1. identityScore >= 0.35
            // 2. authority !== LOW (CRÍTICO: nunca devolver covers)
            if (evaluation.identityScore >= 0.35 && evaluation.authorityLevel !== 'LOW') {
                fallbackCandidates.push(item);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // ⭐ REGLA 6 MEJORADA: REINTENTOS INTELIGENTES + NUNCA COVERS
    // ═══════════════════════════════════════════════════════════════════════════════
    let finalCandidates = passedCandidates;
    let usedFallback = false;
    let usedRetry = false;
    let retryQuery = null;

    // Fallback: usar solo candidatos con authority !== LOW
    if (passedCandidates.length === 0 && fallbackCandidates.length > 0) {
        console.log(`[fallback] No passed candidates, using ${fallbackCandidates.length} fallback candidates (authority != LOW)`);
        finalCandidates = fallbackCandidates;
        usedFallback = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔄 REINTENTOS INTELIGENTES: Si aún no hay resultados, probar queries degradadas
    // ═══════════════════════════════════════════════════════════════════════════════
    if (finalCandidates.length === 0) {
        const retryQueries = generateRetryQueries(targetArtist, targetTrack || qRaw, searchQuery);

        console.log(`[retry] No results with primary query. Trying ${retryQueries.length} alternate queries...`);

        for (const altQuery of retryQueries) {
            console.log(`[retry] Trying: "${altQuery}"`);

            const retryResults = await searchApi(altQuery, 25);

            if (retryResults.length === 0) continue;

            // Evaluar con los MISMOS parámetros (no relajar filtros)
            for (const item of retryResults) {
                const evaluation = evaluateCandidate(item, evaluationParams);
                item._evaluation = evaluation;
                item._artistName = extractArtistName(item);

                if (evaluation.passed) {
                    finalCandidates.push(item);
                } else if (evaluation.identityScore >= 0.35 && !evaluation.rejected) {
                    fallbackCandidates.push(item);
                }
            }

            // Si encontramos resultados válidos, detenernos
            if (finalCandidates.length > 0) {
                usedRetry = true;
                retryQuery = altQuery;
                console.log(`[retry] SUCCESS with "${altQuery}": ${finalCandidates.length} candidates`);
                break;
            }
        }

        // Si aún no hay passed pero hay fallback del retry, usarlos
        if (finalCandidates.length === 0 && fallbackCandidates.length > 0) {
            console.log(`[retry-fallback] Using ${fallbackCandidates.length} fallback candidates from retries`);
            finalCandidates = fallbackCandidates;
            usedFallback = true;
            usedRetry = true;
        }
    }

    // Ordenar por confidence final
    finalCandidates.sort((a, b) => b._evaluation.finalConfidence - a._evaluation.finalConfidence);

    // Formatear respuesta
    const final = finalCandidates.slice(0, limit).map(item => {
        const ev = item._evaluation;
        return {
            title: item.name || 'Sin título',
            author: { name: item._artistName || 'Unknown' },
            duration: item.duration || 0,
            videoId: item.id,
            thumbnail: item.image?.find(i => i.quality === '500x500')?.url ||
                item.image?.[0]?.url || '',
            album: item.album?.name || item.album || null,
            source: 'saavn',
            scores: {
                identityScore: Math.round(ev.identityScore * 100) / 100,
                versionScore: Math.round(ev.versionScore * 100) / 100,
                durationScore: Math.round(ev.durationScore * 100) / 100,
                albumScore: Math.round(ev.albumScore * 100) / 100,
                finalConfidence: Math.round(ev.finalConfidence * 100) / 100
            },
            matchDetails: ev.matchDetails
        };
    });

    // Log del mejor resultado
    if (final.length > 0) {
        const best = final[0];
        const sourceNote = usedRetry ? ` (retry: "${retryQuery}")` : (usedFallback ? ' (fallback)' : '');
        console.log(`[bestMatch] "${best.title}" by ${best.author.name} | Confidence: ${best.scores.finalConfidence}${sourceNote}`);

        // ⭐ CACHE: Guardar resultado si confidence es suficiente
        if (best.scores.finalConfidence >= MIN_CONFIDENCE_TO_CACHE) {
            searchCache.set(cacheKey, {
                timestamp: Date.now(),
                result: {
                    query: {
                        original: qRaw,
                        targetArtist,
                        targetTrack,
                        targetDuration,
                        targetAlbum
                    },
                    totalCandidates: results.length,
                    passedCandidates: passedCandidates.length,
                    usedFallback,
                    usedRetry,
                    retryQuery,
                    results: final
                }
            });
            console.log(`[cache] SET for key: ${cacheKey}`);
        }

        // ❄️ FROZEN: Congelar decisión si confidence es muy alta
        if (best.scores.finalConfidence >= MIN_CONFIDENCE_TO_FREEZE) {
            frozenDecisions.set(cacheKey, {
                timestamp: Date.now(),
                frozenBest: {
                    videoId: best.videoId,
                    title: best.title,
                    artist: best.author.name,
                    confidence: best.scores.finalConfidence,
                    duration: best.duration,
                    thumbnail: best.thumbnail,
                    album: best.album
                }
            });
            console.log(`[❄️ frozen] SET for key: ${cacheKey} | Confidence: ${best.scores.finalConfidence}`);
        }
    } else {
        // ⚠️ SOLO ahora, después de TODOS los reintentos, declarar "no encontrado"
        console.log(`[ERROR] No results found after all retries for: "${qRaw}"`);
    }

    return res.status(200).json({
        success: true,
        source: usedRetry ? 'retry' : 'api',
        query: {
            original: qRaw,
            targetArtist,
            targetTrack,
            targetDuration,
            targetAlbum
        },
        totalCandidates: results.length,
        passedCandidates: passedCandidates.length,
        usedFallback,
        usedRetry,
        retryQuery,
        results: final
    });
}

export default allowCors(handler);