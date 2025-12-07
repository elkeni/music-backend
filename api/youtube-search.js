// api/youtube-search.js

const SOURCE_API='https://appmusic-phi.vercel.app';

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

async function handler(req, res) {
    const { q, query, limit = 10 } = req.query || {};
    const searchQuery = q || query;

    console.log(`[youtube-search] Query: "${searchQuery}", Limit: ${limit}`);

    if (!searchQuery) {
        return res.status(400).json({
            success: false,
            error: 'Missing query parameter (q)'
        });
    }

    try {
        const targetUrl = `${SOURCE_API}/api/search/songs?query=${encodeURIComponent(searchQuery)}&limit=${limit}`;
        console.log(`[youtube-search] Calling: ${targetUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`[youtube-search] Source API error: ${response.status}`);
            return res.status(response.status).json({
                success: false,
                error: `Source API error: ${response.status}`
            });
        }

        const data = await response.json();
        const rawResults = data.data?.results || [];

        if (rawResults.length === 0) {
            console.warn(`[youtube-search] No results found`);
            return res.status(200).json({ success: true, results: [] });
        }

        const results = rawResults.slice(0, Number(limit)).map((item) => {
            let thumb = '';
            if (Array.isArray(item.image)) {
                const hq = item.image.find(i => i.quality === '500x500');
                thumb = hq?.url || item.image[item.image.length - 1]?.url || '';
            } else if (typeof item.image === 'string') {
                thumb = item.image;
            }

            let artistName = 'Unknown';
            if (item.artists?.primary && item.artists.primary.length > 0) {
                artistName = item.artists.primary.map(a => a.name).join(', ');
            } else if (item.primaryArtists) {
                artistName = item.primaryArtists;
            } else if (item.artist) {
                artistName = item.artist;
            }

            return {
                title: item.name || item.title || 'Sin título',
                author: { name: artistName },
                duration: item.duration || 0,
                videoId: item.id,
                thumbnail: thumb,
                source: 'saavn'
            };
        });

        console.log(`[youtube-search] Found ${results.length} results`);
        return res.status(200).json({ success: true, results });

    } catch (err) {
        if (err.name === 'AbortError') {
            console.error('[youtube-search] Timeout');
            return res.status(504).json({ success: false, error: 'Timeout' });
        }
        console.error('[youtube-search] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}

export default allowCors(handler);