const SOURCE_API = 'https://appmusic-phi.vercel.app';

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

const LEET_MAP = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' };

/**
 * ⭐ NORMALIZACIÓN BÁSICA: Convierte texto a minúsculas, elimina acentos y leetspeak
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
 * ⭐ NUEVO: Limpia sufijos comunes de títulos para mejor comparación
 * Remueve: (Official Video), [HQ], (Lyrics), (Audio), (Remastered), etc.
 */
function cleanTitle(text) {
    if (!text) return '';
    let clean = text;

    // Patrones entre paréntesis que son ruido
    const parenPatterns = [
        /\(official\s*(music\s*)?video\)/gi,
        /\(official\s*audio\)/gi,
        /\(official\)/gi,
        /\(lyrics?\s*(video)?\)/gi,
        /\(audio\s*(oficial)?\)/gi,
        /\(video\s*(oficial|clip)?\)/gi,
        /\(hd|hq|4k|1080p?\)/gi,
        /\(remaster(ed)?\s*\d*\)/gi,
        /\(explicit\)/gi,
        /\(clean\s*version\)/gi,
        /\(from\s+[^)]+\)/gi,  // (from Movie Name)
        /\(\d{4}\s*(remaster)?\)/gi,  // (2020 Remaster)
        /\(radio\s*edit\)/gi,
        /\(single\s*version\)/gi,
        /\(album\s*version\)/gi,
        /\(extended\s*(mix|version)?\)/gi,
    ];

    // Patrones entre corchetes
    const bracketPatterns = [
        /\[official\s*(music\s*)?video\]/gi,
        /\[hd|hq|4k\]/gi,
        /\[lyrics?\]/gi,
        /\[audio\]/gi,
        /\[explicit\]/gi,
        /\[remaster(ed)?\]/gi,
    ];

    for (const pattern of parenPatterns) {
        clean = clean.replace(pattern, '');
    }
    for (const pattern of bracketPatterns) {
        clean = clean.replace(pattern, '');
    }

    // Limpiar espacios múltiples
    return clean.replace(/\s+/g, ' ').trim();
}

/**
 * ⭐ NUEVO: Extrae artistas colaboradores del título
 * Detecta patrones como: "feat.", "ft.", "featuring", "with", "x", "&"
 * Retorna array de nombres de artistas encontrados en el título
 */
function extractFeaturingFromTitle(title) {
    if (!title) return [];

    const featuring = [];
    const normalTitle = title.toLowerCase();

    // Patrones de featuring con captura
    const patterns = [
        /\(?feat\.?\s+([^)(\[\]]+)\)?/gi,
        /\(?ft\.?\s+([^)(\[\]]+)\)?/gi,
        /\(?featuring\s+([^)(\[\]]+)\)?/gi,
        /\(?with\s+([^)(\[\]]+)\)?/gi,
        /\(?prod\.?\s*(by)?\s+([^)(\[\]]+)\)?/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(normalTitle)) !== null) {
            // El último grupo capturado contiene el nombre
            const artistPart = match[match.length - 1] || match[1];
            if (artistPart) {
                // Puede haber múltiples artistas separados por , o &
                const artists = artistPart.split(/[,&]/).map(a => a.trim()).filter(a => a.length > 1);
                featuring.push(...artists);
            }
        }
    }

    return featuring;
}

/**
 * ⭐ NUEVO: Divide un string de artistas en artistas individuales
 * "Shakira, Alejandro Sanz" → ["shakira", "alejandro sanz"]
 * "Daft Punk & Pharrell Williams" → ["daft punk", "pharrell williams"]
 */
function splitArtists(artistString) {
    if (!artistString) return [];

    // Separadores comunes entre artistas
    const separators = /[,&]|\s+(?:and|y|feat\.?|ft\.?|featuring|with|x)\s+/gi;

    return artistString
        .split(separators)
        .map(a => normalize(a))
        .filter(a => a.length > 1);
}

/**
 * ⭐ MEJORADO: Extrae el nombre del artista de múltiples campos posibles
 * Ahora también almacena la lista de artistas individuales para mejor matching
 */
