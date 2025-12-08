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

const LEET_MAP = { '0':'o', '1':'i', '2':'z', '3':'e', '4':'a', '5':'s', '6':'g', '7':'t', '8':'b', '9':'g' };

/**
 * Normalización SUAVE - preserva más información
 * Usada para búsquedas
 */
function normalizeSoft(text) {
    if (! text) return '';
    let r = text.toLowerCase();
    r = r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    r = r.replace(/[''`]/g, '');  // Solo quitar apóstrofes
    r = r.replace(/\s+/g, ' ').trim();
    return r;
}

/**
 * Normalización FUERTE - para comparación de tokens
 * Usada para scoring
 */
function normalize(text) {
    if (! text) return '';
    let r = text.toLowerCase();
    r = r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    r = r.split('').map(c => LEET_MAP[c] || c).join('');
    r = r.replace(/&/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return r;
}

/**
 * Base de datos de artistas conocidos con variantes
 * Incluye el nombre "canónico" para matching estricto
 */
const KNOWN_ARTISTS = {
    // Latinos
    'mana': { canonical: 'maná', tokens: ['mana'], strict: true },
    'maná': { canonical: 'maná', tokens: ['mana'], strict: true },
    'ca7riel': { canonical: 'ca7riel', tokens: ['catriel', 'ca7riel', 'c7riel'], strict: true },
    'catriel': { canonical: 'ca7riel', tokens: ['catriel', 'ca7riel'], strict: true },
    'paco amoroso': { canonical: 'paco amoroso', tokens: ['paco', 'amoroso'], strict: true },
    'cafe tacuba': { canonical: 'café tacvba', tokens: ['cafe', 'tacuba', 'tacvba'], strict: true },
    'cafe tacvba': { canonical: 'café tacvba', tokens: ['cafe', 'tacuba', 'tacvba'], strict: true },
    'soda stereo': { canonical: 'soda stereo', tokens: ['soda', 'stereo'], strict: true },
    'gustavo cerati': { canonical: 'gustavo cerati', tokens: ['cerati', 'gustavo'], strict: true },
    
    // Salsa
    'hector lavoe': { canonical: 'héctor lavoe', tokens: ['hector', 'lavoe'], strict: true },
    'willie colon': { canonical: 'willie colón', tokens: ['willie', 'colon'], strict: true },
    'grupo niche': { canonical: 'grupo niche', tokens: ['grupo', 'niche'], strict: true },
    'oscar dleon': { canonical: 'oscar d\'león', tokens: ['oscar', 'dleon', 'leon'], strict: false },
    'frankie ruiz': { canonical: 'frankie ruiz', tokens: ['frankie', 'ruiz'], strict: true },
    'marc anthony': { canonical: 'marc anthony', tokens: ['marc', 'anthony'], strict: true },
    
    // Boleros
    'los panchos': { canonical: 'los panchos', tokens: ['panchos'], strict: true },
    
    // Electrónica
    'skrillex': { canonical: 'skrillex', tokens: ['skrillex'], strict: true },
    'fred again': { canonical: 'fred again..', tokens: ['fred', 'again'], strict: true },
    'deadmau5': { canonical: 'deadmau5', tokens: ['deadmau5', 'deadmaus'], strict: true },
    'diplo': { canonical: 'diplo', tokens: ['diplo'], strict: true },
    
    // Urbano
    'bad bunny': { canonical: 'bad bunny', tokens: ['bad', 'bunny'], strict: true },
    'daddy yankee': { canonical: 'daddy yankee', tokens: ['daddy', 'yankee'], strict: true },
    'bizarrap': { canonical: 'bizarrap', tokens: ['bizarrap', 'bzrp'], strict: true },
    'feid': { canonical: 'feid', tokens: ['feid'], strict: true },
    'karol g': { canonical: 'karol g', tokens: ['karol'], strict: true },
    'ozuna': { canonical: 'ozuna', tokens: ['ozuna'], strict: true },
    'rauw alejandro': { canonical: 'rauw alejandro', tokens: ['rauw', 'alejandro'], strict: true },
    
    // Cumbia peruana
    'grupo 5': { canonical: 'grupo 5', tokens: ['grupo5', 'grupo 5'], strict: true },
    'agua marina': { canonical: 'agua marina', tokens: ['agua', 'marina'], strict: true },
    'corazon serrano': { canonical: 'corazón serrano', tokens: ['corazon', 'serrano'], strict: true },
    'hermanos yaipen': { canonical: 'hermanos yaipén', tokens: ['yaipen', 'hermanos'], strict: true }
};

/**
 * Detecta el artista en el query
 * Retorna información del artista incluyendo si es "strict"
 */
function detectArtist(query) {
    const qn = normalize(query);
    
    for (const [key, data] of Object.entries(KNOWN_ARTISTS)) {
        for (const t of data.tokens) {
            if (qn.includes(t) && t.length >= 3) {
                return { 
                    name: key, 
                    canonical: data.canonical,
                    tokens: data.tokens, 
                    strict: data.strict 
                };
            }
        }
    }
    
    // Fallback: primera palabra como artista (no strict)
    const w = qn.split(' ');
    return w.length > 0 ?{ name: w[0], tokens: [w[0]], strict: false, canonical: null } : null;
}

/**
 * Detecta si el usuario busca explícitamente un remix u otra variante
 */
function detectSearchIntent(query) {
    const qLower = query.toLowerCase();
    return {
        wantsRemix: qLower.includes('remix') || qLower.includes('rmx'),
        wantsLive: qLower.includes('live') || qLower.includes('en vivo') || qLower.includes('concierto'),
        wantsCover: qLower.includes('cover'),
        wantsAcoustic: qLower.includes('acoustic') || qLower.includes('acustico') || qLower.includes('unplugged'),
        wantsInstrumental: qLower.includes('instrumental'),
        hasSpecialChars: /[''\(\)]/.test(query)  // Detecta apóstrofes y paréntesis
    };
}

// Palabras que SIEMPRE rechazan (nunca queremos esto)
const HARD_BLACKLIST = [
    'karaoke', 'chipmunk', 'nightcore', 'daycore',
    'ringtone', '8d audio', '8d ', 'tono de llamada',
    'music box', 'lullaby', 'para bebes', 'cuna',
    'tutorial', 'lesson', 'how to play'
];

// Palabras sospechosas (penalizan según contexto)
const SOFT_BLACKLIST = [
    'cover', 'tribute', 'version', 'rendition',
    'remix', 'rmx', 'edit', 'bootleg',
    'slowed', 'reverb', 'sped up', 'speed up',
    'live', 'en vivo', 'concierto', 'concert',
    'acoustic', 'acustico', 'unplugged',
    'medley', 'mashup', 'megamix', 'enganchado', 'mix'
];

// Artistas/canales que son casi siempre covers
const BAD_ARTISTS = [
    'chichimarimba', 'karaoke', 'tribute', 'cover band',
    'midi', 'kids songs', 'para niños', 'infantil',
    'rockabye baby', 'lullaby', 'vitamin string quartet'
];

/**
 * Verifica si un resultado debe ser RECHAZADO completamente
 */
function shouldReject(item, qn, intent) {
    const title = normalize(item.name || '');
    const artist = normalize(item.primaryArtists || '');
    
    // 1.Hard blacklist - siempre rechazar (excepto si el usuario lo busca)
    for (const b of HARD_BLACKLIST) {
        if (title.includes(b) || artist.includes(b)) {
            // Solo permitir si está explícitamente en la búsqueda
            if (! qn.includes(b.split(' ')[0])) {
                return true;
            }
        }
    }
    
    // 2.Artistas sospechosos - siempre rechazar
    for (const b of BAD_ARTISTS) {
        if (artist.includes(normalize(b))) {
            return true;
        }
    }
    
    // 3. Duración extrema (compilaciones)
    const duration = item.duration || 0;
    if (duration > 900) return true; // Más de 15 minutos
    
    // 4.Si es instrumental y el usuario NO lo buscó
    if (title.includes('instrumental') && !intent.wantsInstrumental) {
        return true;
    }
    
    return false;
}

/**
 * Calcula el score de relevancia
 * MEJORADO: Más estricto con artistas conocidos, respeta intención del usuario
 */
function calcScore(item, qWords, detectedArtist, qn, intent) {
    let score = 50; // Score base
    
    const title = normalize(item.name || '');
    const artist = normalize(item.primaryArtists || '');
    const originalTitle = item.name || '';
    
    // ========================================
    // BONUS POR COINCIDENCIAS
    // ========================================
    
    // Coincidencia de palabras del query en título
    for (const w of qWords) {
        if (w.length < 2) continue;
        if (title.includes(w)) score += 15;
    }
    
    // Coincidencia de palabras del query en artista
    for (const w of qWords) {
        if (w.length < 2) continue;
        if (artist.includes(w)) score += 20;
    }
    
    // ========================================
    // MATCHING DE ARTISTA (CRÍTICO)
    // ========================================
    
    if (detectedArtist && detectedArtist.tokens) {
        let artistMatchCount = 0;
        
        for (const token of detectedArtist.tokens) {
            if (artist.includes(token)) {
                artistMatchCount++;
                score += 40; // Bonus por cada token que coincide
            }
        }
        
        // Si es un artista "strict" y NO coincide, penalizar FUERTEMENTE
        if (detectedArtist.strict && artistMatchCount === 0) {
            // El artista del resultado no coincide con el buscado
            score -= 40; // Penalización severa
            console.log(`[calcScore] Strict artist mismatch: buscado="${detectedArtist.name}", encontrado="${artist}"`);
        }
        
        // Bonus extra si coincide perfectamente
        if (artistMatchCount >= 2) {
            score += 50;
        }
    }
    
    // ========================================
    // PENALIZACIONES POR SOFT_BLACKLIST
    // ========================================
    
    for (const bad of SOFT_BLACKLIST) {
        if (title.includes(bad)) {
            // Verificar si el usuario QUIERE este tipo de contenido
            const userWantsThis = (
                (bad === 'remix' || bad === 'rmx' || bad === 'edit' || bad === 'bootleg') && intent.wantsRemix ||
                (bad === 'live' || bad === 'en vivo' || bad === 'concierto' || bad === 'concert') && intent.wantsLive ||
                (bad === 'cover' || bad === 'tribute' || bad === 'version' || bad === 'rendition') && intent.wantsCover ||
                (bad === 'acoustic' || bad === 'acustico' || bad === 'unplugged') && intent.wantsAcoustic
            );
            
            if (userWantsThis) {
                // El usuario busca esto - dar BONUS en lugar de penalizar
                score += 30;
            } else {
                // El usuario NO busca esto - PENALIZAR FUERTE
                if (bad === 'cover' || bad === 'tribute' || bad === 'rendition') {
                    score -= 80; // Covers penalizados fuertemente
                } else if (bad === 'live' || bad === 'en vivo') {
                    score -= 60; // Live penalizado moderadamente
                } else if (bad === 'remix' || bad === 'rmx') {
                    score -= 50; // Remix penalizado
                } else if (bad === 'medley' || bad === 'mashup' || bad === 'megamix' || bad === 'enganchado') {
                    score -= 70; // Medleys penalizados fuerte
                } else {
                    score -= 35; // Otras penalizaciones
                }
            }
        }
    }
    
    // ========================================
    // PENALIZACIONES POR FORMATO
    // ========================================
    
    // Títulos muy largos (posibles compilaciones)
    if (originalTitle.length > 60) score -= 15;
    if (originalTitle.length > 80) score -= 20;
    if (originalTitle.length > 100) score -= 30;
    
    // Múltiples "/" indican medley
    const slashCount = originalTitle.split('/').length - 1;
    if (slashCount >= 2) score -= 60;
    if (slashCount === 1) score -= 20;
    
    // ========================================
    // PENALIZACIONES POR DURACIÓN
    // ========================================
    
    const duration = item.duration || 0;
    if (duration > 0) {
        if (duration < 45) score -= 50;    // Muy corta (preview/ringtone)
        if (duration < 60) score -= 30;    // Corta
        if (duration > 480) score -= 25;   // Más de 8 min
        if (duration > 600) score -= 40;   // Más de 10 min
    }
    
    // Bonus por duración típica de canción (2-5 min)
    if (duration >= 120 && duration <= 300) score += 25;
    
    // ========================================
    // BONUS POR IDIOMA (para artistas latinos)
    // ========================================
    
    const language = (item.language || '').toLowerCase();
    if (language === 'spanish' && detectedArtist) {
        const latinArtists = ['mana', 'catriel', 'ca7riel', 'paco', 'lavoe', 'colon', 'niche', 'panchos', 'tacuba', 'cerati', 'soda'];
        const isLatinSearch = latinArtists.some(la => qn.includes(la));
        if (isLatinSearch) {
            score += 20;
        }
    }
    
    return score;
}

/**
 * Busca en la API fuente
 */
async function searchApi(query, limit) {
    try {
        const url = SOURCE_API + '/api/search/songs?query=' + encodeURIComponent(query) + '&limit=' + limit;
        console.log('[search]Fetching:', url);
        
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);
        
        const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
        clearTimeout(tid);
        
        if (!res.ok) {
            console.log('[search] HTTP error:', res.status);
            return [];
        }
        
        const data = await res.json();
        
        if (data.data && data.data.results) {
            return data.data.results;
        }
        return [];
    } catch (e) {
        console.log('[search] Error:', e.message);
        return [];
    }
}

/**
 * Handler principal
 */
async function handler(req, res) {
    const q = req.query.q || req.query.query || '';
    const limit = parseInt(req.query.limit) || 10;

    console.log('[youtube-search] START q="' + q + '"');

    if (! q) {
        return res.status(400).json({ success: false, error: 'Missing q' });
    }

    // Análisis del query
    const qn = normalize(q);
    const qWords = qn.split(' ').filter(w => w.length > 1);
    const detectedArtist = detectArtist(q);
    const intent = detectSearchIntent(q);
    
    console.log('[youtube-search] normalized="' + qn + '"');
    console.log('[youtube-search] artist=' + (detectedArtist ?detectedArtist.name : 'none') + ' strict=' + (detectedArtist?.strict || false));
    console.log('[youtube-search] intent:', JSON.stringify(intent));

    // Generar variaciones de búsqueda
    const variations = [
        q,                                                    // Original
        qn,                                                   // Normalizado fuerte
        normalizeSoft(q),                                     // Normalizado suave
        q.normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // Solo sin tildes
    ];
    
    // Si busca remix con caracteres especiales, agregar variación limpia
    if (intent.wantsRemix && intent.hasSpecialChars) {
        variations.push(q.replace(/['']/g, '').replace(/\s+/g, ' ').trim());
    }
    
    const unique = [...new Set(variations)].filter(v => v.length > 0);
    
    const all = [];
    const seen = new Set();

    for (const v of unique) {
        console.log('[youtube-search] Trying variation:', v);
        const results = await searchApi(v, 25);
        console.log('[youtube-search] Got', results.length, 'results');
        
        for (const item of results) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            
            // Verificar rechazo
            if (shouldReject(item, qn, intent)) {
                console.log('[youtube-search] REJECT:', item.name);
                continue;
            }
            
            // Calcular score
            item._score = calcScore(item, qWords, detectedArtist, qn, intent);
            
            // Solo incluir si tiene score positivo
            if (item._score > 0) {
                all.push(item);
            } else {
                console.log('[youtube-search] LOW SCORE (' + item._score + '):', item.name, 'by', item.primaryArtists);
            }
        }
        
        // Si tenemos suficientes buenos resultados, parar
        if (all.filter(x => x._score >= 100).length >= limit) {
            console.log('[youtube-search] Got enough good results, stopping');
            break;
        }
    }

    // Ordenar por score
    all.sort((a, b) => b._score - a._score);

    // Formatear resultados finales
    const final = all.slice(0, limit).map(item => {
        let thumb = '';
        if (Array.isArray(item.image) && item.image.length > 0) {
            const hq = item.image.find(i => i.quality === '500x500');
            thumb = hq?hq.url : (item.image[item.image.length-1].url || '');
        }
        
        return {
            title: item.name || 'Sin titulo',
            author: {
                name: item.primaryArtists || 
                      item.artists?.primary?.map(a => a.name).join(', ') || 
                      'Unknown'
            },
            duration: item.duration || 0,
            videoId: item.id,
            thumbnail: thumb,
            source: 'saavn',
            _score: item._score
        };
    });

    console.log('[youtube-search] DONE, returning', final.length, 'results');
    if (final.length > 0) {
        console.log('[youtube-search] Top result:', final[0].title, 'by', final[0].author.name, 'score:', final[0]._score);
    }

    return res.status(200).json({ success: true, results: final });
}

export default allowCors(handler);