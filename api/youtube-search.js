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

const LEET_MAP ={ '0':'o', '1':'i', '2':'z', '3':'e', '4':'a', '5':'s', '6':'g', '7':'t', '8':'b', '9':'g' };

function normalize(text) {
    if (!text) return '';
    let r =text.toLowerCase();
    r =r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    r =r.split('').map(c => LEET_MAP[c] || c).join('');
    r =r.replace(/&/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return r;
}

/**
 * ⭐ MEJORADO: Extrae el nombre del artista de múltiples campos posibles
 */
function extractArtistName(item) {
    // Intentar diferentes campos donde puede venir el artista
    if (item.primaryArtists && item.primaryArtists.trim()) {
        return item.primaryArtists.trim();
    }
    
    if (item.artist && typeof item.artist ==='string' && item.artist.trim()) {
        return item.artist.trim();
    }
    
    if (item.artists) {
        // Si es un objeto con primary
        if (item.artists.primary && Array.isArray(item.artists.primary)) {
            const names =item.artists.primary.map(a => a.name || a).filter(Boolean);
            if (names.length > 0) return names.join(', ');
        }
        // Si es un array directo
        if (Array.isArray(item.artists)) {
            const names =item.artists.map(a => a.name || a).filter(Boolean);
            if (names.length > 0) return names.join(', ');
        }
        // Si es string
        if (typeof item.artists ==='string' && item.artists.trim()) {
            return item.artists.trim();
        }
    }
    
    if (item.more_info) {
        if (item.more_info.artistMap && item.more_info.artistMap.primary_artists) {
            const artists =item.more_info.artistMap.primary_artists;
            if (Array.isArray(artists)) {
                const names =artists.map(a => a.name || a).filter(Boolean);
                if (names.length > 0) return names.join(', ');
            }
        }
        if (item.more_info.primary_artists && item.more_info.primary_artists.trim()) {
            return item.more_info.primary_artists.trim();
        }
    }
    
    if (item.subtitle && item.subtitle.trim()) {
        return item.subtitle.trim();
    }
    
    if (item.music && item.music.trim()) {
        return item.music.trim();
    }
    
    return '';
}

// Artistas conocidos para dar bonus
const KNOWN_ARTISTS ={
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
    const qn =normalize(query);
    for (const [name, tokens] of Object.entries(KNOWN_ARTISTS)) {
        for (const t of tokens) {
            if (qn.includes(t)) return { name, tokens };
        }
    }
    const w =qn.split(' ');
    return w.length > 0 ?{ name: w[0], tokens: [w[0]] } : null;
}

// Artistas/contenido basura - RECHAZAR
const TRASH_ARTISTS =[
    'sweet little band', 'rockabye baby', 'lullaby', 'twinkle',
    'vitamin string quartet', 'piano tribute', 'tribute',
    'tropical panama', 'chichimarimba', 'karaoke',
    'para ninos', 'infantil', 'midi', 'cover band',
    'sleep', 'relaxing', 'baby', 'meditation'
];

const TRASH_WORDS =[
    'karaoke', 'chipmunk', 'nightcore', '8d audio',
    'ringtone', 'tono de llamada', 'music box',
    'lullaby', 'para bebes', 'tutorial', 'lesson'
];

const PENALTY_WORDS =['cover', 'tribute', 'version', 'remix', 'live', 'en vivo', 'acoustic', 'slowed', 'reverb', 'medley', 'mashup', 'megamix'];

function shouldReject(item, artistName) {
    const title =normalize(item.name || '');
    const artist =normalize(artistName);
    
    for (const trash of TRASH_ARTISTS) {
        if (artist.includes(trash)) return true;
    }
    for (const word of TRASH_WORDS) {
        if (title.includes(word)) return true;
    }
    if ((item.duration || 0) > 900) return true;
    
    return false;
}

function calcScore(item, qWords, detectedArtist, artistName) {
    let score =50;
    
    const title =normalize(item.name || '');
    const artist =normalize(artistName);
    
    // BONUS por palabras del query en título
    for (const w of qWords) {
        if (w.length >=2 && title.includes(w)) score +=20;
    }
    
    // BONUS por coincidencia de artista (IMPORTANTE)
    if (detectedArtist && artist) {
        for (const token of detectedArtist.tokens) {
            if (artist.includes(token)) {
                score +=100;
            }
        }
    }
    
    // BONUS si el artista NO está vacío
    if (artist && artist.length > 1 && artist !=='unknown') {
        score +=30;
    } else {
        // PENALIZACIÓN si no hay artista
        score -=50;
    }
    
    // PENALIZACIONES
    for (const word of PENALTY_WORDS) {
        if (title.includes(word)) score -=40;
    }
    
    // BONUS por duración normal
    const dur =item.duration || 0;
    if (dur >=120 && dur <=330) score +=25;
    if (dur < 60) score -=30;
    if (dur > 480) score -=20;
    
    // Penalizar títulos largos
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
    const q =req.query.q || req.query.query || '';
    const limit =parseInt(req.query.limit) || 10;

    console.log('[youtube-search] START q="' + q + '"');

    if (! q) {
        return res.status(400).json({ success: false, error: 'Missing q' });
    }

    const qn =normalize(q);
    const qWords =qn.split(' ').filter(w => w.length > 1);
    const detectedArtist =detectArtist(q);
    
    console.log('[youtube-search] normalized="' + qn + '" artist=' + (detectedArtist?.name || 'none'));

    const results =await searchApi(q, 30);
    console.log('[youtube-search] Got', results.length, 'raw results');
    
    const scored =[];
    
    for (const item of results) {
        // ⭐ Extraer artista correctamente
        const artistName =extractArtistName(item);
        
        console.log('[youtube-search] Item:', item.name, '| Artist extracted:', artistName);
        
        // Filtrar basura
        if (shouldReject(item, artistName)) {
            console.log('[REJECT]', item.name, 'by', artistName);
            continue;
        }
        
        // Calcular score
        const score =calcScore(item, qWords, detectedArtist, artistName);
        
        if (score > 0) {
            item._score =score;
            item._artistName =artistName; // Guardar para usar después
            scored.push(item);
            console.log('[ACCEPT] score=' + score, item.name, 'by', artistName);
        }
    }
    
    scored.sort((a, b) => b._score - a._score);
    
    const final =scored.slice(0, limit).map(item => {
        let thumb ='';
        if (Array.isArray(item.image) && item.image.length > 0) {
            const hq =item.image.find(i => i.quality ==='500x500');
            thumb =hq ?hq.url : (item.image[item.image.length - 1].url || '');
        }
        
        // ⭐ Usar el artista extraído correctamente
        const artistName =item._artistName || extractArtistName(item) || 'Unknown';
        
        return {
            title: item.name || 'Sin titulo',
            author: { name: artistName },
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