function extractArtistName(item) {
    let rawArtist = '';

    // Intentar diferentes campos donde puede venir el artista
    if (item.primaryArtists && item.primaryArtists.trim()) {
        rawArtist = item.primaryArtists.trim();
    } else if (item.artist && typeof item.artist === 'string' && item.artist.trim()) {
        rawArtist = item.artist.trim();
    } else if (item.artists) {
        // Si es un objeto con primary
        if (item.artists.primary && Array.isArray(item.artists.primary)) {
            const names = item.artists.primary.map(a => a.name || a).filter(Boolean);
            if (names.length > 0) rawArtist = names.join(', ');
        }
        // Si es un array directo
        else if (Array.isArray(item.artists)) {
            const names = item.artists.map(a => a.name || a).filter(Boolean);
            if (names.length > 0) rawArtist = names.join(', ');
        }
        // Si es string
        else if (typeof item.artists === 'string' && item.artists.trim()) {
            rawArtist = item.artists.trim();
        }
    }

    if (!rawArtist && item.more_info) {
        if (item.more_info.artistMap && item.more_info.artistMap.primary_artists) {
            const artists = item.more_info.artistMap.primary_artists;
            if (Array.isArray(artists)) {
                const names = artists.map(a => a.name || a).filter(Boolean);
                if (names.length > 0) rawArtist = names.join(', ');
            }
        }
        if (!rawArtist && item.more_info.primary_artists && item.more_info.primary_artists.trim()) {
            rawArtist = item.more_info.primary_artists.trim();
        }
    }

    if (!rawArtist && item.subtitle && item.subtitle.trim()) {
        rawArtist = item.subtitle.trim();
    }

    if (!rawArtist && item.music && item.music.trim()) {
        rawArtist = item.music.trim();
    }

    // Almacenar la lista de artistas individuales para el matching
    item._artistList = splitArtists(rawArtist);

    // También agregar artistas del título (featuring)
    const titleFeaturing = extractFeaturingFromTitle(item.name || '');
    for (const feat of titleFeaturing) {
        const normFeat = normalize(feat);
        if (!item._artistList.includes(normFeat)) {
            item._artistList.push(normFeat);
        }
    }

    return rawArtist;
}

// Artistas conocidos para dar bonus
const KNOWN_ARTISTS = {
    'mana': ['maná'],
    'radiohead': ['radiohead'],
    'coldplay': ['coldplay'],
    'ca7riel': ['catriel', 'ca7riel'],
    'paco amoroso': ['paco', 'amoroso'],
    'soda stereo': ['soda', 'stereo'],
    'cerati': ['cerati'],
    'shakira': ['shakira'],
    'bad bunny': ['bad bunny'],
    'daddy yankee': ['daddy yankee'],
    'duki': ['duki'],
    'bizarrap': ['bizarrap', 'bzrp'],
    'taylor swift': ['taylor swift'],
    'the weeknd': ['weeknd'],
    'queen': ['queen'],
    'nirvana': ['nirvana'],
    'metallica': ['metallica'],
    'guns n roses': ['guns', 'roses'],
    'pink floyd': ['floyd'],
    'led zeppelin': ['zeppelin'],
    'the beatles': ['beatles'],
    'ac dc': ['acdc', 'ac dc'],
    'linkin park': ['linkin park'],
    'green day': ['green day'],
    'oasis': ['oasis'],
    'arctic monkeys': ['arctic monkeys'],
    'imagine dragons': ['imagine dragons'],
    'maroon 5': ['maroon'],
    'bruno mars': ['bruno mars'],
    'ed sheeran': ['sheeran'],
    'adele': ['adele'],
    'rihanna': ['rihanna'],
    'beyonce': ['beyonce'],
    'drake': ['drake'],
    'eminem': ['eminem'],
    'kendrick lamar': ['kendrick'],
    'kanye west': ['kanye'],
    'travis scott': ['travis scott'],
    'post malone': ['post malone'],
    'dua lipa': ['dua lipa'],
    'billie eilish': ['billie', 'eilish'],
    'harry styles': ['harry styles'],
    'ariana grande': ['ariana'],
    'justin bieber': ['bieber'],
    'selena gomez': ['selena gomez'],
    'katy perry': ['katy perry'],
    'lady gaga': ['gaga'],
    'miley cyrus': ['miley'],
    'sia': ['sia'],
    'lana del rey': ['lana del rey'],
    'hozier': ['hozier'],
    'tame impala': ['tame impala'],
    'gorillaz': ['gorillaz'],
    'daft punk': ['daft punk'],
    'deadmau5': ['deadmau5'],
    'skrillex': ['skrillex'],
    'calvin harris': ['calvin harris'],
    'david guetta': ['guetta'],
    'avicii': ['avicii'],
    'marshmello': ['marshmello'],
    'j balvin': ['balvin'],
    'ozuna': ['ozuna'],
    'maluma': ['maluma'],
    'anuel aa': ['anuel'],
    'karol g': ['karol'],
    'rauw alejandro': ['rauw'],
    'feid': ['feid'],
    'myke towers': ['myke towers'],
    'grupo 5': ['grupo 5'],
    'los angeles azules': ['angeles azules'],
    'hector lavoe': ['lavoe'],
    'willie colon': ['colon'],
    'marc anthony': ['marc anthony'],
    'juan gabriel': ['juan gabriel'],
    'luis miguel': ['luis miguel'],
    'jose jose': ['jose jose']
};

