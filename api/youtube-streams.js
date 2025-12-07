// api/youtube-streams.js

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io',
  'https://api-piped.mha.fi',
  'https://piped-api.lunar.icu'
];

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

  let lastError = null;

  for (const baseUrl of PIPED_INSTANCES) {
    try {
      const url = `${baseUrl}/streams/${videoId}`;
      console.log(`[youtube-streams] Trying: ${baseUrl}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); 

      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (r.ok) {
        const data = await r.json();
        
        if (data.error) throw new Error(data.error);

        const audioStreams = (data.audioStreams || []).map((stream) => ({
          url: stream.url,
          quality: stream.quality || `${stream.bitrate || 0}bps`,
          format: stream.format || (stream.mimeType ? stream.mimeType.split('/')[1] : 'mp3'),
          contentLength: stream.contentLength
        }));

        return res.status(200).json({ success: true, audioStreams });
      }
      
      console.warn(`[youtube-streams] Failed ${baseUrl}: ${r.status}`);
      lastError = `Status ${r.status}`;

    } catch (err) {
      console.warn(`[youtube-streams] Error ${baseUrl}: ${err.message}`);
      lastError = err.message;
    }
  }

  return res.status(503).json({ success: false, error: 'All streams instances failed', lastDetail: lastError });
}

export default allowCors(handler);