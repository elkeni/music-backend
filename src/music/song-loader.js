/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 SONG LOADER - FASE 1 PURA: CARGA DE DATOS DESDE FUENTES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * FASE 1 = SOLO TRANSFORMACIÓN DE DATOS
 * 
 * - NO normaliza texto
 * - NO rankea
 * - NO filtra covers
 * - NO evalúa autoridad
 * - NO infiere fechas
 * - NO decide si es banda o artista individual
 * 
 * REGLAS ESTRICTAS:
 * - IDs 100% determinísticos (sin Date.now(), sin Math.random())
 * - Si no hay ID → DESCARTAR canción
 * - Si fecha no es YYYY-MM-DD → undefined (NO inferir)
 * - artistNames = array plano, groupName = undefined siempre
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createSong, SOURCE_TYPES } from './song-model.js';
import { addSong, addSongs, getSongCount } from './song-store.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES MÍNIMAS DE EXTRACCIÓN (Copia de youtube-search.js)
// ═══════════════════════════════════════════════════════════════════════════════
// 
// NOTA: Estas funciones son copias exactas de youtube-search.js.
// No se puede importar directamente porque youtube-search.js es un API handler
// que solo exporta el handler HTTP, no funciones internas.
// 
// En un refactor futuro, estas funciones deberían moverse a un módulo compartido.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extrae el nombre del artista de un item de YouTube/Saavn
 * COPIA EXACTA de youtube-search.js - NO MODIFICAR
 * 
 * @param {Object} item - Item de resultado de búsqueda
 * @returns {string} Nombre del artista
 */
function extractArtistName(item) {
    let rawArtist = '';

    if (item.primaryArtists?.trim()) {
        rawArtist = item.primaryArtists.trim();
    } else if (item.artist && typeof item.artist === 'string' && item.artist.trim()) {
        rawArtist = item.artist.trim();
    } else if (item.artists) {
        if (item.artists.primary && Array.isArray(item.artists.primary)) {
            const names = item.artists.primary.map(a => a.name || a).filter(Boolean);
            if (names.length > 0) rawArtist = names.join(', ');
        } else if (Array.isArray(item.artists)) {
            const names = item.artists.map(a => a.name || a).filter(Boolean);
            if (names.length > 0) rawArtist = names.join(', ');
        } else if (typeof item.artists === 'string' && item.artists.trim()) {
            rawArtist = item.artists.trim();
        }
    }

    if (!rawArtist && item.more_info) {
        if (item.more_info.artistMap?.primary_artists) {
            const artists = item.more_info.artistMap.primary_artists;
            if (Array.isArray(artists)) {
                const names = artists.map(a => a.name || a).filter(Boolean);
                if (names.length > 0) rawArtist = names.join(', ');
            }
        }
        if (!rawArtist && item.more_info.primary_artists?.trim()) {
            rawArtist = item.more_info.primary_artists.trim();
        }
    }

    if (!rawArtist && item.subtitle?.trim()) {
        rawArtist = item.subtitle.trim();
    }

    if (!rawArtist && item.music?.trim()) {
        rawArtist = item.music.trim();
    }

    return rawArtist;
}

/**
 * Detecta versiones VÁLIDAS: remix, remaster, radio edit, extended
 * COPIA EXACTA de youtube-search.js - NO MODIFICAR
 * 
 * @param {string} title - Título de la canción
 * @returns {{ type: string, details: string|null }}
 */