function detectArtist(query) {
    const qn = normalize(query);
    for (const [name, tokens] of Object.entries(KNOWN_ARTISTS)) {
        for (const t of tokens) {
            if (qn.includes(t)) return { name, tokens };
        }
    }
    const w = qn.split(' ');
    return w.length > 0 ? { name: w[0], tokens: [w[0]] } : null;
}

// Artistas/contenido basura - RECHAZAR
const TRASH_ARTISTS = [
    'sweet little band', 'rockabye baby', 'lullaby', 'twinkle',
    'vitamin string quartet', 'piano tribute', 'tribute',
    'tropical panama', 'chichimarimba', 'karaoke',
    'para ninos', 'infantil', 'midi', 'cover band',
    'sleep', 'relaxing', 'baby', 'meditation'
];

const TRASH_WORDS = [
    'karaoke', 'chipmunk', 'nightcore', '8d audio',
    'ringtone', 'tono de llamada', 'music box',
    'lullaby', 'para bebes', 'tutorial', 'lesson'
];

const PENALTY_WORDS = ['cover', 'tribute', 'version', 'remix', 'live', 'en vivo', 'acoustic', 'slowed', 'reverb', 'medley', 'mashup', 'megamix'];
const ARTIST_BLACKLIST = ['cover', 'tribute', 'karaoke', 'instrumental', 'ringtone'];

function shouldReject(item, artistName) {
    const title = normalize(item.name || '');
    const artist = normalize(artistName);

    // 1.Rechazo por Artista Basura
    for (const trash of TRASH_ARTISTS) {
        if (artist.includes(trash)) return true;
    }

    // 2.Rechazo por Palabras Prohibidas en Título
    for (const word of TRASH_WORDS) {
        if (title.includes(word)) return true;
    }

    // ⭐ NUEVO: Si el ARTISTA dice explícitamente "Cover" (ej: "Radiohead Cover Band")
    for (const bad of ARTIST_BLACKLIST) {
        if (artist.includes(bad)) return true;
    }

    if ((item.duration || 0) > 900) return true; // Muy larga
    if ((item.duration || 0) < 45) return true;  // Muy corta (ringtone)

    return false;
}

/**
 * ⭐ MEJORADO: Verifica coincidencia de artista con soporte para:
 * - Colaboraciones: "Shakira & Alejandro Sanz" match "Shakira" → exact
 * - Featuring en título: Si el artista está en el título como feat.
 * - Múltiples artistas separados por coma, &, etc.
 * 
 * @param {string} target - Artista buscado por el usuario
 * @param {string|string[]} currentOrList - Artista del resultado o lista de artistas
 * @param {object} item - El item completo (para acceder a _artistList)
 * @returns {'exact'|'partial'|'none'}
 */
