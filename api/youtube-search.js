// api/youtube-search.js - VERSIÓN MEJORADA PARA LATAM

const SOURCE_APIS = [
    'https://appmusic-phi.vercel.app',
    'https://saavn.dev'
];

const allowCors = (fn) => async (req, res) => {
    res. setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    return await fn(req, res);
};

// ============================================================
// SISTEMA DE NORMALIZACIÓN AVANZADO
// ============================================================

/**
 * Mapa de sustitución de números a letras (Leetspeak)
 */
const LEET_MAP = {
    '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a',
    '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g'
};

/**
 * Normaliza texto para comparación
 * Maneja: tildes, números en nombres, símbolos especiales
 */
function normalize(text, options = {}) {
    if (!text) return '';
    
    let result = text.toLowerCase();
    
    // Paso 1: Normalizar caracteres especiales comunes
    result = result
        .replace(/æ/g, 'ae')
        .replace(/ø/g, 'o')
        .replace(/ß/g, 'ss')
        .replace(/&/g, ' and ')
        .replace(/\+/g, ' plus ')
        .replace(/@/g, ' at ');
    
    // Paso 2: Remover tildes (NFD normalization)
    result = result. normalize('NFD'). replace(/[\u0300-\u036f]/g, '');
    
    // Paso 3: Convertir leetspeak a letras (Ca7riel -> Catriel)
    if (options.convertLeet !== false) {
        result = result.split('').map(char => LEET_MAP[char] || char).join('');
    }
    
    // Paso 4: Limpiar símbolos pero preservar espacios
    result = result
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    return result;
}

/**
 * Genera múltiples variaciones de un query para búsqueda
 */
function generateSearchVariations(query) {
    const variations = new Set();
    
    // Original
    variations.add(query);
    
    // Sin tildes
    const noAccents = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    variations. add(noAccents);
    
    // Normalizado completo
    variations.add(normalize(query));
    
    // Con leetspeak convertido
    const leetConverted = query.split('').map(c => LEET_MAP[c] || c).join('');
    variations.add(leetConverted);
    
    // Sin leetspeak convertido (mantener números)
    variations.add(normalize(query, { convertLeet: false }));
    
    // Variación: quitar "ft.", "feat.", "featuring"
    const noFeat = query.replace(/\s*(ft\. ? |feat\.?|featuring)\s*/gi, ' ');
    variations.add(noFeat);
    variations.add(normalize(noFeat));
    
    // Variación: quitar contenido entre paréntesis
    const noParens = query.replace(/\([^)]*\)/g, ''). trim();
    if (noParens. length > 3) {
        variations.add(noParens);
        variations. add(normalize(noParens));
    }
    
    return [... variations]. filter(v => v && v.length > 0);
}

// ============================================================
// BASE DE DATOS DE ARTISTAS CONOCIDOS (LATAM + INTERNACIONAL)
// ============================================================

