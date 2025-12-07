// api/youtube-streams.js

const PIPED_INSTANCE = 'https://pipedapi.kavin.rocks'; // Kavin suele ser más estable que tokhmi

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

  const url = `${PIPED_INSTANCE}/streams/${videoId}`;
  console.log(`[youtube-streams] Fetching streams for: ${videoId}`);

  try {
    const r = await fetch(url);

    if (!r.ok) {
      console.error(`[youtube-streams] Upstream error ${r.status}`);
      return res.status(r.status).json({ success: false, error: 'Upstream stream error' });
    }

    let data;
    try {
      data = await r.json();
    } catch (parseErr) {
      console.error('[youtube-streams] JSON Parse Error', parseErr);
      return res.status(502).json({ success: false, error: 'Bad upstream response' });
    }

    if (data.error) {
        return res.status(400).json({ success: false, error: data.error });
    }

    const audioStreams = (data.audioStreams || []).map((stream) => ({
      url: stream.url,
      quality: stream.quality || `${stream.bitrate || 0}bps`,
      format: stream.format || (stream.mimeType ? stream.mimeType.split('/')[1] : 'mp3'),
      contentLength: stream.contentLength
    }));

    // Ordenar por calidad (bitrate más alto primero es una buena práctica)
    // Nota: Esto es opcional, depende de tu lógica de frontend.
    
    return res.status(200).json({ success: true, audioStreams });

  } catch (err) {
    console.error('[youtube-streams] CRASH:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

export default allowCors(handler);