function checkArtistMatch(target, currentOrList, item = null) {
    const nTarget = normalize(target);

    if (!nTarget) return 'none';

    // Obtener lista de artistas del item si está disponible
    let artistList = [];
    if (item && item._artistList && Array.isArray(item._artistList)) {
        artistList = item._artistList;
    } else if (Array.isArray(currentOrList)) {
        artistList = currentOrList.map(a => normalize(a));
    } else if (typeof currentOrList === 'string') {
        artistList = splitArtists(currentOrList);
    }

    const nCurrent = Array.isArray(currentOrList)
        ? currentOrList.map(a => normalize(a)).join(' ')
        : normalize(currentOrList || '');

    if (!nCurrent && artistList.length === 0) return 'none';

    // Tokens del artista buscado (para búsquedas como "Daft Punk Julian Casablancas")
    const targetTokens = nTarget.split(' ').filter(w => w.length > 1);
    const targetArtists = splitArtists(target);

    // 1. COINCIDENCIA DIRECTA: El artista buscado está contenido en la lista
    // Esto resuelve: buscar "Shakira" → encontrar "Shakira, Alejandro Sanz" = EXACT
    for (const artist of artistList) {
        if (artist.includes(nTarget) || nTarget.includes(artist)) {
            return 'exact';
        }
    }

    // 2. COINCIDENCIA DIRECTA en string completo
    if (nCurrent.includes(nTarget) || nTarget.includes(nCurrent)) {
        return 'exact';
    }

    // 3. COINCIDENCIA POR TOKENS: Verificar si TODOS los artistas buscados están
    // Esto resuelve: buscar "Daft Punk Julian Casablancas" → todos deben estar
    if (targetArtists.length > 1) {
        let allFound = true;
        for (const searchArtist of targetArtists) {
            let found = false;
            for (const itemArtist of artistList) {
                if (itemArtist.includes(searchArtist) || searchArtist.includes(itemArtist)) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                allFound = false;
                break;
            }
        }
        if (allFound) return 'exact';
    }

    // 4. TOKEN MATCHING: Buscar palabras individuales
    const tCurrent = nCurrent.split(' ').filter(w => w.length > 1);

    let matches = 0;
    for (const w of targetTokens) {
        if (tCurrent.includes(w)) matches++;
        // También buscar en la lista de artistas
        for (const artist of artistList) {
            if (artist.includes(w)) {
                matches++;
                break;
            }
        }
    }

    // Normalizar matches (puede haber duplicados)
    const uniqueMatches = Math.min(matches, targetTokens.length);

    if (uniqueMatches >= targetTokens.length) return 'exact';
    if (uniqueMatches > 0 && uniqueMatches >= (targetTokens.length / 2)) return 'partial';

    return 'none';
}

/**
 * ⭐ MEJORADO: Calcula el score de un resultado con:
 * - Limpieza de títulos para mejor comparación
 * - Detección de featuring/colaboradores en el título
 * - Penalización de compilaciones (Greatest Hits, Best Of)
 * - Priorización de versiones de álbum original
 * 
 * @param {object} item - Resultado de la API
 * @param {string[]} qWords - Palabras de la query normalizada
 * @param {string} targetArtist - Artista buscado
 * @param {string} targetTrack - Canción buscada
 * @param {number} targetDuration - Duración esperada
 * @returns {number} Score final
 */