const KNOWN_ARTISTS = {
    // 🇦🇷 Trap / Urbano Argentino
    'ca7riel': ['ca7riel', 'catriel', 'c7riel'],
    'catriel': ['ca7riel', 'catriel'],
    'paco amoroso': ['paco', 'amoroso'],
    'bizarrap': ['bizarrap', 'bzrp'],
    'duki': ['duki'],
    'paulo londra': ['paulo', 'londra'],
    'wos': ['wos'],
    'nicki nicole': ['nicki', 'nicole'],
    'trueno': ['trueno'],
    'lit killah': ['lit', 'killah'],
    'tiago pzk': ['tiago', 'pzk'],
    
    // 🇲🇽 Rock Latino
    'mana': ['mana', 'maná'],
    'maná': ['mana', 'maná'],
    'cafe tacvba': ['cafe', 'tacuba', 'tacvba'],
    'café tacuba': ['cafe', 'tacuba', 'tacvba'],
    'cafe tacuba': ['cafe', 'tacuba', 'tacvba'],
    'caifanes': ['caifanes'],
    'maldita vecindad': ['maldita', 'vecindad'],
    'molotov': ['molotov'],
    'zoé': ['zoe'],
    'soda stereo': ['soda', 'stereo'],
    'los fabulosos cadillacs': ['fabulosos', 'cadillacs'],
    'gustavo cerati': ['cerati', 'gustavo'],
    
    // 🎺 Salsa
    'hector lavoe': ['hector', 'lavoe', 'héctor'],
    'héctor lavoe': ['hector', 'lavoe'],
    'willie colon': ['willie', 'colon', 'colón'],
    'willie colón': ['willie', 'colon'],
    'frankie ruiz': ['frankie', 'ruiz'],
    'oscar dleon': ['oscar', 'dleon', 'leon', 'd\'leon'],
    'oscar d\'leon': ['oscar', 'dleon', 'leon'],
    'lalo rodriguez': ['lalo', 'rodriguez', 'rodríguez'],
    'grupo niche': ['grupo', 'niche'],
    'marc anthony': ['marc', 'anthony'],
    'ruben blades': ['ruben', 'blades', 'rubén'],
    
    // 🎸 Boleros
    'los panchos': ['panchos', 'los panchos'],
    'javier solis': ['javier', 'solis', 'solís'],
    'pedro infante': ['pedro', 'infante'],
    'jose jose': ['jose', 'josé'],
    
    // 🎛️ Electrónica / EDM
    'skrillex': ['skrillex'],
    'deadmau5': ['deadmau5', 'deadmaus'],
    'marshmello': ['marshmello'],
    'diplo': ['diplo'],
    'tiesto': ['tiesto', 'tiësto'],
    'david guetta': ['david', 'guetta'],
    'calvin harris': ['calvin', 'harris'],
    'fred again': ['fred', 'again'],
    
    // 🇵🇷 Reggaeton / Urbano
    'bad bunny': ['bad', 'bunny'],
    'daddy yankee': ['daddy', 'yankee'],
    'don omar': ['don', 'omar'],
    'wisin': ['wisin'],
    'yandel': ['yandel'],
    'ozuna': ['ozuna'],
    'anuel aa': ['anuel'],
    'j balvin': ['balvin'],
    'karol g': ['karol'],
    'rauw alejandro': ['rauw', 'alejandro'],
    'feid': ['feid'],
    'myke towers': ['myke', 'towers'],
    'jhay cortez': ['jhay', 'cortez'],
    
    // 🇵🇪 Perú
    'gian marco': ['gian', 'marco'],
    'eva ayllon': ['eva', 'ayllon', 'ayllón'],
    'dina paucar': ['dina', 'paucar'],
    'agua marina': ['agua', 'marina'],
    'los hermanos yaipen': ['yaipen', 'yaipén'],
    'corazon serrano': ['corazon', 'serrano'],
    'grupo5': ['grupo5', 'grupo 5'],
    
    // 🌍 Internacional
    'the beatles': ['beatles'],
    'pink floyd': ['pink', 'floyd'],
    'lady gaga': ['lady', 'gaga'],
    'the chainsmokers': ['chainsmokers'],
    'eminem': ['eminem', 'slim shady'],
    'kid cudi': ['kid', 'cudi'],
    'fall out boy': ['fall', 'out', 'boy'],
    'panic at the disco': ['panic', 'disco'],
    'mf doom': ['mf', 'doom'],
    'crash test dummies': ['crash', 'test', 'dummies'],
    'aqua': ['aqua'],
    'grimes': ['grimes']
};

/**
 * Detecta el artista esperado del query
 */
function detectArtist(query) {
    const queryNorm = normalize(query);
    const queryWords = queryNorm.split(' ');
    
    // Buscar coincidencia en artistas conocidos
    for (const [artistName, tokens] of Object.entries(KNOWN_ARTISTS)) {
        const artistNorm = normalize(artistName);
        
        // Coincidencia directa
        if (queryNorm.includes(artistNorm)) {
            return { name: artistName, tokens, confidence: 'high' };
        }
        
        // Coincidencia por tokens
        const matchCount = tokens.filter(t => 
            queryNorm.includes(t) || queryWords.includes(t)
        ).length;
        
        if (matchCount >= 2 || (matchCount === 1 && tokens.length === 1)) {
            return { name: artistName, tokens, confidence: 'medium' };
        }
    }
    
    // Fallback: primera palabra del query
    if (queryWords.length > 0) {
        return { 
            name: queryWords[0], 
            tokens: [queryWords[0]], 
            confidence: 'low' 
        };
    }
    
    return null;
}

// ============================================================
// SISTEMA DE BLACKLIST Y SCORING
// ============================================================

/**
 * Palabras que SIEMPRE indican contenido no original (rechazo inmediato)
 */
const HARD_BLACKLIST = [
    'karaoke', 'instrumental', 'chipmunk', 'nightcore', 'daycore',
    'ringtone', '8d audio', '8d ', 'tono de llamada', 'tono para',
    'music box', 'lullaby', 'cuna', 'para bebes', 'for babies',
    'midi version', 'synthesia', 'piano tutorial'
];

