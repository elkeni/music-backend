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

// Cargar variables de entorno ANTES de cualquier otro import
// dotenv es un paquete npm que lee el archivo .env
import 'dotenv/config';

import { createSong, SOURCE_TYPES } from './song-model.js';
import { addSong, addSongs, getSongCount } from './song-store.js';



// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTS DEL EXTRACTOR COMPARTIDO (FASE 3 - UNIFICADA)
// ═══════════════════════════════════════════════════════════════════════════════
import {
    extractArtistName,
    detectVersion,
    isTrashContent
} from './extraction/youtube-extractor.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFORMADORES: YouTube → Song (MODERNIZADO)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transforma un resultado de YouTube en un Song
 * REFACTORIZADO: Usa lógica compartida con el buscador.
 * 
 * @param {Object} ytItem - Resultado crudo de youtube-search
 * @returns {import('./song-model.js').Song | null} Song o null si es inválido
 */
export function transformYouTubeItem(ytItem) {
    try {
        // 1. Validar ID
        const id = ytItem.videoId || ytItem.id;
        if (!id) return null;

        // 2. Validar Duración
        const duration = ytItem.duration || ytItem.lengthSeconds || 0;

        // REPARACIÓN: Permitir duración 0 si viene de fallback (DuckDuckGo)
        // En estos casos, la duración es desconocida pero el item es válido.
        const isFallback = ytItem._proxy === 'duckduckgo';

        if ((!duration || duration <= 0) && !isFallback) return null;

        // 3. Extracción de Datos Básicos
        const title = ytItem.name || ytItem.title || 'Unknown';
        const artist = extractArtistName(ytItem) || 'Unknown';

        // 4. Filtrado de Calidad (Basura / Versiones Prohibidas)
        // Solo para importación masiva. Si el usuario pide explícitamente, tal vez queramos ser laxos.
        // Pero para "rebuild-index" queremos calidad.
        if (isTrashContent({ name: title, artist, duration })) {
            console.log(`[song-loader] Ignored trash content: "${title}"`);
            return null;
        }

        // 5. Detectar Versión y Filtrar Prohibidas
        const version = detectVersion(title);

        if (version.isForbidden) {
            console.log(`[song-loader] Ignored forbidden version (${version.type}): "${title}"`);
            return null;
        }

        // 6. Crear Song
        return createSong({
            id: id,
            title: title,
            artistNames: [artist], // Array simple por ahora
            duration: duration,
            versionType: version.type,
            versionDetails: version.detail || undefined, // Nota: detectVersion usa 'detail' (singular)
            source: SOURCE_TYPES.YOUTUBE,
            sourceId: id,
            metadata: {
                channelId: ytItem.channelId,
                channelTitle: ytItem.channelTitle || ytItem.subtitle,
                thumbnails: ytItem.thumbnails || ytItem.thumbnail,
                description: ytItem.description,
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
        const versionCheck = detectVersion(deezerTrack.title || '');
        const versionType = versionCheck.isForbidden ? null : versionCheck.type;
        const versionDetail = versionCheck.isForbidden ? null : versionCheck.detail;

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
            versionType: versionType,
            versionDetails: versionDetail || undefined,
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

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRYPOINT (solo para uso manual)
// ═══════════════════════════════════════════════════════════════════════════════

if (process.argv[1] && process.argv[1].includes('song-loader.js')) {
    const query = process.argv.slice(2).join(' ');

    if (!query) {
        console.error('❌ Uso: node song-loader.js <search query>');
        console.error('   Ejemplo: node song-loader.js thunderstruck');
        process.exit(1);
    }

    (async () => {
        // Cargar variables de entorno desde .env
        await import('dotenv/config');

        console.log(`🎵 Loading songs for query: "${query}"`);

        // Import dinámico de módulos necesarios
        const { initDB, isDBEnabled } = await import('./persistence/db.js');
        const { persistSong } = await import('./persistence/song-repository.js');
        const { buildSongIdentity } = await import('./identity/build-identity.js');
        const { evaluateSourceAuthority } = await import('./authority/source-authority.js');
        const { evaluateNonOfficial } = await import('./authority/detect-non-official.js');

        // Inicializar DB - modo dry-run si no está disponible
        const dbConnected = await initDB();
        const dryRun = !dbConnected;

        if (dryRun) {
            console.log('⚠️  PostgreSQL no disponible - modo DRY RUN (no se persiste nada)');
            console.log('   Para persistir, configura DATABASE_URL en variables de entorno');
        } else {
            console.log('✅ Conectado a PostgreSQL');
        }

        // Buscar en YouTube usando fetch a la API local o youtube-sr
        let results = [];

        try {
            // youtube-sr es CommonJS, usar createRequire para importarlo
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            const YouTube = require('youtube-sr').default || require('youtube-sr');
            const searchResults = await YouTube.search(query, { limit: 20, type: 'video' });

            console.log(`🔍 Found ${searchResults.length} YouTube results`);

            // Transformar resultados
            for (const item of searchResults) {
                const ytItem = {
                    videoId: item.id,
                    name: item.title,
                    duration: item.duration / 1000, // youtube-sr da ms
                    channelId: item.channel?.id,
                    channelTitle: item.channel?.name,
                    thumbnails: item.thumbnail?.url
                };

                const song = transformYouTubeItem(ytItem);
                if (song) {
                    // Calcular identity
                    const identity = buildSongIdentity(song);

                    // Calcular authority
                    const authority = evaluateSourceAuthority(song);
                    const nonOfficial = evaluateNonOfficial(song);

                    results.push({
                        song,
                        identity,
                        authority,
                        nonOfficial,
                        confidence: authority.score / 100 // normalizar a 0-1
                    });
                }
            }
        } catch (e) {
            console.error('❌ Error buscando en YouTube:', e.message);
            console.error('   ¿Está instalado youtube-sr? npm install youtube-sr');
            process.exit(1);
        }

        console.log(`🔍 Processed ${results.length} candidates`);

        // Filtrar por alta confianza
        const MIN_CONFIDENCE = 0.70; // authority score >= 70
        const highConfidence = results.filter(r => r.confidence >= MIN_CONFIDENCE);

        console.log(`📊 High confidence (>= 70%): ${highConfidence.length} candidates`);

        // Mostrar candidatos
        for (const item of highConfidence) {
            console.log(`  • ${item.song.title} - ${item.song.artistNames.join(', ')} (${(item.confidence * 100).toFixed(0)}%)`);
        }

        // Persistir solo si hay DB
        let persisted = 0;

        if (!dryRun) {
            for (const item of highConfidence) {
                const success = await persistSong({
                    song: item.song,
                    identity: item.identity,
                    authority: item.authority,
                    nonOfficial: item.nonOfficial
                });

                if (success) {
                    persisted++;
                }
            }

            console.log(`✅ Persisted ${persisted} songs into database`);

            // Cerrar conexión
            const { closeDB } = await import('./persistence/db.js');
            await closeDB();
        } else {
            console.log(`⚠️  DRY RUN: ${highConfidence.length} songs would be persisted`);
        }

        process.exit(0);
    })().catch(err => {
        console.error('💥 Loader failed:', err);
        process.exit(1);
    });
}
