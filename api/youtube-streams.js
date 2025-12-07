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
    // Si appmusic-phi usa "/api/songs?id=" para obtener detalles y links:
    const url = `${SOURCE_API}/api/songs?id=${videoId}`;
    console.log(`[proxy-streams] Fetching details for: ${videoId}`);

    const r = await fetch(url);
    if (!r.ok) {
      return res.status(r.status).json({ success: false, error: 'Source API error' });
    }

    const data = await r.json();
    
    // Manejo de la estructura de respuesta (Saavn API suele devolver un array o un objeto data)
    const songData = data.data?.[0] || data[0] || data;

    if (!songData || !songData.downloadUrl) {
       console.error('[proxy-streams] No downloadUrl found in:', JSON.stringify(data).slice(0, 100));
       return res.status(404).json({ success: false, error: 'Stream not found in source' });
    }

    // Extraemos los links de audio. Saavn suele dar varios bitrates.
    const streams = songData.downloadUrl.map(linkObj => ({
        url: linkObj.link,
        quality: linkObj.quality || 'unknown',
        format: 'mp4/aac' // Saavn suele ser AAC/MP4
    }));

    // Si downloadUrl no es un array, sino un string directo (depende de la versión de la API)
    if (typeof songData.downloadUrl === 'string') {
        streams.push({
            url: songData.downloadUrl,
            quality: 'high',
            format: 'mp4'
        });
    }

    return res.status(200).json({ success: true, audioStreams: streams });

  } catch (err) {
    console.error('[proxy-streams] CRASH:', err);
    return res.status(500).json({ success: false, error: 'Internal Error' });
  }
}

export default allowCors(handler);