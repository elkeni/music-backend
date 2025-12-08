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

function normalize(text) {
    if (!text) return '';
    let r = text.toLowerCase();
    r = r.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    r = r.split('').map(c => LEET_MAP[c] || c).join('');
    r = r.replace(/&/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return r;
}

const KNOWN_ARTISTS = {
    'ca7riel': ['catriel', 'ca7riel'],
    'catriel': ['catriel'],
    'paco amoroso': ['paco', 'amoroso'],
    'bizarrap': ['bizarrap', 'bzrp'],
    'mana': ['mana'],
    'cafe tacuba': ['cafe', 'tacuba'],
    'hector lavoe': ['hector', 'lavoe'],
    'willie colon': ['willie', 'colon'],
    'grupo niche': ['grupo', 'niche'],
    'los panchos': ['panchos'],
    'skrillex': ['skrillex'],
    'bad bunny': ['bad', 'bunny'],
    'daddy yankee': ['daddy', 'yankee'],
    'grupo 5': ['grupo5', 'grupo'],
    'agua marina': ['agua', 'marina']
};

function detectArtist(query) {
    const qn = normalize(query);
    for (const [name, tokens] of Object.entries(KNOWN_ARTISTS)) {
        for (const t of tokens) {
            if (qn.includes(t)) return { name, tokens };
        }
    }
    const w = qn.split(' ');
    return w.length > 0?{name:w[0], tokens: [w[0]] } : null;
}

const BLACKLIST = ['karaoke', 'instrumental', 'chipmunk', 'nightcore', 'ringtone', '8d audio', 'music box', 'lullaby'];
const SOFT_BL = ['cover', 'tribute', 'remix', 'slowed', 'reverb', 'mix', 'medley', 'enganchado', 'megamix', 'live', 'en vivo'];
const BAD_ARTISTS = ['chichimarimba', 'karaoke', 'tribute', 'cover band', 'midi', 'kids'];

function shouldReject(item, qn) {
    const title = normalize(item.name || '');
    const artist = normalize(item.primaryArtists || '');
    for (const b of BLACKLIST) {
        if ((title.includes(b) || artist.includes(b)) && !qn.includes(b)) return true;
    }
    for (const b of BAD_ARTISTS) {
        if (artist.includes(b)) return true;
    }
    if ((item.duration || 0) > 900) return true;
    return false;
}

function calcScore(item, qWords, artist, qn) {
    let s = 50;
    const title = normalize(item.name || '');
    const art = normalize(item.primaryArtists || '');
    
    for (const w of qWords) {
        if (w.length < 2) continue;
        if (title.includes(w)) s += 15;
        if (art.includes(w)) s += 25;
    }
    
    if (artist && artist.tokens) {
        for (const t of artist.tokens) {
            if (art.includes(t)) s += 50;
        }
    }
    
    for (const b of SOFT_BL) {
        if (title.includes(b) && !qn.includes(b)) s -= 35;
    }
    
    if ((item.name || '').length > 60) s -= 15;
    if ((item.name || '').split('/').length > 2) s -= 50;
    
    const d = item.duration || 0;
    if (d > 0 && d < 60) s -= 30;
    if (d > 600) s -= 40;
    if (d >= 120 && d <= 300) s += 20;
    
    return s;
}

async function searchApi(query, limit) {
    try {
        const url =SOURCE_API+'/api/search/songs?query='+encodeURIComponent(query)+'&limit='+ limit;
        console.log('[search] Fetching:', url);
        
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);
        
        const res = await fetch(url,{ signal:ctrl.signal, headers:{'Accept':'application/json' } });
        clearTimeout(tid);
        
        if (! res.ok) {
            console.log('[search] HTTP error:', res.status);
            return [];
        }
        
        const data = await res.json();
        console.log('[search] Got data, success:', data.success);
        
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

    console.log('[youtube-search] START q=' + q);

    if (!q) {
        return res.status(400).json({ success: false, error: 'Missing q' });
    }

    const qn = normalize(q);
    const qWords = qn.split(' ').filter(w => w.length > 1);
    const artist = detectArtist(q);
    
    console.log('[youtube-search] normalized=' + qn + ' artist=' + (artist ? artist.name : 'none'));

    const variations = [q, qn, q.normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    const unique = [...new Set(variations)];
    
    const all = [];
    const seen = new Set();

    for (const v of unique) {
        console.log('[youtube-search] Trying variation:', v);
        const results = await searchApi(v, 20);
        console.log('[youtube-search] Got', results.length, 'results');
        
        for (const item of results) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            
            if (shouldReject(item, qn)) {
                console.log('[youtube-search] REJECT:', item.name);
                continue;
            }
            
            item._score = calcScore(item, qWords, artist, qn);
            if (item._score > 0) {
                all.push(item);
            }
        }
        
        if (all.filter(x => x._score >= 80).length >= limit) break;
    }

    all.sort((a, b) => b._score - a._score);

    const final = all.slice(0, limit).map(item => {
        let thumb = '';
        if (Array.isArray(item.image) && item.image.length > 0) {
            const hq = item.image.find(i => i.quality === '500x500');
            thumb = hq?hq.url:(item.image[item.image.length-1].url || '');
        }
        return {
            title: item.name || 'Sin titulo',
            author: {name:item.primaryArtists || 
          item.artists?.primary?.map(a => a.name). join(', ') || 
          'Unknown'},
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