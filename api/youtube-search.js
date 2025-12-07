// api/youtube-search.js

const SOURCE_APIS = [
    'https://appmusic-phi.vercel. app',
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
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
        .replace(/7/g, 't')              // Ca7riel -> Catriel
        .replace(/4/g, 'a')
        .replace(/3/g, 'e')
        .replace(/1/g, 'i')
        .replace(/0/g, 'o')
        .replace(/&/g, ' and ')
        .replace(/[^\w\s]/g, ' ')        // Quitar símbolos
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extrae el nombre del artista del query
 * "mana rayando el sol" -> intenta detectar "mana"
 */
function extractArtistFromQuery(query) {
    // Lista de artistas conocidos para matching directo
    const knownArtists = [
        'mana', 'maná', 
        'ca7riel', 'catriel',
        'paco amoroso',
        'bad bunny',
        'shakira',
        'peso pluma',
        'feid',
        'karol g',
        'daddy yankee',
        'j balvin',
        'ozuna',
        'anuel',
        'rauw alejandro',
        'soda stereo',
        'los fabulosos cadillacs',
        'cafe tacvba', 'café tacuba', 'cafe tacuba'
    ];
    
    const normalizedQuery = normalize(query);
    
    for (const artist of knownArtists) {
        if (normalizedQuery.includes(normalize(artist))) {
            return normalize(artist);
        }
    }
    
    // Si no está en la lista, asumir que la primera palabra es el artista
    const words = normalizedQuery.split(' ');
    if (words.length >= 2) {
        return words[0];
    }
    
    return null;
}

/**
 * Palabras prohibidas en títulos (indican que NO es el original)
 */
const BLACKLISTED_WORDS = [
    'karaoke', 'cover', 'tribute', 'instrumental',
    'remix', 'slowed', 'reverb', '8d audio', '8d',
    'chipmunk', 'nightcore', 'daycore',
    'chichimix', 'megamix', 'enganchado', 'enganchados',
    'mix de', 'medley', 'mashup',
    'version cumbia', 'cumbia remix',
    'ringtone', 'tono', 'tonos'
];

/**
 * Verifica si un resultado es válido
 */
function isValidResult(item, expectedArtist) {
    const title = normalize(item.name || item.title || '');
    const artist = normalize(
        item.primaryArtists || 
        item.artists?. primary?. map(a => a.name). join(' ') || 
        ''
    );
    
    // 1. Verificar blacklist en título
    for (const bad of BLACKLISTED_WORDS) {
        if (title. includes(bad)) {
            console.log(`[Filter] ❌ Rechazado por blacklist "${bad}": ${item.name}`);
            return false;
        }
    }
    
    // 2.  Verificar blacklist en nombre del artista
    const artistLower = artist.toLowerCase();
    const suspiciousArtists = ['chichimarimba', 'karaoke', 'tribute', 'cover band'];
    for (const sus of suspiciousArtists) {
        if (artistLower.includes(sus)) {
            console.log(`[Filter] ❌ Rechazado por artista sospechoso "${sus}": ${item.name}`);
            return false;
        }
    }
    
    // 3. Si tenemos un artista esperado, verificar que coincida
    if (expectedArtist && expectedArtist.length > 2) {
        const artistWords = artist.split(' ');
        const expectedWords = expectedArtist.split(' ');
        
        let artistMatch = false;
        for (const expWord of expectedWords) {
            if (expWord.length < 3) continue;
            if (artist.includes(expWord)) {
                artistMatch = true;
                break;
            }
        }
        
        if (!artistMatch) {
            // Verificar también en el título (a veces el artista está ahí)
            for (const expWord of expectedWords) {
                if (expWord.length < 3) continue;
                if (title.includes(expWord)) {
                    artistMatch = true;
                    break;
                }
            }
        }
        
        if (!artistMatch) {
            console.log(`[Filter] ❌ Artista no coincide.  Esperado: "${expectedArtist}", Encontrado: "${artist}"`);
            return false;
        }
    }
    
    // 4. Verificar duración razonable (entre 1 y 10 minutos)
    const duration = item.duration || 0;
    if (duration > 0 && (duration < 60 || duration > 600)) {
        console.log(`[Filter] ⚠️ Duración sospechosa (${duration}s): ${item.name}`);
        // No rechazar, solo advertir
    }
    
    return true;
}

/**
 * Calcula score de relevancia
 */
function calculateScore(item, query, expectedArtist) {
    let score = 0;
    const title = normalize(item.name || item.title || '');
    const artist = normalize(
        item.primaryArtists || 
        item.artists?.primary?.map(a => a.name).join(' ') || 
        ''
    );
    const queryNorm = normalize(query);
    const queryWords = queryNorm.split(' '). filter(w => w.length > 2);
    
    // Coincidencia de palabras en título
    for (const word of queryWords) {
        if (title.includes(word)) score += 20;
    }
    
    // Coincidencia de artista (muy importante)
    if (expectedArtist) {
        const expectedWords = expectedArtist.split(' '). filter(w => w.length > 2);
        for (const word of expectedWords) {
            if (artist.includes(word)) score += 50;
        }
    }
    
    // Bonus por match exacto de artista
    if (expectedArtist && artist.includes(expectedArtist)) {
        score += 100;
    }
    
    // Penalizar títulos muy largos (probablemente compilaciones)
    if (title. length > 50) score -= 20;
    if (title.includes('/')) score -= 30; // "Song1 / Song2 / Song3"
    
    return score;
}

/**
 * Genera variaciones del query para búsqueda
 */
function generateQueryVariations(query) {
    const variations = new Set();
    const norm = normalize(query);
    
    variations.add(query);
    variations.add(norm);
    
    // Sin tildes
    const noTildes = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    variations. add(noTildes);
    
    // Con "official" para encontrar originales
    variations.add(`${query} official`);
    
    return [... variations];
}

/**
 * Busca en una API
 */
async function searchApi(apiBase, query, limit) {
    try {
        const url = `${apiBase}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) return [];
        
        const data = await response.json();
        return data.data?. results || [];
    } catch (e) {
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

    const expectedArtist = extractArtistFromQuery(searchQuery);
    console.log(`[youtube-search] 🎤 Artista esperado: "${expectedArtist || 'no detectado'}"`);

    const queryVariations = generateQueryVariations(searchQuery);
    const allResults = [];
    const seenIds = new Set();

    // Buscar en todas las APIs con todas las variaciones
    for (const apiBase of SOURCE_APIS) {
        for (const queryVar of queryVariations) {
            const results = await searchApi(apiBase, queryVar, 20);
            
            for (const item of results) {
                if (seenIds.has(item.id)) continue;
                seenIds.add(item.id);
                
                // Validar resultado
                if (!isValidResult(item, expectedArtist)) {
                    continue;
                }
                
                // Calcular score
                item._score = calculateScore(item, searchQuery, expectedArtist);
                allResults.push(item);
            }
        }
        
        // Si tenemos buenos resultados, no seguir
        if (allResults.filter(r => r._score > 50).length >= limit) {
            break;
        }
    }

    // Ordenar por score
    allResults.sort((a, b) => b._score - a._score);

    // Formatear resultados
    const results = allResults.slice(0, Number(limit)). map((item) => {
        let thumb = '';
        if (Array.isArray(item.image)) {
            const hq = item.image. find(i => i.quality === '500x500');
            thumb = hq?. url || item.image[item.image.length - 1]?.url || '';
        }

        let artistName = item.primaryArtists || 
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

    console.log(`[youtube-search] ✅ Retornando ${results.length} resultados válidos`);
    if (results.length > 0) {
        console.log(`[youtube-search] 🏆 Top: "${results[0].title}" by ${results[0].author.name} (score: ${results[0]._score})`);
    }

    return res.status(200).json({ success: true, results });
}

export default allowCors(handler);