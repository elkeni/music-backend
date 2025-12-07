// api/youtube-streams.js

const SOURCE_API = 'https://appmusic-phi.vercel.app';

const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  return await fn(req, res);
};

async function handler(req, res) {
  const { videoId } = req.query || {};

  if (!videoId) {
    return res.status(400).json({ success: false, error: 'Missing videoId' });
  }

  try {
    const url = `${SOURCE_API}/api/songs?id=${videoId}`;
    console.log(`[proxy-streams] Fetching song ID: ${videoId}`);

    const r = await fetch(url);
    if (!r.ok) {
      return res.status(r.status).json({ success: false, error: 'Source API error' });
    }

    const data = await r.json();
    
    // Saavn suele devolver { data: [songObj] } o a veces directo el objeto
    const songData = data.data?.[0] || data[0] || data.data || data;

    if (!songData) {
       return res.status(404).json({ success: false, error: 'Song not found' });
    }

    let streams = [];
    const downloadLinks = songData.downloadUrl || [];

    // CORRECCIÓN: Soportamos tanto .url como .link para estar seguros
    if (Array.isArray(downloadLinks)) {
        streams = downloadLinks.map(linkObj => ({
            url: linkObj.url || linkObj.link, 
            quality: linkObj.quality || 'unknown',
            format: 'mp4' 
        }));
    } else if (typeof downloadLinks === 'string') {
        streams.push({
            url: downloadLinks,
            quality: 'high',
            format: 'mp4'
        });
    }

    // Si falló lo anterior, intentamos media_url como respaldo
    if (streams.length === 0 && songData.media_url) {
         streams.push({ url: songData.media_url, quality: 'default', format: 'mp4' });
    }

    return res.status(200).json({ success: true, audioStreams: streams });

  } catch (err) {
    console.error('[proxy-streams] CRASH:', err);
    return res.status(500).json({ success: false, error: 'Internal Error' });
  }
}

export default allowCors(handler);