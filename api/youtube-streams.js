// api/youtube-streams.js

const PIPED_INSTANCE = 'https://pipedapi.tokhmi.xyz';

export default async function handler(req, res) {
  try {
    const { videoId } = req.query || {};

    if (!videoId) {
      return res.status(400).json({ success: false, error: 'Missing videoId' });
    }

    const url = `${PIPED_INSTANCE}/streams/${videoId}`;
    const r = await fetch(url);
    if (!r.ok) {
      console.error('[youtube-streams] piped error status', r.status);
      return res
        .status(r.status)
        .json({ success: false, error: 'Piped streams error' });
    }

    const data = await r.json();

    const audioStreams = (data.audioStreams || []).map((stream) => ({
      url: stream.url,
      quality:
        stream.quality || (stream.bitrate ? `${stream.bitrate}bps` : ''),
      format:
        stream.format ||
        (stream.mimeType ? stream.mimeType.split('/')[1] : ''),
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ success: true, audioStreams });
  } catch (err) {
    console.error('[api/youtube-streams] CRASH', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}