/**
 * Palabras sospechosas (penalizan pero no rechazan)
 */
const SOFT_BLACKLIST = [
    'cover', 'tribute', 'remix', 'slowed', 'reverb', 'sped up',
    'mix', 'medley', 'mashup', 'enganchado', 'megamix', 'minimix',
    'version', 'live', 'en vivo', 'acoustic', 'unplugged', 'acustico',
    'remaster', 'remastered', 'demo', 'alternate', 'radio edit'
];

/**
 * Artistas/canales sospechosos (casi siempre covers)
 */
const SUSPICIOUS_ARTISTS = [
    'chichimarimba', 'karaoke', 'tribute band', 'cover band',
    'midi', 'music box', 'lullaby', 'kids songs', 'para niños',
    'piano guys', 'vitamin string', 'rockabye baby'
];

/**
 * Verifica si un resultado debe ser rechazado completamente
 */
function shouldReject(item, queryNorm) {
    const title = normalize(item.name || item.title || '');
    const artist = normalize(
        item.primaryArtists || 
        item.artists?. primary?. map(a => a.name). join(' ') || 
        ''
    );
    
    // Rechazar si tiene palabras de hard blacklist
    for (const bad of HARD_BLACKLIST) {
        const badNorm = normalize(bad);
        if (title.includes(badNorm) || artist.includes(badNorm)) {
            // Solo rechazar si NO está en el query original
            if (!queryNorm. includes(badNorm)) {
                return `Hard blacklist: ${bad}`;
            }
        }
    }
    
    // Rechazar si el artista es sospechoso
    for (const sus of SUSPICIOUS_ARTISTS) {
        if (artist.includes(normalize(sus))) {
            return `Suspicious artist: ${sus}`;
        }
    }
    
    // Rechazar duraciones extremas (compilaciones)
    const duration = item.duration || 0;
    if (duration > 900) { // Más de 15 minutos
        return `Duration too long: ${duration}s`;
    }
    
    return null;
}

/**
 * Calcula score de relevancia (más alto = mejor)
 */
function calculateScore(item, queryWords, expectedArtist, queryNorm) {
    let score = 50; // Score base
    
    const title = normalize(item.name || item.title || '');
    const artist = normalize(
        item.primaryArtists || 
        item.artists?.primary?.map(a => a.name).join(' ') || 
        ''
    );
    const titleWords = title.split(' ');
    const artistWords = artist.split(' ');
    
    // ===== BONUS POR COINCIDENCIAS =====
    
    // Coincidencia de palabras del query en el título
    for (const word of queryWords) {
        if (word. length < 2) continue;
        if (title.includes(word)) score += 15;
        if (titleWords.includes(word)) score += 10;
    }
    
    // Coincidencia de artista esperado (MUY IMPORTANTE)
    if (expectedArtist && expectedArtist.tokens) {
        for (const token of expectedArtist.tokens) {
            if (token.length < 2) continue;
            if (artist.includes(token)) score += 50;
            if (artistWords.includes(token)) score += 40;
        }
        
        // Bonus por confianza alta
        if (expectedArtist.confidence === 'high') {
            const matchCount = expectedArtist.tokens.filter(t => artist.includes(t)).length;
            if (matchCount >= 1) score += 60;
            if (matchCount >= 2) score += 40;
        }
    }
    
    // ===== PENALIZACIONES =====
    
    // Penalizar palabras de soft blacklist
    for (const bad of SOFT_BLACKLIST) {
        const badNorm = normalize(bad);
        if (title.includes(badNorm) && !queryNorm.includes(badNorm)) {
            score -= 35;
        }
    }
    
    // Penalizar títulos muy largos
    const originalTitle = item.name || item.title || '';
    if (originalTitle.length > 60) score -= 15;
    if (originalTitle.length > 80) score -= 20;
    if (originalTitle.length > 100) score -= 25;
    
    // Penalizar medleys (múltiples "/")
    const slashCount = originalTitle.split('/'). length - 1;
    if (slashCount >= 2) score -= 60;
    if (slashCount === 1) score -= 20;
    
    // Penalizar duraciones extremas
    const duration = item.duration || 0;
    if (duration > 0) {
        if (duration < 45) score -= 40;      // Muy corta (probablemente preview)
        if (duration < 60) score -= 20;      // Corta
        if (duration > 420) score -= 20;     // Más de 7 min
        if (duration > 600) score -= 40;     // Más de 10 min
    }
    
    // Bonus por duración normal (2-5 min)
    if (duration >= 120 && duration <= 300) score += 25;
    
    // Bonus si el idioma coincide (español para artistas latinos)
    const language = item.language || '';
    if (language. toLowerCase() === 'spanish') {
        // Verificar si es artista latino
        const latinArtists = ['mana', 'maná', 'ca7riel', 'catriel', 'bad bunny', 'lavoe', 'panchos'];
        if (latinArtists.some(la => queryNorm.includes(la))) {
            score += 30;
        }
    }
    
    return score;
}