function detectValidVersion(title) {
    if (!title) return { type: 'original', details: null };

    const lowerTitle = title.toLowerCase();

    // Remix
    if (/\bremix\b/i.test(lowerTitle) || /\brmx\b/i.test(lowerTitle)) {
        const remixMatch = title.match(/\(([^)]+)\s*remix\)/i) || title.match(/\[([^\]]+)\s*remix\]/i);
        return {
            type: 'remix',
            details: remixMatch ? remixMatch[1].trim() : null
        };
    }

    // Remaster
    if (/\bremaster(ed)?\b/i.test(lowerTitle)) {
        const yearMatch = title.match(/(\d{4})\s*remaster/i) || title.match(/remaster(ed)?\s*(\d{4})/i);
        return {
            type: 'remaster',
            details: yearMatch ? yearMatch[1] || yearMatch[2] : null
        };
    }

    // Radio Edit
    if (/\bradio\s*edit\b/i.test(lowerTitle) || /\bradio\s*version\b/i.test(lowerTitle)) {
        return { type: 'radio_edit', details: null };
    }

    // Extended
    if (/\bextended\b/i.test(lowerTitle)) {
        return { type: 'extended', details: null };
    }

    // Single/Album version
    if (/\b(single|album)\s*version\b/i.test(lowerTitle)) {
        return { type: 'album_version', details: null };
    }

    // Live (clasificar, no rechazar)
    if (/\blive\b/i.test(lowerTitle) && /\blive\s+(at|from|in|on)\b/i.test(lowerTitle)) {
        return { type: 'live', details: null };
    }

    return { type: 'original', details: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFORMADORES: YouTube → Song (FASE 1 PURA)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transforma un resultado de YouTube en un Song
 * FASE 1 PURA: Sin inferencias, sin heurísticas
 * 
 * @param {Object} ytItem - Resultado crudo de youtube-search
 * @returns {import('./song-model.js').Song | null} Song o null si es inválido
 */
export function transformYouTubeItem(ytItem) {
    try {
        // ═══════════════════════════════════════════════════════════════════════
        // VALIDACIÓN: ID OBLIGATORIO (100% determinístico)
        // ═══════════════════════════════════════════════════════════════════════
        const id = ytItem.videoId || ytItem.id;

        if (!id) {
            console.log(`[song-loader] YouTube: Descartando canción sin ID`);
            return null;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // VALIDACIÓN: Duración obligatoria
        // ═══════════════════════════════════════════════════════════════════════
        const duration = ytItem.duration || ytItem.lengthSeconds || 0;

        if (!duration || duration <= 0) {
            console.log(`[song-loader] YouTube: Ignorando "${ytItem.name}" - sin duración válida`);
            return null;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // EXTRAER ARTISTAS - FASE 1 PURA: Array plano, sin groupName
        // ═══════════════════════════════════════════════════════════════════════
        const rawArtist = extractArtistName(ytItem);
        // FASE 1: Solo un array con el artista tal cual viene
        const artistNames = rawArtist ? [rawArtist] : ['Unknown'];

        // ═══════════════════════════════════════════════════════════════════════
        // DETECTAR VERSIÓN
        // ═══════════════════════════════════════════════════════════════════════
        const version = detectValidVersion(ytItem.name || '');

        // ═══════════════════════════════════════════════════════════════════════
        // CREAR SONG - FASE 1 PURA
        // ═══════════════════════════════════════════════════════════════════════
        return createSong({
            id: id,
            title: ytItem.name || ytItem.title || 'Unknown',  // SIN normalizar
            artistNames: artistNames,
            // groupName: undefined - NO decidir bandas en FASE 1
            // album: undefined - YouTube NO provee album
            // releaseDate: undefined - YouTube NO provee fecha
            duration: duration,
            versionType: version.type,
            versionDetails: version.details || undefined,
            source: SOURCE_TYPES.YOUTUBE,
            sourceId: id,
            metadata: {
                channelId: ytItem.channelId,
                channelTitle: ytItem.channelTitle || ytItem.subtitle,
                thumbnails: ytItem.thumbnails || ytItem.thumbnail,
                description: ytItem.description,
                viewCount: ytItem.viewCount,
                publishedAt: ytItem.publishedAt
            }
        });

    } catch (error) {
        console.error(`[song-loader] Error transformando YouTube item:`, error.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFORMADORES: Deezer → Song (FASE 1 PURA)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transforma un track de Deezer en un Song
 * FASE 1 PURA: Sin inferencias, sin heurísticas
 * 
 * @param {Object} deezerTrack - Track de la API de Deezer
 * @returns {import('./song-model.js').Song | null} Song o null si es inválido
 */
export function transformDeezerTrack(deezerTrack) {
    try {
        // ═══════════════════════════════════════════════════════════════════════
        // VALIDACIÓN: ID OBLIGATORIO (100% determinístico)
        // ═══════════════════════════════════════════════════════════════════════
        if (!deezerTrack.id) {
            console.log(`[song-loader] Deezer: Descartando canción sin ID`);
            return null;
        }

        const id = `dz_${deezerTrack.id}`;

        // ═══════════════════════════════════════════════════════════════════════
        // VALIDACIÓN: Duración obligatoria
        // ═══════════════════════════════════════════════════════════════════════
        const duration = deezerTrack.duration || 0;

        if (!duration || duration <= 0) {
            console.log(`[song-loader] Deezer: Ignorando "${deezerTrack.title}" - sin duración válida`);
            return null;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // EXTRAER ARTISTAS - FASE 1 PURA: Array plano, sin groupName
        // ═══════════════════════════════════════════════════════════════════════
        const artistNames = [];

        // Artista principal
        if (deezerTrack.artist?.name) {
            artistNames.push(deezerTrack.artist.name);
        }

        // Contribuidores adicionales (feats)
        if (deezerTrack.contributors && Array.isArray(deezerTrack.contributors)) {
            for (const contrib of deezerTrack.contributors) {
                if (contrib.name && !artistNames.includes(contrib.name)) {
                    artistNames.push(contrib.name);
                }
            }
        }

        // Fallback si no hay artistas
        if (artistNames.length === 0) {
            artistNames.push('Unknown');
        }

        // ═══════════════════════════════════════════════════════════════════════
        // DETECTAR VERSIÓN
        // ═══════════════════════════════════════════════════════════════════════
        const version = detectValidVersion(deezerTrack.title || '');

        // ═══════════════════════════════════════════════════════════════════════
        // EXTRAER ALBUM Y FECHA - SIN INFERENCIAS
        // ═══════════════════════════════════════════════════════════════════════
        let album = undefined;
        let releaseDate = undefined;

        // Album
        if (deezerTrack.album?.title) {
            album = deezerTrack.album.title;
        }

        // Fecha - SOLO aceptar formato YYYY-MM-DD exacto
        // ❌ NO inferir: si es YYYY solo → undefined
        if (deezerTrack.release_date && /^\d{4}-\d{2}-\d{2}$/.test(deezerTrack.release_date)) {
            releaseDate = deezerTrack.release_date;
        }

        // También intentar desde album si track no tiene fecha
        if (!releaseDate && deezerTrack.album?.release_date) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(deezerTrack.album.release_date)) {
                releaseDate = deezerTrack.album.release_date;
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // CREAR SONG - FASE 1 PURA
        // ═══════════════════════════════════════════════════════════════════════
        return createSong({
            id: id,
            title: deezerTrack.title || 'Unknown',  // SIN normalizar
            artistNames: artistNames,
            // groupName: undefined - NO decidir bandas en FASE 1
            album: album,
            releaseDate: releaseDate,
            duration: duration,
            versionType: version.type,
            versionDetails: version.details || undefined,
            source: SOURCE_TYPES.DEEZER,
            sourceId: String(deezerTrack.id),
            metadata: {
                isrc: deezerTrack.isrc,
                explicit_lyrics: deezerTrack.explicit_lyrics,
                bpm: deezerTrack.bpm,
                rank: deezerTrack.rank,
                disk_number: deezerTrack.disk_number,
                track_position: deezerTrack.track_position,
                preview: deezerTrack.preview,
                albumId: deezerTrack.album?.id,
                albumCover: deezerTrack.album?.cover_medium || deezerTrack.album?.cover,
                artistId: deezerTrack.artist?.id,
                artistPicture: deezerTrack.artist?.picture_medium
            }
        });

    } catch (error) {
        console.error(`[song-loader] Error transformando Deezer track:`, error.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: populateSongStore()
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Carga canciones en el store desde múltiples fuentes
 * FASE 1 PURA: Solo transforma y almacena, sin lógica adicional
 * 
 * @param {Object} options - Opciones de carga
 * @param {Object[]} [options.youtubeResults] - Resultados crudos de youtube-search
 * @param {Object[]} [options.deezerTracks] - Tracks de Deezer API
 * @returns {{ 
 *   totalProcessed: number, 
 *   totalAdded: number, 
 *   bySource: { youtube: number, deezer: number },
 *   errors: string[] 
 * }}
 */
export function populateSongStore({ youtubeResults = [], deezerTracks = [] } = {}) {
    console.log('[song-loader] ════════════════════════════════════════════════════════');
    console.log('[song-loader] FASE 1: CARGA DE CANCIONES');
    console.log(`[song-loader] YouTube: ${youtubeResults.length} items`);
    console.log(`[song-loader] Deezer: ${deezerTracks.length} tracks`);
    console.log('[song-loader] ════════════════════════════════════════════════════════');

    const result = {
        totalProcessed: 0,
        totalAdded: 0,
        bySource: {
            youtube: 0,
            deezer: 0
        },
        errors: []
    };

    const songsToAdd = [];

    // Procesar YouTube
    for (const ytItem of youtubeResults) {
        result.totalProcessed++;
        const song = transformYouTubeItem(ytItem);
        if (song) {
            songsToAdd.push(song);
            result.bySource.youtube++;
        }
    }

    // Procesar Deezer
    for (const deezerTrack of deezerTracks) {
        result.totalProcessed++;
        const song = transformDeezerTrack(deezerTrack);
        if (song) {
            songsToAdd.push(song);
            result.bySource.deezer++;
        }
    }

    // Insertar en el store
    const addResult = addSongs(songsToAdd);
    result.totalAdded = addResult.success;
    result.errors = addResult.errors;

    console.log('[song-loader] ════════════════════════════════════════════════════════');
    console.log('[song-loader] CARGA COMPLETADA');
    console.log(`[song-loader] Total procesados: ${result.totalProcessed}`);
    console.log(`[song-loader] Total añadidos: ${result.totalAdded}`);
    console.log(`[song-loader] YouTube: ${result.bySource.youtube}`);
    console.log(`[song-loader] Deezer: ${result.bySource.deezer}`);
    console.log(`[song-loader] Total en store: ${getSongCount()}`);
    console.log('[song-loader] ════════════════════════════════════════════════════════');

    return result;
}

/**
 * Carga una canción individual de YouTube
 * 
 * @param {Object} ytItem - Resultado de YouTube
 * @returns {import('./song-model.js').Song | null}
 */
export function loadFromYouTube(ytItem) {
    const song = transformYouTubeItem(ytItem);
    if (song) {
        addSong(song);
        return song;
    }
    return null;
}

/**
 * Carga una canción individual de Deezer
 * 
 * @param {Object} deezerTrack - Track de Deezer
 * @returns {import('./song-model.js').Song | null}
 */
export function loadFromDeezer(deezerTrack) {
    const song = transformDeezerTrack(deezerTrack);
    if (song) {
        addSong(song);
        return song;
    }
    return null;
}
