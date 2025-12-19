/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 MUSIC SEARCH ENGINE v3.2 - STUDIO QUALITY ONLY
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * VISIÓN DEL PRODUCTO:
 * - SOLO música de estudio de calidad
 * - Singles, álbumes y EPs oficiales
 * - Remixes oficiales SÍ son válidos
 * - Remasters oficiales SÍ son válidos
 * 
 * VERSIONES PROHIBIDAS (RECHAZO INMEDIATO):
 * - live, acoustic, unplugged, cover, karaoke
 * - instrumental, sped up, slowed, nightcore, tribute
 * 
 * REGLA DE ORO:
 * Si la canción NO es de estudio → NO devolver
 * Si la canción ES de estudio correcta → SIEMPRE devolver
 * 
 * REGLA CLAVE v3.2:
 * El uploader del video NO define la validez del track.
 * La identidad musical SÍ.
 * Un track es válido si:
 * - artistScore >= 0.8 AND titleScore >= 0.7 AND durationScore >= 0.8
 * - NO es versión prohibida
 * - Duración <= 15 min (no album-mix)
 */

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
// ARTISTAS CONOCIDOS
// ═══════════════════════════════════════════════════════════════════════════════

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

function detectKnownArtist(query) {
    const qNorm = normalize(query);
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

    return { artist: bestMatch, track: cleanQuery };
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
// FASE 1: IDENTIDAD PRIMARIA (Más permisiva)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FASE 1: Confirma título y artista
 * REGLA: Si artistScore >= 0.8, NO rechazar aunque titleScore sea bajo
 * El título NO puede ser el único motivo de rechazo
 */
function evaluatePrimaryIdentity(candidate, targetArtist, targetTitle) {
    const details = {
        titleMatch: 'none',
        artistMatch: 'none',
        titleScore: 0,
        artistScore: 0
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
            details.titleScore = titleRatio * 0.7; // Menos penalización
        } else {
            details.titleMatch = 'none';
            details.titleScore = 0.2; // Mínimo para no hundir el score
        }
    }

    // === ARTISTA ===
    const candidateArtist = normalize(extractArtistName(candidate) || '');
    const candidateArtistList = splitArtists(candidateArtist);
    const targetArtistNorm = normalize(targetArtist || '');
    const targetArtistList = splitArtists(targetArtist || '');

    if (!targetArtistNorm) {
        details.artistMatch = 'unknown';
        details.artistScore = 0.6; // Sin target, asumimos neutral-positivo
    } else {
        let foundExact = false;
        let foundPartial = false;

        // Buscar en lista de artistas
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

        // También verificar en string completo
        if (!foundExact && (candidateArtist.includes(targetArtistNorm) || targetArtistNorm.includes(candidateArtist))) {
            foundExact = true;
        }

        // Verificar en featuring del título
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
            details.artistScore = 0.7;
        } else {
            details.artistMatch = 'none';
            details.artistScore = 0.1;
        }
    }

    // Score combinado - artista tiene más peso
    const combinedScore = (details.titleScore * 0.35) + (details.artistScore * 0.65);

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
// EVALUACIÓN COMPLETA DE CANDIDATO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evalúa un candidato completo
 * Orden de rechazo:
 * 1. Contenido basura → RECHAZO
 * 2. Versión prohibida (live, cover, etc.) → RECHAZO
 * 3. Evaluación de identidad, versión, contexto → SCORE
 */