function calcScore(item, qWords, targetArtist, targetTrack, targetDuration) {
    let score = 50;

    const rawTitle = item.name || '';
    const cleanedTitle = cleanTitle(rawTitle);  // ⭐ NUEVO: Título limpio
    const title = normalize(cleanedTitle);
    const rawTitleNorm = normalize(rawTitle);

    // Extraemos el artista del resultado una sola vez
    const itemArtist = normalize(item._artistName || extractArtistName(item) || '');
    const duration = item.duration || 0;
    const albumName = normalize(item.album?.name || item.album || '');

    // --- 1. FILTRO DE ARTISTA INTELIGENTE ---
    if (targetArtist && targetArtist.length > 1) {
        // ⭐ NUEVO: Pasar el item para usar _artistList
        const matchType = checkArtistMatch(targetArtist, itemArtist, item);

        if (matchType === 'exact') {
            score += 100; // ¡Es el artista correcto!
        } else if (matchType === 'partial') {
            score += 50;  // Es probablemente el artista (ej: Feat, o solo un miembro)
        } else {
            // ⭐ NUEVO: Buscar el artista en el título (caso "feat. Julian Casablancas")
            const artistInTitle = checkArtistMatchInTitle(targetArtist, rawTitle);
            if (artistInTitle === 'exact') {
                score += 80;  // Artista encontrado en el título como featuring
            } else if (artistInTitle === 'partial') {
                score += 30;
            } else {
                // Penalización suave: Si el título es MUY bueno, aún podría salvarse.
                score -= 50;
            }
        }
    }

    // --- 2. COINCIDENCIA DE TÍTULO (con título limpio) ---
    const targetTrackClean = cleanTitle(targetTrack || '');
    const trackWords = normalize(targetTrackClean).split(' ').filter(w => w.length > 2);
    let wordsFound = 0;
    for (const w of trackWords) {
        // Buscar en título limpio (sin sufijos)
        if (title.includes(w)) wordsFound++;
    }

    if (wordsFound === trackWords.length && trackWords.length > 0) {
        score += 60;  // ⭐ Bonus mayor por match perfecto de título
    } else if (wordsFound > 0) {
        score += 10 + (wordsFound * 10);  // Bonus proporcional
    }

    // ⭐ NUEVO: Bonus extra si el título limpio coincide exactamente
    if (trackWords.length > 0 && title === normalize(targetTrackClean)) {
        score += 30;  // Match exacto de título
    }

    // --- 3. FILTRO DE DURACIÓN (Tolerancia Ampliada) ---
    if (targetDuration > 0) {
        const diff = Math.abs(duration - targetDuration);
        if (diff <= 5) score += 40;
        else if (diff <= 15) score += 20;
        else if (diff <= 30) score += 5;
        // Penalizamos menos fuerte la duración, por si es una versión remaster
        else if (diff > 60) score -= 30;
    }

    // --- 4. PENALIZACIONES DE CALIDAD ---
    for (const word of PENALTY_WORDS) {
        // Penalizamos "live", "cover", etc.
        if (rawTitleNorm.includes(word)) score -= 35;
    }

    // Rechazo extra para covers explícitos en el artista
    if (itemArtist.includes('cover') || itemArtist.includes('tribute')) {
        score -= 100;
    }

    // --- 5. ⭐ NUEVO: PRIORIDAD ÁLBUM vs COMPILACIÓN ---
    // Penalizar compilaciones para evitar duplicados
    const compilationPatterns = [
        'greatest hits', 'best of', 'the essential', 'gold collection',
        'ultimate collection', 'the very best', 'anthology', 'the collection',
        'complete collection', 'hits collection', 'lo mejor de', 'grandes exitos',
        'definitive collection', 'super hits', 'top hits'
    ];

    for (const pattern of compilationPatterns) {
        if (albumName.includes(pattern)) {
            score -= 25;  // Penalización moderada para compilaciones
            break;
        }
    }

    // Bonus si parece ser del álbum original (título del álbum similar al track)
    if (albumName && trackWords.length > 0) {
        let albumMatchCount = 0;
        for (const w of trackWords) {
            if (albumName.includes(w)) albumMatchCount++;
        }
        // Si el nombre del álbum contiene varias palabras del track, probablemente es el single/álbum original
        if (albumMatchCount >= Math.ceil(trackWords.length / 2)) {
            score += 15;
        }
    }

    // --- 6. ⭐ NUEVO: BONUS POR FEATURING DETECTADO EN QUERY ---
    // Si el usuario buscó "Daft Punk Julian Casablancas" y Julian está en el feat., bonus
    if (targetArtist) {
        const searchArtists = splitArtists(targetArtist);
        const titleFeaturing = extractFeaturingFromTitle(rawTitle);

        for (const searchArtist of searchArtists) {
            for (const featArtist of titleFeaturing) {
                if (normalize(featArtist).includes(normalize(searchArtist)) ||
                    normalize(searchArtist).includes(normalize(featArtist))) {
                    score += 40;  // ¡El colaborador buscado está en el featuring!
                    break;
                }
            }
        }
    }

    return score;
}

