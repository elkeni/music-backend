const SOURCE_API ='https://appmusic-phi.vercel.app';

const allowCors =(fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method ==='OPTIONS') {
        res.status(200).end();
        return;
    }
    return await fn(req, res);
};

const LEET_MAP ={ '0':'o', '1':'i', '2':'z', '3':'e', '4':'a', '5':'s', '6':'g', '7':'t', '8':'b', '9':'g'};

function normalize(text) {
    if (!text) return '';
    let r =text.toLowerCase();
    r =r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    r =r.split('').map(c => LEET_MAP[c] || c).join('');
    r =r.replace(/&/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, '').trim();
    return r;
}

/**
 * Artistas conocidos - Solo para dar BONUS, no para rechazar
 */
const KNOWN_ARTISTS ={
    'mana': ['mana'],
    'maná': ['mana'],
    'radiohead': ['radiohead'],
    'coldplay': ['coldplay'],
    'nirvana': ['nirvana'],
    'ca7riel': ['catriel', 'ca7riel'],
    'catriel': ['catriel', 'ca7riel'],
    'paco amoroso': ['paco', 'amoroso'],
    'soda stereo': ['soda', 'stereo'],
    'cerati': ['cerati'],
    'cafe tacuba': ['cafe', 'tacuba', 'tacvba'],
    'hector lavoe': ['lavoe'],
    'willie colon': ['willie', 'colon'],
    'grupo niche': ['niche'],
    'marc anthony': ['marc anthony'],
    'los panchos': ['panchos'],
    'skrillex': ['skrillex'],
    'bad bunny': ['bad bunny'],
    'daddy yankee': ['daddy yankee'],
    'bizarrap': ['bizarrap', 'bzrp'],
    'shakira': ['shakira'],
    'juanes': ['juanes'],
    'the beatles': ['beatles'],
    'queen': ['queen'],
    'led zeppelin': ['zeppelin'],
    'pink floyd': ['floyd'],
    'guns n roses': ['guns', 'roses'],
    'metallica': ['metallica'],
    'taylor swift': ['taylor swift'],
    'ed sheeran': ['sheeran'],
    'adele': ['adele'],
    'dua lipa': ['dua lipa'],
    'the weeknd': ['weeknd'],
    'billie eilish': ['billie', 'eilish'],
    'ariana grande': ['ariana'],
    'grupo 5': ['grupo 5', 'grupo5'],
    'agua marina': ['agua marina'],
    'duki': ['duki'],
    'wos': ['wos'],
    'feid': ['feid'],
    'karol g': ['karol'],
    'ozuna': ['ozuna'],
    'maluma': ['maluma'],
    'j balvin': ['balvin'],
    'rauw alejandro': ['rauw']
};

function detectArtist(query) {
    const qn =normalize(query);
    
    for (const [name, tokens] of Object.entries(KNOWN_ARTISTS)) {
        for (const t of tokens) {
            if (qn.includes(t) && t.length >=3) {
                return { name, tokens };
            }
        }
    }
    
    const w =qn.split('');
    return w.length > 0 ?{ name: w[0], tokens: [w[0]] } : null;
}

function detectIntent(query) {
    const q=query.toLowerCase();
    return {
        wantsRemix: q.includes('remix') || q.includes('rmx'),
        wantsLive: q.includes('live') || q.includes('en vivo'),
        wantsCover: q.includes('cover'),
        wantsAcoustic: q.includes('acoustic') || q.includes('acustico')
    };
}

// Artistas que son SIEMPRE covers/basura - RECHAZAR
const TRASH_ARTISTS =[
    'sweet little band', 'rockabye baby', 'lullaby', 'baby',
    'vitamin string quartet', 'piano tribute', 'tribute',
    'tropical panama', 'chichimarimba', 'karaoke',
    'kids', 'para ninos', 'infantil', 'midi',
    'twinkle twinkle', 'sleep', 'relaxing'
];

// Palabras en título que indican basura - RECHAZAR
const TRASH_WORDS =[
    'karaoke', 'chipmunk', 'nightcore', '8d audio',
    'ringtone', 'tono de llamada', 'music box',
    'lullaby', 'para bebes', 'tutorial'
];

// Palabras que penalizan (pero no rechazan)
const PENALTY_WORDS =[
    'cover', 'tribute', 'version', 'remix', 'live', 'en vivo',
    'acoustic', 'slowed', 'reverb', 'medley', 'mashup', 'megamix'
];

