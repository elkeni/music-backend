// api/youtube-search.js

const SOURCE_APIS = [
    'https://appmusic-phi.vercel.app',
    'https://saavn.dev'
];

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

/**
 * Normaliza texto para comparación
 */
function normalize(text) {
    if (! text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/7/g, 't')
        .replace(/4/g, 'a')
        .replace(/3/g, 'e')
        .replace(/1/g, 'i')
        .replace(/0/g, 'o')
        .replace(/&/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Palabras que SIEMPRE indican contenido no original
 */
const HARD_BLACKLIST = [
    'karaoke', 'instrumental', 'chipmunk', 'nightcore', 
    'ringtone', '8d audio', '8d ', 'tono de llamada'
];

/**
 * Palabras sospechosas (penalizan pero no rechazan)
 */
const SOFT_BLACKLIST = [
    'cover', 'tribute', 'remix', 'slowed', 'reverb',
    'mix', 'medley', 'mashup', 'enganchado', 'megamix',
    'version', 'live', 'en vivo', 'acoustic', 'unplugged'
];

/**
 * Artistas/canales sospechosos (covers conocidos)
 */
const SUSPICIOUS_ARTISTS = [
    'chichimarimba', 'karaoke', 'tribute', 'cover band',
    'midi', 'music box', 'lullaby', 'kids'
];

/**
 * Verifica si un resultado debe ser rechazado completamente
 */
function shouldReject(item) {
    const title = normalize(item.name || item.title || '');
    const artist = normalize(
        item.primaryArtists || 
        item.artists?.primary?.map(a => a.name).join(' ') || 
        ''
    );
    
    // Rechazar si tiene palabras de la blacklist dura
    for (const bad of HARD_BLACKLIST) {
        if (title.includes(bad) || artist.includes(bad)) {
            return `Hard blacklist: ${bad}`;
        }
    }
    
    // Rechazar si el artista es sospechoso
    for (const sus of SUSPICIOUS_ARTISTS) {
        if (artist.includes(sus)) {
            return `Suspicious artist: ${sus}`;
        }
    }
    
    return null;
}

/**
 * Calcula score de relevancia (más alto = mejor)
 */
function calculateScore(item, queryWords, expectedArtistWords) {
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
        if (word.length < 2) continue;
        if (title.includes(word)) score += 15;
        if (titleWords.includes(word)) score += 10; // Palabra exacta
    }
    
    // Coincidencia de artista esperado
    for (const word of expectedArtistWords) {
        if (word.length < 2) continue;
        if (artist.includes(word)) score += 40;
        if (artistWords.includes(word)) score += 30; // Palabra exacta
    }
    
    // Bonus grande si el artista coincide muy bien
    const artistMatchCount = expectedArtistWords.filter(w => 
        w.length > 2 && artist.includes(w)
    ).length;
    
    if (artistMatchCount >= 1) score += 50;
    if (artistMatchCount >= 2) score += 30;
    
    // ===== PENALIZACIONES =====
    
    // Penalizar palabras de soft blacklist
    for (const bad of SOFT_BLACKLIST) {
        if (title.includes(bad)) {
            // Solo penalizar si NO está en el query original
            const queryStr = queryWords.join(' ');
            if (!queryStr.includes(bad)) {
                score -= 40;
            }
        }
    }
    
    // Penalizar títulos muy largos (compilaciones)
    if (title.length > 60) score -= 20;
    if (title.length > 80) score -= 20;
    
    // Penalizar si tiene muchos "/" (medleys)
    const slashCount = (item.name || '').split('/').length - 1;
    if (slashCount >= 2) score -= 50;
    if (slashCount >= 1) score -= 20;
    
    // Penalizar duraciones extremas
    const duration = item.duration || 0;
    if (duration > 0) {
        if (duration < 60) score -= 30;  // Muy corta
        if (duration > 480) score -= 30; // Más de 8 min
        if (duration > 600) score -= 50; // Más de 10 min (probablemente mix)
    }
    
    // Bonus por tener duración normal (2-5 min)
    if (duration >= 120 && duration <= 300) score += 20;
    
    return score;
}

/**
 * Extrae palabras clave del query para matching
 */
function extractQueryParts(query) {
    const norm = normalize(query);
    const words = norm.split(' ').filter(w => w.length > 1);
    
    // Intentar detectar artista (primera palabra o palabras antes de la canción)
    // Esto es heurístico
    const artistWords = [];
    const allWords = [...words];
    
    // Artistas conocidos para mejor detección
    const knownArtists = {
        'mana': ['mana'],
        'maná': ['mana'],
        'ca7riel': ['catriel', 'ca7riel'],
        'catriel': ['catriel'],
        'paco amoroso': ['paco', 'amoroso'],
        'bad bunny': ['bad', 'bunny'],
        'shakira': ['shakira'],
        'daddy yankee': ['daddy', 'yankee'],
    };
    
    // Buscar artistas conocidos en el query
    for (const [artistName, artistTokens] of Object.entries(knownArtists)) {
        const artistNorm = normalize(artistName);
        if (norm.includes(artistNorm) || artistTokens.some(t => norm.includes(t))) {
            artistWords.push(...artistTokens);
        }
    }
    
    // Si no encontramos artista conocido, asumir primera palabra
    if (artistWords.length === 0 && words.length > 0) {
        artistWords.push(words[0]);
    }
    
    return {
        queryWords: allWords,
        artistWords: [...new Set(artistWords)]
    };
}

async function searchApi(apiBase, query, limit) {
    try {
        const url = `${apiBase}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) return [];
        
        const data = await response.json();
        return data.data?.results || [];
    } catch (e) {
        console.warn(`[youtube-search] API error: ${e.message}`);
        return [];
    }
}

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

    const { queryWords, artistWords } = extractQueryParts(searchQuery);
    console.log(`[youtube-search] 📝 Query words: [${queryWords.join(', ')}]`);
    console.log(`[youtube-search] 🎤 Artist words: [${artistWords.join(', ')}]`);

    // Variaciones de búsqueda
    const searchVariations = [
        searchQuery,
        normalize(searchQuery),
        searchQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    ];
    
    // Eliminar duplicados
    const uniqueVariations = [...new Set(searchVariations)];

    const allResults = [];
    const seenIds = new Set();
    const rejectedCount = { hard: 0, score: 0 };

    for (const apiBase of SOURCE_APIS) {
        for (const searchVar of uniqueVariations) {
            console.log(`[youtube-search] 🌐 Buscando en ${apiBase}: "${searchVar}"`);
            
            const results = await searchApi(apiBase, searchVar, 25);
            console.log(`[youtube-search] 📦 Recibidos: ${results.length} resultados`);
            
            for (const item of results) {
                if (seenIds.has(item.id)) continue;
                seenIds.add(item.id);
                
                // Verificar rechazo duro
                const rejectReason = shouldReject(item);
                if (rejectReason) {
                    console.log(`[youtube-search] ❌ Rechazado: "${item.name}" - ${rejectReason}`);
                    rejectedCount.hard++;
                    continue;
                }
                
                // Calcular score
                const score = calculateScore(item, queryWords, artistWords);
                item._score = score;
                
                // Solo aceptar si tiene score positivo
                if (score > 0) {
                    allResults.push(item);
                } else {
                    console.log(`[youtube-search] ⚠️ Score bajo (${score}): "${item.name}"`);
                    rejectedCount.score++;
                }
            }
        }
        
        // Si tenemos suficientes buenos resultados, parar
        const goodResults = allResults.filter(r => r._score >= 50);
        if (goodResults.length >= limit) {
            console.log(`[youtube-search] ✅ Suficientes buenos resultados, deteniendo búsqueda`);
            break;
        }
    }

    console.log(`[youtube-search] 📊 Total válidos: ${allResults.length}, Rechazados: ${rejectedCount.hard} hard, ${rejectedCount.score} score`);

    // Ordenar por score
    allResults.sort((a, b) => b._score - a._score);

    // Formatear resultados
    const results = allResults.slice(0, Number(limit)).map((item) => {
        let thumb = '';
        if (Array.isArray(item.image)) {
            const hq = item.image.find(i => i.quality === '500x500');
            thumb = hq?.url || item.image[item.image.length - 1]?.url || '';
        }

        const artistName = item.primaryArtists || 
            item.artists?.primary?.map(a => a.name).join(', ') || 
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
        console.log(`[youtube-search] ⚠️ Sin resultados válidos para: "${searchQuery}"`);
    }

    return res.status(200).json({ success: true, results });
}

export default allowCors(handler);