/**
 * ⭐ NUEVO: Busca si el artista aparece en el título como featuring/colaborador
 * @param {string} targetArtist - Artista buscado
 * @param {string} title - Título de la canción
 * @returns {'exact'|'partial'|'none'}
 */
function checkArtistMatchInTitle(targetArtist, title) {
    if (!targetArtist || !title) return 'none';

    const nTarget = normalize(targetArtist);
    const featuring = extractFeaturingFromTitle(title);

    for (const feat of featuring) {
        const nFeat = normalize(feat);
        if (nFeat.includes(nTarget) || nTarget.includes(nFeat)) {
            return 'exact';
        }
    }

    // También buscar directamente en el título normalizado
    const nTitle = normalize(title);
    const targetTokens = nTarget.split(' ').filter(w => w.length > 2);
    let matches = 0;
    for (const token of targetTokens) {
        if (nTitle.includes(token)) matches++;
    }

    if (matches >= targetTokens.length && targetTokens.length > 0) return 'exact';
    if (matches > 0 && matches >= targetTokens.length / 2) return 'partial';

    return 'none';
}

async function searchApi(query, limit) {
    try {
        const url = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        console.log('[search] Fetching:', url);

        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);

        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);

        if (!res.ok) return [];

        const data = await res.json();

        // ⭐ DEBUG: Ver la estructura de la respuesta
        if (data.data && data.data.results && data.data.results.length > 0) {
            console.log('[search] Sample item structure:', JSON.stringify(data.data.results[0], null, 2));
        }

        return data?.data?.results || [];
    } catch (e) {
        console.log('[search] Error:', e.message);
        return [];
    }
}

async function handler(req, res) {
    // Recibir parámetros explícitos
    const q = req.query.q || req.query.query || '';
    const targetArtist = req.query.artist || '';
    const targetTrack = req.query.track || '';
    const targetDuration = parseInt(req.query.duration) || 0;
    const limit = parseInt(req.query.limit) || 10;

    if (!q) return res.status(400).json({ success: false, error: 'Missing q' });

    console.log(`[backend] Searching: "${q}"| Target: ${targetArtist} - ${targetTrack} (${targetDuration}s)`);

    // Usar la API externa (limitamos a 25 para ser rápidos pero tener variedad)
    const results = await searchApi(q, 25);

    const scored = [];
    const qWords = normalize(q).split(' ').filter(w => w.length > 1);

    for (const item of results) {
        const artistName = extractArtistName(item);
        item._artistName = artistName;

        if (shouldReject(item, artistName)) continue;

        // Pasar los datos exactos al score
        const score = calcScore(item, qWords, targetArtist, targetTrack, targetDuration);

        if (score > 0) {
            item._score = score;
            scored.push(item);
        }
    }

    // Ordenar y cortar
    scored.sort((a, b) => b._score - a._score);

    const final = scored.slice(0, limit).map(item => ({
        title: item.name || 'Sin titulo',
        author: { name: item._artistName || 'Unknown' },
        duration: item.duration || 0,
        videoId: item.id,
        thumbnail: item.image?.find(i => i.quality === '500x500')?.url || '',
        source: 'saavn',
        _score: item._score // Devolvemos el score para que el frontend vea la confianza
    }));

    return res.status(200).json({ success: true, results: final });
}

export default allowCors(handler);