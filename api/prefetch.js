/**
 * Prefetch real de reproducción.
 *
 * Usa exactamente el mismo resolver de /api/instant-play. La respuesta incluye
 * el playback completo para que el frontend lo guarde y lo use al hacer clic.
 * La resolución también queda en el caché compartido cuando Redis está activo.
 */

import {
    normalizeAudioQualityMode,
    resolveInstantPlayback
} from './instant-play.js';

export const config = { runtime: 'nodejs' };

const allowCors = fn => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, save-data');
    if (req.method === 'OPTIONS') return res.status(200).end();
    return fn(req, res);
};

async function handler(req, res) {
    const { title, track, artist, quality } = req.query || {};
    const trackName = track || title || '';

    if (!trackName && !artist) {
        return res.status(400).json({
            success: false,
            error: 'Missing title or artist parameter'
        });
    }

    const qualityMode = normalizeAudioQualityMode(
        quality,
        req.headers?.['save-data'] === 'on'
    );
    const playback = await resolveInstantPlayback({
        artist: artist || '',
        track: trackName,
        qualityMode
    });

    res.setHeader('Cache-Control', 'no-store');
    if (!playback.success) {
        // Prefetch es oportunista: no convierte un fallo en error visible de UI.
        return res.status(200).json({
            success: false,
            reason: playback.code || 'not_resolved',
            ms: playback.ms
        });
    }

    return res.status(200).json({
        success: true,
        playback,
        cacheStatus: playback.cacheStatus,
        ms: playback.ms
    });
}

/**
 * Compatibilidad con el fire-and-forget histórico de youtube-search. Solo se
 * ejecuta cuando existen artista y título suficientes para el matcher real.
 */
export async function internalPrefetch(trackData) {
    const title = trackData?.title || '';
    const artist = trackData?.artist || trackData?.author?.name || '';
    if (!title || !artist) return null;

    try {
        return await resolveInstantPlayback({
            artist,
            track: title,
            qualityMode: 'balanced'
        });
    } catch (error) {
        console.log('[prefetch-internal] Failed:', error.message);
        return null;
    }
}

export default allowCors(handler);