// ============================================================
// FUNCIONES DE BÚSQUEDA
// ============================================================

async function searchApi(apiBase, query, limit) {
    try {
        const url = `${apiBase}/api/search/songs? query=${encodeURIComponent(query)}&limit=${limit}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) return [];
        
        const data = await response.json();
        return data.data?. results || [];
    } catch (e) {
        console.warn(`[youtube-search] API error: ${e.message}`);
        return [];
    }
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handler(req, res) {
    const { q, query, limit = 10 } = req.query || {};
    const searchQuery = q || query;

    console.log(`[youtube-search] 🔍 Query: "${searchQuery}"`);

    if (!searchQuery) {
        return res.status(400).json({
            success: false,
            error: 'Missing query parameter (q)'
        });
    }

    // Normalizar query y detectar artista
    const queryNorm = normalize(searchQuery);
    const queryWords = queryNorm.split(' '). filter(w => w.length > 1);
    const expectedArtist = detectArtist(searchQuery);
    
    console.log(`[youtube-search] 📝 Normalized: "${queryNorm}"`);
    console.log(`[youtube-search] 🎤 Artist detected: ${expectedArtist?.name || 'none'} (${expectedArtist?.confidence || 'n/a'})`);

    // Generar variaciones de búsqueda
    const searchVariations = generateSearchVariations(searchQuery);
    console.log(`[youtube-search] 🔄 Variations: ${searchVariations. length}`);

    const allResults = [];
    const seenIds = new Set();
    const stats = { total: 0, rejected: 0, lowScore: 0 };

    // Buscar en todas las APIs con todas las variaciones
    for (const apiBase of SOURCE_APIS) {
        for (const searchVar of searchVariations) {
            const results = await searchApi(apiBase, searchVar, 20);
            stats.total += results.length;
            
            for (const item of results) {
                if (seenIds.has(item.id)) continue;
                seenIds.add(item.id);
                
                // Verificar rechazo
                const rejectReason = shouldReject(item, queryNorm);
                if (rejectReason) {
                    console.log(`[youtube-search] ❌ Rejected: "${item.name}" - ${rejectReason}`);
                    stats.rejected++;
                    continue;
                }
                
                // Calcular score
                const score = calculateScore(item, queryWords, expectedArtist, queryNorm);
                item._score = score;
                
                if (score > 0) {
                    allResults.push(item);
                } else {
                    stats.lowScore++;
                }
            }
        }
        
        // Si tenemos buenos resultados, parar
        const goodResults = allResults.filter(r => r._score >= 80);
        if (goodResults. length >= limit) {
            console.log(`[youtube-search] ✅ Found ${goodResults.length} good results, stopping`);
            break;
        }
    }

    console.log(`[youtube-search] 📊 Stats: ${stats.total} total, ${stats.rejected} rejected, ${stats.lowScore} low score, ${allResults.length} valid`);

    // Ordenar por score
    allResults.sort((a, b) => b._score - a._score);

    // Formatear resultados
    const results = allResults.slice(0, Number(limit)). map((item) => {
        let thumb = '';
        if (Array.isArray(item.image)) {
            const hq = item.image. find(i => i.quality === '500x500');
            thumb = hq?. url || item.image[item.image.length - 1]?.url || '';
        }

        const artistName = item.primaryArtists || 
            item.artists?.primary?. map(a => a.name). join(', ') || 
            'Unknown';

        return {
            title: item.name || item.title || 'Sin título',
            author: { name: artistName },
            duration: item.duration || 0,
            videoId: item.id,
            thumbnail: thumb,
            source: 'saavn',
            _score: item._score
        };
    });

    if (results.length > 0) {
        console.log(`[youtube-search] 🏆 Top: "${results[0].title}" by ${results[0].author.name} (score: ${results[0]._score})`);
    } else {
        console.log(`[youtube-search] ⚠️ No valid results for: "${searchQuery}"`);
    }

    return res.status(200).json({ success: true, results });
}

export default allowCors(handler);