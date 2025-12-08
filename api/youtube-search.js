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

function checkArtistMatch(target, current) {
    const nTarget = normalize(target);
    const nCurrent = normalize(current);
    
    if (!nTarget || !nCurrent) return 'none';

    // 1.Coincidencia Directa (La más fuerte)
    if (nCurrent.includes(nTarget) || nTarget.includes(nCurrent)) {
        return 'exact';
    }
    
    // 2.Coincidencia por Palabras (Token Matching)
    // Resuelve problemas de orden: "A & B" vs "B & A"
    const tTarget = nTarget.split(' ').filter(w => w.length > 1);
    const tCurrent = nCurrent.split(' ').filter(w => w.length > 1);
    
    let matches = 0;
    for (const w of tTarget) {
        if (tCurrent.includes(w)) matches++;
    }
    
    // Si encontramos todas las palabras del artista buscado (o la mayoría)
    if (matches >= tTarget.length) return 'exact';
    if (matches > 0 && matches >= (tTarget.length / 2)) return 'partial';
    
    return 'none';
}

function calcScore(item, qWords, targetArtist, targetTrack, targetDuration) {
    let score = 50;
    
    const title = normalize(item.name || '');
    // Extraemos el artista del resultado una sola vez
    const itemArtist = normalize(item._artistName || extractArtistName(item) || '');
    const duration = item.duration || 0;

    // --- 1.FILTRO DE ARTISTA INTELIGENTE ---
    if (targetArtist && targetArtist.length > 1) {
        const matchType = checkArtistMatch(targetArtist, itemArtist);
        
        if (matchType === 'exact') {
            score += 100; // ¡Es el artista correcto!
        } else if (matchType === 'partial') {
            score += 50;  // Es probablemente el artista (ej: Feat, o solo un miembro)
        } else {
            // ⭐ PENALIZACIÓN SUAVE:
            // En vez de -200 (que mataba todo), bajamos a -50.
            // Si el título es MUY bueno, aún podría salvarse.
            score -= 50; 
        }
    }

    // --- 2.COINCIDENCIA DE TÍTULO ---
    const trackWords = normalize(targetTrack || '').split(' ').filter(w => w.length > 2);
    let wordsFound = 0;
    for (const w of trackWords) {
        if (title.includes(w)) wordsFound++;
    }
    if (wordsFound === trackWords.length) score += 50;
    else if (wordsFound > 0) score += 20;

    // --- 3.FILTRO DE DURACIÓN (Tolerancia Ampliada) ---
    if (targetDuration > 0) {
        const diff = Math.abs(duration - targetDuration);
        if (diff <= 5) score += 40;       
        else if (diff <= 15) score += 20; 
        // Penalizamos menos fuerte la duración, por si es una versión remaster
        else if (diff > 60) score -= 40; 
    }

    // --- 4.PENALIZACIONES DE CALIDAD ---
    for (const word of PENALTY_WORDS) {
        // Penalizamos "live", "cover", etc.
        if (title.includes(word)) score -= 40;
    }
    
    // Rechazo extra para covers explícitos en el artista
    if (itemArtist.includes('cover') || itemArtist.includes('tribute')) {
        score -= 100;
    }

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
    // Recibir parámetros explícitos
    const q =req.query.q || req.query.query || '';
    const targetArtist =req.query.artist || ''; 
    const targetTrack =req.query.track || '';
    const targetDuration =parseInt(req.query.duration) || 0;
    const limit =parseInt(req.query.limit) || 10;

    if (!q) return res.status(400).json({ success: false, error: 'Missing q' });

    console.log(`[backend] Searching: "${q}"| Target: ${targetArtist} - ${targetTrack} (${targetDuration}s)`);

    // Usar la API externa (limitamos a 25 para ser rápidos pero tener variedad)
    const results =await searchApi(q, 25);
    
    const scored =[];
    const qWords =normalize(q).split(' ').filter(w => w.length > 1);

    for (const item of results) {
        const artistName =extractArtistName(item);
        item._artistName =artistName;

        if (shouldReject(item, artistName)) continue;

        // Pasar los datos exactos al score
        const score =calcScore(item, qWords, targetArtist, targetTrack, targetDuration);

        if (score > 0) {
            item._score =score;
            scored.push(item);
        }
    }
    
    // Ordenar y cortar
    scored.sort((a, b) => b._score - a._score);
    
    const final =scored.slice(0, limit).map(item => ({
        title: item.name || 'Sin titulo',
        author: { name: item._artistName || 'Unknown' },
        duration: item.duration || 0,
        videoId: item.id,
        thumbnail: item.image?.find(i => i.quality ==='500x500')?.url || '',
        source: 'saavn',
        _score: item._score // Devolvemos el score para que el frontend vea la confianza
    }));

    return res.status(200).json({ success: true, results: final });
}

export default allowCors(handler);