function evaluateCandidate(candidate, params) {
    const { targetArtist, targetTitle, targetDuration, targetAlbum } = params;
    const title = candidate.name || '';

    // 1. PRE-FILTRO: Contenido basura
    if (isTrashContent(candidate, targetDuration)) {
        return {
            passed: false,
            rejected: true,
            rejectReason: 'trash_content',
            identityScore: 0,
            versionScore: 0,
            durationScore: 0,
            albumScore: 0,
            finalConfidence: 0,
            matchDetails: { reason: 'Contenido basura' }
        };
    }

    // 2. ⭐ RECHAZO INMEDIATO: Versiones prohibidas (excepto remix, que se evalúa después)
    const forbiddenVersion = detectForbiddenVersion(title, false);
    if (forbiddenVersion) {
        return {
            passed: false,
            rejected: true,
            rejectReason: 'forbidden_version',
            forbiddenType: forbiddenVersion,
            identityScore: 0,
            versionScore: 0,
            durationScore: 0,
            albumScore: 0,
            finalConfidence: 0,
            matchDetails: { reason: `Versión prohibida: ${forbiddenVersion}` }
        };
    }

    // 3. FASE 1: Identidad Primaria
    const phase1 = evaluatePrimaryIdentity(candidate, targetArtist, targetTitle);

    // 4. ⭐ REGLA 3: Remix - rechazar solo si identidad es débil o parece cover/tribute
    const isRemix = /\bremix\b/i.test(title);
    if (isRemix && phase1.score < 0.6) {
        // Remix con identidad débil - verificar si es cover camuflado
        const lowerTitle = title.toLowerCase();
        const isCoverRemix = /\b(cover|tribute|style\s*of)\b/i.test(lowerTitle);
        if (isCoverRemix || phase1.score < 0.35) {
            return {
                passed: false,
                rejected: true,
                rejectReason: 'weak_remix',
                identityScore: phase1.score,
                versionScore: 0,
                durationScore: 0,
                albumScore: 0,
                finalConfidence: 0,
                matchDetails: { reason: `Remix con identidad débil (${phase1.score.toFixed(2)})` }
            };
        }
    }

    // 5. FASE 2: Tipo de Versión (válida)
    const phase2 = evaluateVersion(candidate);

    // 6. FASE 3: Contexto Musical
    const phase3 = evaluateMusicalContext(candidate, targetDuration, targetAlbum);

    // 7. Calcular confidence final
    const weights = {
        identity: 0.50,    // Identidad es lo más importante
        version: 0.15,     // Versión
        context: 0.35      // Contexto (duración principalmente)
    };

    const finalConfidence =
        (phase1.score * weights.identity) +
        (phase2.score * weights.version) +
        (phase3.score * weights.context);

    // 8. ⭐ REGLA DE PASO v3.2: Basada en identidad musical
    // 
    // NUEVA REGLA: Aceptar track si identidad musical es clara,
    // independientemente del canal/uploader.
    //
    // Criterios de aceptación:
    // - artistScore >= 0.8 AND titleScore >= 0.7 AND durationScore >= 0.8 (identidad fuerte)
    // - O: identityScore >= 0.4 (regla anterior)
    // - O: identityScore >= 0.3 AND durationScore >= 0.7 (regla anterior)
    //
    const artistScore = phase1.details.artistScore;
    const titleScore = phase1.details.titleScore;
    const durationScore = phase3.details.durationScore;

    // Regla de identidad musical fuerte (para subidas no oficiales)
    const hasStrongMusicalIdentity =
        artistScore >= 0.8 &&
        titleScore >= 0.7 &&
        durationScore >= 0.8;

    // Reglas anteriores
    const passesIdentityThreshold = phase1.score >= 0.4;
    const passesWithDuration = phase1.score >= 0.3 && durationScore >= 0.7;

    const passed = hasStrongMusicalIdentity || passesIdentityThreshold || passesWithDuration;

    return {
        passed,
        rejected: false, // No rechazado, solo no pasó el umbral
        rejectReason: null,
        identityScore: phase1.score,
        versionScore: phase2.score,
        durationScore: phase3.details.durationScore,
        albumScore: phase3.details.albumScore,
        finalConfidence,
        matchDetails: {
            titleMatch: phase1.details.titleMatch,
            artistMatch: phase1.details.artistMatch,
            titleScore: phase1.details.titleScore,
            artistScore: phase1.details.artistScore,
            version: phase2.details.version,
            featuring: phase2.details.featuring,
            durationDiff: phase3.details.durationDiff,
            isCompilation: phase3.details.isCompilation,
            hasStrongMusicalIdentity // ⭐ Nuevo: indica si pasó por identidad fuerte
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
// HANDLER PRINCIPAL
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
    if (!targetArtist) {
        const detected = detectKnownArtist(qRaw);
        if (detected.artist) {
            console.log(`[SmartSearch] Detected Artist: "${detected.artist}" | Track: "${detected.track}"`);
            targetArtist = detected.artist;
            targetTrack = detected.track || targetTrack;

            if (!detected.track || detected.track.length < 2) {
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
            // No pasó pero es válido (para fallback)
            // Solo agregar si tiene identityScore decente
            if (evaluation.identityScore >= 0.35) {
                fallbackCandidates.push(item);
            }
        }
    }

    // ⭐ REGLA 6: Nunca devolver 0 resultados
    let finalCandidates = passedCandidates;
    let usedFallback = false;

    if (passedCandidates.length === 0 && fallbackCandidates.length > 0) {
        console.log(`[fallback] No passed candidates, using ${fallbackCandidates.length} fallback candidates`);
        finalCandidates = fallbackCandidates;
        usedFallback = true;
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
        console.log(`[bestMatch] "${best.title}" by ${best.author.name} | Confidence: ${best.scores.finalConfidence}${usedFallback ? ' (fallback)' : ''}`);

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
                    results: final
                }
            });
            console.log(`[cache] SET for key: ${cacheKey}`);
        }

        // ❄️ FROZEN: Congelar decisión si confidence es muy alta
        // REGLA: Congela la decisión, no el informe (menos RAM, más claridad)
        if (best.scores.finalConfidence >= MIN_CONFIDENCE_TO_FREEZE) {
            frozenDecisions.set(cacheKey, {
                timestamp: Date.now(),
                // Solo guardamos la decisión, no todo el resultado
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
        console.log(`[warning] No results found for: "${qRaw}"`);
    }

    return res.status(200).json({
        success: true,
        source: 'api',
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
        results: final
    });
}

export default allowCors(handler);