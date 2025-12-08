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

function normalizeSoft(text) {
    if (! text) return '';
    let r = text.toLowerCase();
    r = r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    r = r.replace(/[''`]/g, '');
    r = r.replace(/\s+/g, ' ').trim();
    return r;
}

function normalize(text) {
    if (! text) return '';
    let r = text.toLowerCase();
    r = r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    r = r.split('').map(c => LEET_MAP[c] || c).join('');
    r = r.replace(/&/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return r;
}

/**
 * Base de datos de artistas conocidos
 * MEJORADO: Agregados más tokens y variantes
 */
const KNOWN_ARTISTS = {
    // Rock Latino
    'mana': { canonical: 'Maná', tokens: ['mana'], strict: true, mustMatch: true },
    'maná': { canonical: 'Maná', tokens: ['mana'], strict: true, mustMatch: true },
    'soda stereo': { canonical: 'Soda Stereo', tokens: ['soda stereo', 'soda'], strict: true, mustMatch: false },
    'gustavo cerati': { canonical: 'Gustavo Cerati', tokens: ['cerati'], strict: true, mustMatch: true },
    'cafe tacuba': { canonical: 'Café Tacvba', tokens: ['cafe tacuba', 'cafe tacvba', 'tacuba', 'tacvba'], strict: true, mustMatch: false },
    'caifanes': { canonical: 'Caifanes', tokens: ['caifanes'], strict: true, mustMatch: true },
    'los fabulosos cadillacs': { canonical: 'Los Fabulosos Cadillacs', tokens: ['fabulosos cadillacs', 'cadillacs'], strict: true, mustMatch: false },
    
    // Trap/Urbano Argentina
    'ca7riel': { canonical: 'Ca7riel', tokens: ['ca7riel', 'catriel', 'catrie'], strict: true, mustMatch: true },
    'catriel': { canonical: 'Ca7riel', tokens: ['ca7riel', 'catriel'], strict: true, mustMatch: true },
    'paco amoroso': { canonical: 'Paco Amoroso', tokens: ['paco amoroso', 'amoroso'], strict: true, mustMatch: false },
    'duki': { canonical: 'Duki', tokens: ['duki'], strict: true, mustMatch: true },
    'paulo londra': { canonical: 'Paulo Londra', tokens: ['paulo londra', 'londra'], strict: true, mustMatch: false },
    'wos': { canonical: 'Wos', tokens: ['wos'], strict: true, mustMatch: true },
    'bizarrap': { canonical: 'Bizarrap', tokens: ['bizarrap', 'bzrp'], strict: true, mustMatch: true },
    
    // Rock Internacional
    'radiohead': { canonical: 'Radiohead', tokens: ['radiohead'], strict: true, mustMatch: true },
    'coldplay': { canonical: 'Coldplay', tokens: ['coldplay'], strict: true, mustMatch: true },
    'nirvana': { canonical: 'Nirvana', tokens: ['nirvana'], strict: true, mustMatch: true },
    'the beatles': { canonical: 'The Beatles', tokens: ['beatles'], strict: true, mustMatch: true },
    'queen': { canonical: 'Queen', tokens: ['queen'], strict: true, mustMatch: true },
    'pink floyd': { canonical: 'Pink Floyd', tokens: ['pink floyd', 'floyd'], strict: true, mustMatch: false },
    'led zeppelin': { canonical: 'Led Zeppelin', tokens: ['led zeppelin', 'zeppelin'], strict: true, mustMatch: false },
    'the rolling stones': { canonical: 'The Rolling Stones', tokens: ['rolling stones', 'stones'], strict: true, mustMatch: false },
    'u2': { canonical: 'U2', tokens: ['u2'], strict: true, mustMatch: true },
    'ac dc': { canonical: 'AC/DC', tokens: ['ac dc', 'acdc'], strict: true, mustMatch: true },
    'guns n roses': { canonical: "Guns N' Roses", tokens: ['guns n roses', 'guns roses', 'gnr'], strict: true, mustMatch: false },
    'metallica': { canonical: 'Metallica', tokens: ['metallica'], strict: true, mustMatch: true },
    'red hot chili peppers': { canonical: 'Red Hot Chili Peppers', tokens: ['red hot chili', 'chili peppers', 'rhcp'], strict: true, mustMatch: false },
    'foo fighters': { canonical: 'Foo Fighters', tokens: ['foo fighters'], strict: true, mustMatch: true },
    'arctic monkeys': { canonical: 'Arctic Monkeys', tokens: ['arctic monkeys'], strict: true, mustMatch: true },
    'the strokes': { canonical: 'The Strokes', tokens: ['strokes'], strict: true, mustMatch: true },
    'muse': { canonical: 'Muse', tokens: ['muse'], strict: true, mustMatch: true },
    'oasis': { canonical: 'Oasis', tokens: ['oasis'], strict: true, mustMatch: true },
    'linkin park': { canonical: 'Linkin Park', tokens: ['linkin park'], strict: true, mustMatch: true },
    'green day': { canonical: 'Green Day', tokens: ['green day'], strict: true, mustMatch: true },
    
    // Pop Internacional
    'taylor swift': { canonical: 'Taylor Swift', tokens: ['taylor swift', 'swift'], strict: true, mustMatch: false },
    'ed sheeran': { canonical: 'Ed Sheeran', tokens: ['ed sheeran', 'sheeran'], strict: true, mustMatch: false },
    'adele': { canonical: 'Adele', tokens: ['adele'], strict: true, mustMatch: true },
    'bruno mars': { canonical: 'Bruno Mars', tokens: ['bruno mars'], strict: true, mustMatch: true },
    'dua lipa': { canonical: 'Dua Lipa', tokens: ['dua lipa'], strict: true, mustMatch: true },
    'the weeknd': { canonical: 'The Weeknd', tokens: ['weeknd'], strict: true, mustMatch: true },
    'billie eilish': { canonical: 'Billie Eilish', tokens: ['billie eilish', 'eilish'], strict: true, mustMatch: false },
    'harry styles': { canonical: 'Harry Styles', tokens: ['harry styles'], strict: true, mustMatch: true },
    'ariana grande': { canonical: 'Ariana Grande', tokens: ['ariana grande', 'ariana'], strict: true, mustMatch: false },
    'lady gaga': { canonical: 'Lady Gaga', tokens: ['lady gaga', 'gaga'], strict: true, mustMatch: false },
    'rihanna': { canonical: 'Rihanna', tokens: ['rihanna'], strict: true, mustMatch: true },
    'beyonce': { canonical: 'Beyoncé', tokens: ['beyonce'], strict: true, mustMatch: true },
    'shakira': { canonical: 'Shakira', tokens: ['shakira'], strict: true, mustMatch: true },
    'michael jackson': { canonical: 'Michael Jackson', tokens: ['michael jackson', 'jackson'], strict: true, mustMatch: false },
    
    // Salsa
    'hector lavoe': { canonical: 'Héctor Lavoe', tokens: ['hector lavoe', 'lavoe'], strict: true, mustMatch: false },
    'willie colon': { canonical: 'Willie Colón', tokens: ['willie colon', 'colon'], strict: true, mustMatch: false },
    'ruben blades': { canonical: 'Rubén Blades', tokens: ['ruben blades', 'blades'], strict: true, mustMatch: false },
    'celia cruz': { canonical: 'Celia Cruz', tokens: ['celia cruz', 'celia'], strict: true, mustMatch: false },
    'marc anthony': { canonical: 'Marc Anthony', tokens: ['marc anthony'], strict: true, mustMatch: true },
    'grupo niche': { canonical: 'Grupo Niche', tokens: ['grupo niche', 'niche'], strict: true, mustMatch: false },
    'oscar dleon': { canonical: "Oscar D'León", tokens: ['oscar dleon', 'dleon'], strict: false, mustMatch: false },
    'frankie ruiz': { canonical: 'Frankie Ruiz', tokens: ['frankie ruiz', 'ruiz'], strict: true, mustMatch: false },
    
    // Boleros
    'los panchos': { canonical: 'Los Panchos', tokens: ['los panchos', 'panchos'], strict: true, mustMatch: false },
    'luis miguel': { canonical: 'Luis Miguel', tokens: ['luis miguel'], strict: true, mustMatch: true },
    'jose jose': { canonical: 'José José', tokens: ['jose jose'], strict: true, mustMatch: true },
    'juan gabriel': { canonical: 'Juan Gabriel', tokens: ['juan gabriel', 'juanga'], strict: true, mustMatch: false },
    
    // Electrónica
    'skrillex': { canonical: 'Skrillex', tokens: ['skrillex'], strict: true, mustMatch: true },
    'fred again': { canonical: 'Fred again..', tokens: ['fred again'], strict: true, mustMatch: true },
    'deadmau5': { canonical: 'deadmau5', tokens: ['deadmau5', 'deadmaus'], strict: true, mustMatch: true },
    'diplo': { canonical: 'Diplo', tokens: ['diplo'], strict: true, mustMatch: true },
    'david guetta': { canonical: 'David Guetta', tokens: ['david guetta', 'guetta'], strict: true, mustMatch: false },
    'calvin harris': { canonical: 'Calvin Harris', tokens: ['calvin harris'], strict: true, mustMatch: true },
    'daft punk': { canonical: 'Daft Punk', tokens: ['daft punk'], strict: true, mustMatch: true },
    'marshmello': { canonical: 'Marshmello', tokens: ['marshmello'], strict: true, mustMatch: true },
    'avicii': { canonical: 'Avicii', tokens: ['avicii'], strict: true, mustMatch: true },
    'tiesto': { canonical: 'Tiësto', tokens: ['tiesto'], strict: true, mustMatch: true },
    
    // Urbano Latino
    'bad bunny': { canonical: 'Bad Bunny', tokens: ['bad bunny'], strict: true, mustMatch: true },
    'daddy yankee': { canonical: 'Daddy Yankee', tokens: ['daddy yankee', 'yankee'], strict: true, mustMatch: false },
    'j balvin': { canonical: 'J Balvin', tokens: ['j balvin', 'balvin'], strict: true, mustMatch: false },
    'ozuna': { canonical: 'Ozuna', tokens: ['ozuna'], strict: true, mustMatch: true },
    'anuel aa': { canonical: 'Anuel AA', tokens: ['anuel aa', 'anuel'], strict: true, mustMatch: false },
    'karol g': { canonical: 'Karol G', tokens: ['karol g', 'karol'], strict: true, mustMatch: false },
    'rauw alejandro': { canonical: 'Rauw Alejandro', tokens: ['rauw alejandro', 'rauw'], strict: true, mustMatch: false },
    'feid': { canonical: 'Feid', tokens: ['feid'], strict: true, mustMatch: true },
    'maluma': { canonical: 'Maluma', tokens: ['maluma'], strict: true, mustMatch: true },
    'nicky jam': { canonical: 'Nicky Jam', tokens: ['nicky jam'], strict: true, mustMatch: true },
    'farruko': { canonical: 'Farruko', tokens: ['farruko'], strict: true, mustMatch: true },
    'sech': { canonical: 'Sech', tokens: ['sech'], strict: true, mustMatch: true },
    'myke towers': { canonical: 'Myke Towers', tokens: ['myke towers', 'towers'], strict: true, mustMatch: false },
    
    // Cumbia
    'grupo 5': { canonical: 'Grupo 5', tokens: ['grupo 5', 'grupo5'], strict: true, mustMatch: true },
    'agua marina': { canonical: 'Agua Marina', tokens: ['agua marina'], strict: true, mustMatch: true },
    'corazon serrano': { canonical: 'Corazón Serrano', tokens: ['corazon serrano', 'serrano'], strict: true, mustMatch: false },
    'hermanos yaipen': { canonical: 'Hermanos Yaipén', tokens: ['hermanos yaipen', 'yaipen'], strict: true, mustMatch: false },
    'los angeles azules': { canonical: 'Los Ángeles Azules', tokens: ['angeles azules'], strict: true, mustMatch: true }
};

function detectArtist(query) {
    const qn = normalize(query);
    
    for (const [key, data] of Object.entries(KNOWN_ARTISTS)) {
        for (const t of data.tokens) {
            if (qn.includes(normalize(t)) && t.length >= 3) {
                return { 
                    name: key, 
                    canonical: data.canonical,
                    tokens: data.tokens, 
                    strict: data.strict,
                    mustMatch: data.mustMatch || false
                };
            }
        }
    }
    
    const w = qn.split(' ');
    return w.length > 0 ?{ name: w[0], tokens: [w[0]], strict: false, canonical: null, mustMatch: false } : null;
}

function detectSearchIntent(query) {
    const qLower = query.toLowerCase();
    return {
        wantsRemix: qLower.includes('remix') || qLower.includes('rmx'),
        wantsLive: qLower.includes('live') || qLower.includes('en vivo') || qLower.includes('concierto'),
        wantsCover: qLower.includes('cover'),
        wantsAcoustic: qLower.includes('acoustic') || qLower.includes('acustico') || qLower.includes('unplugged'),
        wantsInstrumental: qLower.includes('instrumental'),
        hasSpecialChars: /[''\(\)]/.test(query)
    };
}

// HARD BLACKLIST - Siempre rechazar
const HARD_BLACKLIST = [
    'karaoke', 'chipmunk', 'nightcore', 'daycore',
    'ringtone', '8d audio', '8d ', 'tono de llamada',
    'music box', 'lullaby', 'para bebes', 'cuna',
    'tutorial', 'lesson', 'how to play', 'piano tutorial'
];

// SOFT BLACKLIST - Penalizan según contexto
const SOFT_BLACKLIST = [
    'cover', 'tribute', 'version', 'rendition',
    'remix', 'rmx', 'edit', 'bootleg',
    'slowed', 'reverb', 'sped up', 'speed up',
    'live', 'en vivo', 'concierto', 'concert',
    'acoustic', 'acustico', 'unplugged',
    'medley', 'mashup', 'megamix', 'enganchado', 'mix'
];

// Artistas/canales que SON covers (aunque no lo digan)
const COVER_ARTISTS = [
    'sweet little band', 'rockabye baby', 'vitamin string quartet',
    'lullaby baby trio', 'twinkle twinkle little rock star',
    'baby rockstar', 'baby lullaby', 'the piano tribute',
    'piano tribute players', 'midnite string quartet',
    'tropical panama', 'cover', 'tribute', 'karaoke',
    'instrumental', 'midi', 'kids', 'para niños', 'infantil',
    'chichimarimba', 'baby sleep', 'sleep baby sleep',
    'peaceful piano', 'relaxing piano'
];

/**
 * MEJORADO: Verificación más estricta
 */
function shouldReject(item, qn, intent, detectedArtist) {
    const title = normalize(item.name || '');
    const artist = normalize(item.primaryArtists || '');
    const album = normalize(item.album?.name || '');
    
    // 1.COVER ARTISTS - Rechazar siempre estos artistas
    for (const coverArtist of COVER_ARTISTS) {
        if (artist.includes(normalize(coverArtist))) {
            console.log(`[shouldReject] Cover artist detected: "${item.primaryArtists}"`);
            return true;
        }
    }
    
    // 2.Hard blacklist
    for (const b of HARD_BLACKLIST) {
        if (title.includes(b) || artist.includes(b)) {
            if (! qn.includes(b.split(' ')[0])) {
                return true;
            }
        }
    }
    
    // 3.Duración extrema
    const duration = item.duration || 0;
    if (duration > 900) return true;
    
    // 4.Instrumental no solicitado
    if (title.includes('instrumental') && ! intent.wantsInstrumental) {
        return true;
    }
    
    // 5.⭐ NUEVO: Si buscamos un artista conocido con mustMatch, 
    //    rechazar si el artista NO coincide en absoluto
    if (detectedArtist && detectedArtist.mustMatch) {
        let hasAnyMatch = false;
        for (const token of detectedArtist.tokens) {
            if (artist.includes(normalize(token))) {
                hasAnyMatch = true;
                break;
            }
        }
        
        if (!hasAnyMatch) {
            console.log(`[shouldReject] Artist mismatch (mustMatch): buscado="${detectedArtist.canonical}", encontrado="${item.primaryArtists}"`);
            return true;
        }
    }
    
    return false;
}

/**
 * MEJORADO: Sistema de puntuación más inteligente
 */
function calcScore(item, qWords, detectedArtist, qn, intent) {
    let score = 50;
    
    const title = normalize(item.name || '');
    const artist = normalize(item.primaryArtists || '');
    const originalTitle = item.name || '';
    
    // ========================================
    // BONUS POR COINCIDENCIAS DE TÍTULO
    // ========================================
    for (const w of qWords) {
        if (w.length < 2) continue;
        if (title.includes(w)) score += 15;
    }
    
    // ========================================
    // BONUS POR COINCIDENCIA DE ARTISTA
    // ========================================
    if (detectedArtist && detectedArtist.tokens) {
        let artistMatchCount = 0;
        let exactMatch = false;
        
        for (const token of detectedArtist.tokens) {
            const normToken = normalize(token);
            if (artist.includes(normToken)) {
                artistMatchCount++;
                score += 80; // Bonus alto por coincidencia de artista
                
                // Verificar match exacto (el artista ES el token, no solo lo contiene)
                const artistWords = artist.split(' ');
                if (artistWords.includes(normToken) || artist === normToken) {
                    exactMatch = true;
                }
            }
        }
        
        // Bonus extra por match exacto del artista
        if (exactMatch) {
            score += 60;
        }
        
        // Si es strict y NO hay match, penalizar fuerte
        if (detectedArtist.strict && artistMatchCount === 0) {
            score -= 150; // Penalización muy fuerte
        }
    }
    
    // ========================================
    // PENALIZACIONES POR SOFT_BLACKLIST
    // ========================================
    for (const bad of SOFT_BLACKLIST) {
        if (title.includes(bad)) {
            const userWantsThis = (
                (bad === 'remix' || bad === 'rmx' || bad === 'edit' || bad === 'bootleg') && intent.wantsRemix ||
                (bad === 'live' || bad === 'en vivo' || bad === 'concierto' || bad === 'concert') && intent.wantsLive ||
                (bad === 'cover' || bad === 'tribute' || bad === 'version' || bad === 'rendition') && intent.wantsCover ||
                (bad === 'acoustic' || bad === 'acustico' || bad === 'unplugged') && intent.wantsAcoustic
            );
            
            if (userWantsThis) {
                score += 30;
            } else {
                if (bad === 'cover' || bad === 'tribute' || bad === 'rendition') {
                    score -= 100;
                } else if (bad === 'live' || bad === 'en vivo') {
                    score -= 60;
                } else if (bad === 'remix' || bad === 'rmx') {
                    score -= 50;
                } else if (bad === 'medley' || bad === 'mashup' || bad === 'megamix' || bad === 'enganchado') {
                    score -= 80;
                } else {
                    score -= 40;
                }
            }
        }
    }
    
    // ========================================
    // PENALIZACIONES POR FORMATO
    // ========================================
    if (originalTitle.length > 60) score -= 15;
    if (originalTitle.length > 80) score -= 25;
    if (originalTitle.length > 100) score -= 35;
    
    const slashCount = originalTitle.split('/').length - 1;
    if (slashCount >= 2) score -= 70;
    if (slashCount === 1) score -= 25;
    
    // ========================================
    // PENALIZACIONES POR DURACIÓN
    // ========================================
    const duration = item.duration || 0;
    if (duration > 0) {
        if (duration < 45) score -= 60;
        if (duration < 60) score -= 40;
        if (duration > 480) score -= 30;
        if (duration > 600) score -= 50;
    }
    
    // Bonus por duración típica
    if (duration >= 120 && duration <= 330) score += 30;
    
    // ========================================
    // BONUS POR IDIOMA
    // ========================================
    const language = (item.language || '').toLowerCase();
    if (language === 'spanish' && detectedArtist) {
        const latinArtists = ['mana', 'catriel', 'ca7riel', 'paco', 'lavoe', 'colon', 'niche', 'panchos', 'tacuba', 'cerati', 'soda', 'shakira', 'juanes'];
        const isLatinSearch = latinArtists.some(la => qn.includes(la));
        if (isLatinSearch) {
            score += 25;
        }
    }
    
    return score;
}

async function searchApi(query, limit) {
    try {
        const url = SOURCE_API + '/api/search/songs?query=' + encodeURIComponent(query) + '&limit=' + limit;
        console.log('[search] Fetching:', url);
        
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

async function handler(req, res) {
    const q = req.query.q || req.query.query || '';
    const limit = parseInt(req.query.limit) || 10;

    console.log('[youtube-search] START q="' + q + '"');

    if (! q) {
        return res.status(400).json({ success: false, error: 'Missing q' });
    }

    const qn = normalize(q);
    const qWords = qn.split(' ').filter(w => w.length > 1);
    const detectedArtist = detectArtist(q);
    const intent = detectSearchIntent(q);
    
    console.log('[youtube-search] normalized="' + qn + '"');
    console.log('[youtube-search] artist=' + (detectedArtist ?detectedArtist.canonical || detectedArtist.name : 'none') + ' strict=' + (detectedArtist?.strict || false) + ' mustMatch=' + (detectedArtist?.mustMatch || false));
    console.log('[youtube-search] intent:', JSON.stringify(intent));

    // Variaciones de búsqueda
    const variations = [
        q,
        qn,
        normalizeSoft(q),
        q.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    ];
    
    // Si detectamos un artista conocido, agregar búsqueda con nombre canónico
    if (detectedArtist && detectedArtist.canonical) {
        const titlePart = qWords.filter(w => ! detectedArtist.tokens.some(t => normalize(t).includes(w))).join(' ');
        if (titlePart) {
            variations.unshift(`${detectedArtist.canonical} ${titlePart}`);
        }
    }
    
    if (intent.wantsRemix && intent.hasSpecialChars) {
        variations.push(q.replace(/['']/g, '').replace(/\s+/g, ' ').trim());
    }
    
    const unique = [...new Set(variations)].filter(v => v.length > 0);
    
    const all = [];
    const seen = new Set();

    for (const v of unique) {
        console.log('[youtube-search] Trying variation:', v);
        const results = await searchApi(v, 30); // Aumentamos el límite para tener más opciones
        console.log('[youtube-search] Got', results.length, 'results');
        
        for (const item of results) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            
            // Verificar rechazo (pasamos detectedArtist para mustMatch)
            if (shouldReject(item, qn, intent, detectedArtist)) {
                console.log('[youtube-search] REJECT:', item.name, 'by', item.primaryArtists);
                continue;
            }
            
            item._score = calcScore(item, qWords, detectedArtist, qn, intent);
            
            if (item._score > 0) {
                all.push(item);
                console.log('[youtube-search] ACCEPT (score=' + item._score + '):', item.name, 'by', item.primaryArtists);
            } else {
                console.log('[youtube-search] LOW SCORE (' + item._score + '):', item.name, 'by', item.primaryArtists);
            }
        }
        
        // Si tenemos buenos resultados con el artista correcto, parar
        const goodResults = all.filter(x => x._score >= 150);
        if (goodResults.length >= limit) {
            console.log('[youtube-search] Got enough good results, stopping');
            break;
        }
    }

    all.sort((a, b) => b._score - a._score);

    const final = all.slice(0, limit).map(item => {
        let thumb = '';
        if (Array.isArray(item.image) && item.image.length > 0) {
            const hq = item.image.find(i => i.quality === '500x500');
            thumb = hq ?hq.url : (item.image[item.image.length - 1].url || '');
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