function shouldReject(item) {
    const artist =normalize(item.primaryArtists || '');
    const title =normalize(item.name || '');
    
    // Rechazar artistas basura
    for (const trash of TRASH_ARTISTS) {
        if (artist.includes(trash)) {
            return true;
        }
    }
    
    // Rechazar por palabras en título
    for (const word of TRASH_WORDS) {
        if (title.includes(word)) {
            return true;
        }
    }
    
    // Rechazar si dura más de 15 min
    if ((item.duration || 0) > 900) {
        return true;
    }
    
    return false;
}

function calcScore(item, qWords, detectedArtist, intent) {
    let score =50;
    
    const title =normalize(item.name || '');
    const artist =normalize(item.primaryArtists || '');
    
    // BONUS por palabras del query en título
    for (const w of qWords) {
        if (w.length >=2 && title.includes(w)) {
            score +=20;
        }
    }
    
    // BONUS por coincidencia de artista
    if (detectedArtist) {
        for (const token of detectedArtist.tokens) {
            if (artist.includes(token)) {
                score +=100; // Bonus grande por artista correcto
            }
        }
    }
    
    // PENALIZACIONES por palabras sospechosas
    for (const word of PENALTY_WORDS) {
        if (title.includes(word)) {
            const userWants =(
                (word ==='remix'&& intent.wantsRemix) ||
                (word ==='live'|| word ==='en vivo') && intent.wantsLive ||
                (word ==='cover'|| word ==='tribute') && intent.wantsCover ||
                (word ==='acoustic') && intent.wantsAcoustic
            );
            
            if (userWants) {
                score +=20;
            } else {
                score -=50;
            }
        }
    }
    
    // BONUS por duración normal (2-5 min)
    const dur =item.duration || 0;
    if (dur >=120 && dur <=330) {
        score +=25;
    }
    if (dur < 60) score -=30;
    if (dur > 480) score -=20;
    
    // Penalizar títulos muy largos
    if ((item.name || '').length > 60) score -=10;
    if ((item.name || '').length > 80) score -=20;
    
    return score;
}

async function searchApi(query, limit) {
    try {
        const url =`${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        console.log('[search] Fetching:', url);
        
        const ctrl =new AbortController();
        const tid =setTimeout(() => ctrl.abort(), 10000);
        
        const res =await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        
        if (!res.ok) return [];
        
        const data =await res.json();
        return data?.data?.results || [];
    } catch (e) {
        console.log('[search] Error:', e.message);
        return [];
    }
}

async function handler(req, res) {
    const q=req.query.q|| req.query.query || '';
    const limit =parseInt(req.query.limit) || 10;

    console.log('[youtube-search] START q="'+ q+ '"');

    if (! q) {
        return res.status(400).json({ success: false, error: 'Missing q'});
    }

    const qn =normalize(q);
    const qWords =qn.split('').filter(w => w.length > 1);
    const detectedArtist =detectArtist(q);
    const intent =detectIntent(q);
    
    console.log('[youtube-search] normalized="'+ qn + '" artist='+ (detectedArtist?.name || 'none'));

    // Buscar con el query original
    const results =await searchApi(q, 30);
    console.log('[youtube-search] Got', results.length, 'raw results');
    
    const scored =[];
    
    for (const item of results) {
        // Filtrar basura
        if (shouldReject(item)) {
            console.log('[REJECT]', item.name, 'by', item.primaryArtists);
            continue;
        }
        
        // Calcular score
        const score =calcScore(item, qWords, detectedArtist, intent);
        
        if (score > 0) {
            item._score =score;
            scored.push(item);
            console.log('[ACCEPT] score='+ score, item.name, 'by', item.primaryArtists);
        }
    }
    
    // Ordenar por score
    scored.sort((a, b) => b._score - a._score);
    
    // Formatear resultados
    const final =scored.slice(0, limit).map(item => {
        let thumb ='';
        if (Array.isArray(item.image) && item.image.length > 0) {
            const hq=item.image.find(i => i.quality ==='500x500');
            thumb =hq?hq.url : (item.image[item.image.length - 1].url || '');
        }
        
        return {
            title: item.name || 'Sin titulo',
            author: { name: item.primaryArtists || 'Unknown'},
            duration: item.duration || 0,
            videoId: item.id,
            thumbnail: thumb,
            source: 'saavn',
            _score: item._score
        };
    });

    console.log('[youtube-search] DONE, returning', final.length, 'results');

    return res.status(200).json({ success: true, results: final });
}

export default allowCors(handler);