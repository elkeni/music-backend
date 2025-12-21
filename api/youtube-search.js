/**
 * 🎵 YouTube Search API - Simple & Direct
 * 
 * YouTube ya hace el filtrado. Solo buscamos y devolvemos.
 */

export const config = { runtime: 'nodejs' };

const SOURCE_API = 'https://appmusic-phi.vercel.app';

// Cache simple
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

// CORS
const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    return await fn(req, res);
};

// Buscar en la API
async function searchApi(query, limit = 10) {
    try {
        const url = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 12000);
        
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        
        if (!res.ok) return [];
        const data = await res.json();
        return data?.data?.results || [];
    } catch (e) {
        console.log('[search] Error:', e.message);
        return [];
    }
}

// Extraer nombre del artista
function getArtist(item) {
    if (item.primaryArtists?.trim()) return item.primaryArtists.trim();
    if (item.artist && typeof item.artist === 'string') return item.artist.trim();
    if (Array.isArray(item.artists?.primary)) {
        return item.artists.primary.map(a => a.name || a).filter(Boolean).join(', ');
    }
    if (Array.isArray(item.artists)) {
        return item.artists.map(a => a.name || a).filter(Boolean).join(', ');
    }
    if (typeof item.artists === 'string') return item.artists.trim();
    if (item.subtitle?.trim()) return item.subtitle.trim();
    return 'Unknown';
}

// Handler principal
async function handler(req, res) {
    const query = req.query.q || req.query.query || '';
    const limit = parseInt(req.query.limit) || 10;
    
    if (!query) {
        return res.status(400).json({ success: false, error: 'Missing q parameter' });
    }
    
    // Cache check
    const cacheKey = query.toLowerCase().trim();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[cache] HIT: "${query}"`);
        return res.status(200).json({ success: true, source: 'cache', results: cached.results });
    }
    
    console.log(`[search] "${query}"`);
    
    // Buscar
    const results = await searchApi(query, limit);
    
    // Formatear respuesta - sin filtros, YouTube ya lo hizo
    const formatted = results.map(item => ({
        title: item.name || 'Sin título',
        author: { name: getArtist(item) },
        duration: item.duration || 0,
        videoId: item.id,
        thumbnail: item.image?.find(i => i.quality === '500x500')?.url || item.image?.[0]?.url || '',
        album: item.album?.name || item.album || null,
        source: 'youtube'
    }));
    
    // Guardar en cache
    if (formatted.length > 0) {
        cache.set(cacheKey, { timestamp: Date.now(), results: formatted });
    }
    
    return res.status(200).json({
        success: true,
        source: 'api',
        query,
        results: formatted
    });
}

export default allowCors(handler);
