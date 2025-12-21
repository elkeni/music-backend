/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 UNIFIED MUSIC SEARCH - YouTube + Exact Match + DB Cache
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * FLUJO:
 * 1. Frontend envía: query + metadata (artist, track, album, duration, year)
 * 2. Backend busca en YouTube
 * 3. Backend filtra por MATCH EXACTO
 * 4. Si es exacto → guardar en DB (cache permanente)
 * 5. Si no es exacto → no guardar, devolver con flag
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const config = { runtime: 'nodejs' };

const SOURCE_API = 'https://appmusic-phi.vercel.app';

// ═══════════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════════

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    return await fn(req, res);
};

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

function normalize(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
        .replace(/[^\w\s]/g, ' ') // quitar puntuación
        .replace(/\s+/g, ' ')
        .trim();
}

// Limpiar ruido de títulos (Official Video, etc)
function cleanTitle(text) {
    if (!text) return '';
    return text
        .replace(/\(official\s*(music\s*)?video\)/gi, '')
        .replace(/\(official\s*audio\)/gi, '')
        .replace(/\(lyrics?\s*(video)?\)/gi, '')
        .replace(/\[official.*?\]/gi, '')
        .replace(/\[lyrics?\]/gi, '')
        .replace(/\(audio\)/gi, '')
        .replace(/\(video\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE ARTISTA
// ═══════════════════════════════════════════════════════════════════════════════

function extractArtist(item) {
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
    return '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDACIÓN DE MATCH EXACTO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica si un resultado es un MATCH EXACTO con los criterios dados
 * 
 * @param {Object} candidate - Resultado de YouTube
 * @param {Object} criteria - Criterios del frontend
 * @returns {{ isExact: boolean, matchScore: number, details: Object }}
 */
function validateExactMatch(candidate, criteria) {
    const details = {
        title: { expected: criteria.track, found: '', match: false },
        artist: { expected: criteria.artist, found: '', match: false },
        album: { expected: criteria.album, found: '', match: null },
        duration: { expected: criteria.duration, found: 0, diff: null, match: null },
        year: { expected: criteria.year, found: '', match: null }
    };

    let matchCount = 0;
    let totalCriteria = 0;

    // ═══════════════════════════════════════════════════════════════════════════
    // TÍTULO (obligatorio)
    // ═══════════════════════════════════════════════════════════════════════════
    if (criteria.track) {
        totalCriteria++;
        const expectedTitle = normalize(cleanTitle(criteria.track));
        const foundTitle = normalize(cleanTitle(candidate.name || ''));
        details.title.found = candidate.name || '';

        // Match exacto o uno contiene al otro
        if (expectedTitle === foundTitle ||
            foundTitle.includes(expectedTitle) ||
            expectedTitle.includes(foundTitle)) {
            details.title.match = true;
            matchCount++;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARTISTA (obligatorio)
    // ═══════════════════════════════════════════════════════════════════════════
    if (criteria.artist) {
        totalCriteria++;
        const expectedArtist = normalize(criteria.artist);
        const foundArtist = normalize(extractArtist(candidate));
        details.artist.found = extractArtist(candidate);

        // Match exacto o uno contiene al otro
        if (expectedArtist === foundArtist ||
            foundArtist.includes(expectedArtist) ||
            expectedArtist.includes(foundArtist)) {
            details.artist.match = true;
            matchCount++;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ÁLBUM (opcional pero cuenta si se proporciona)
    // ═══════════════════════════════════════════════════════════════════════════
    if (criteria.album) {
        totalCriteria++;
        const expectedAlbum = normalize(criteria.album);
        const foundAlbum = normalize(candidate.album?.name || candidate.album || '');
        details.album.found = candidate.album?.name || candidate.album || '';

        if (expectedAlbum === foundAlbum ||
            foundAlbum.includes(expectedAlbum) ||
            expectedAlbum.includes(foundAlbum)) {
            details.album.match = true;
            matchCount++;
        } else {
            details.album.match = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DURACIÓN (opcional, tolerancia ±10 segundos)
    // ═══════════════════════════════════════════════════════════════════════════
    if (criteria.duration && criteria.duration > 0) {
        totalCriteria++;
        const expectedDuration = parseInt(criteria.duration);
        const foundDuration = candidate.duration || 0;
        const diff = Math.abs(foundDuration - expectedDuration);

        details.duration.found = foundDuration;
        details.duration.diff = diff;

        if (diff <= 10) { // Tolerancia de 10 segundos
            details.duration.match = true;
            matchCount++;
        } else {
            details.duration.match = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AÑO (opcional)
    // ═══════════════════════════════════════════════════════════════════════════
    if (criteria.year) {
        totalCriteria++;
        const expectedYear = String(criteria.year);
        const foundYear = candidate.year || candidate.releaseDate?.substring(0, 4) || '';
        details.year.found = foundYear;

        if (expectedYear === foundYear) {
            details.year.match = true;
            matchCount++;
        } else {
            details.year.match = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CALCULAR SCORE
    // ═══════════════════════════════════════════════════════════════════════════
    const matchScore = totalCriteria > 0 ? matchCount / totalCriteria : 0;

    // Es exacto si título Y artista coinciden (mínimo requerido)
    // Y todos los criterios opcionales que se proporcionaron también coinciden
    const isExact = details.title.match && details.artist.match && matchScore === 1;

    return {
        isExact,
        matchScore: Math.round(matchScore * 100) / 100,
        details
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BÚSQUEDA EN API
// ═══════════════════════════════════════════════════════════════════════════════

async function searchApi(query, limit = 20) {
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

// ═══════════════════════════════════════════════════════════════════════════════
// GUARDAR EN DB (solo matches exactos)
// ═══════════════════════════════════════════════════════════════════════════════

async function saveToDatabase(song, matchDetails) {
    try {
        // Import dinámico para evitar errores si DB no está configurada
        const { upsertSong, isDBEnabled } = await import('../src/music/persistence/song-repository.js').catch(() => ({
            upsertSong: null,
            isDBEnabled: () => false
        }));

        if (!upsertSong || !isDBEnabled()) {
            console.log('[db] Database not available, skipping save');
            return false;
        }

        const songData = {
            id: song.videoId,
            sourceId: song.videoId,
            source: 'youtube',
            title: song.title,
            artist: song.artist,
            album: song.album || null,
            duration: song.duration,
            year: song.year || null,
            thumbnail: song.thumbnail,
            verifiedAt: new Date().toISOString(),
            matchScore: matchDetails.matchScore
        };

        await upsertSong(songData);
        console.log(`[db] Saved exact match: "${song.title}" by ${song.artist}`);
        return true;
    } catch (e) {
        console.log('[db] Error saving:', e.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handler(req, res) {
    const query = req.query.q || req.query.query || '';
    const limit = parseInt(req.query.limit) || 10;

    // Criterios de matching del frontend
    const criteria = {
        track: req.query.track || '',
        artist: req.query.artist || '',
        album: req.query.album || '',
        duration: parseInt(req.query.duration) || 0,
        year: req.query.year || ''
    };

    // Flags
    const saveExact = req.query.save !== 'false'; // Por defecto guarda exactos
    const onlyExact = req.query.exact === 'true'; // Solo devolver exactos

    if (!query) {
        return res.status(400).json({ success: false, error: 'Missing q parameter' });
    }

    console.log(`[search] query="${query}" | criteria:`, criteria);

    // Buscar en YouTube
    const rawResults = await searchApi(query, limit * 2); // Buscar más para filtrar

    // Procesar y validar cada resultado
    const results = [];

    for (const item of rawResults) {
        const artist = extractArtist(item);

        const song = {
            title: item.name || '',
            artist: artist,
            album: item.album?.name || item.album || null,
            duration: item.duration || 0,
            year: item.year || item.releaseDate?.substring(0, 4) || null,
            videoId: item.id,
            thumbnail: item.image?.find(i => i.quality === '500x500')?.url || item.image?.[0]?.url || '',
            source: 'youtube'
        };

        // Validar match exacto si hay criterios
        let matchInfo = { isExact: false, matchScore: 0, details: null };

        if (criteria.track || criteria.artist) {
            matchInfo = validateExactMatch(item, criteria);

            // Si solo queremos exactos y no es exacto, skip
            if (onlyExact && !matchInfo.isExact) {
                continue;
            }

            // Guardar en DB si es exacto
            if (matchInfo.isExact && saveExact) {
                await saveToDatabase(song, matchInfo);
            }
        }

        results.push({
            ...song,
            match: {
                isExact: matchInfo.isExact,
                score: matchInfo.matchScore,
                details: matchInfo.details
            }
        });

        // Limitar resultados
        if (results.length >= limit) break;
    }

    // Ordenar: exactos primero, luego por score
    results.sort((a, b) => {
        if (a.match.isExact && !b.match.isExact) return -1;
        if (!a.match.isExact && b.match.isExact) return 1;
        return b.match.score - a.match.score;
    });

    const exactCount = results.filter(r => r.match.isExact).length;

    console.log(`[search] Found ${results.length} results, ${exactCount} exact matches`);

    return res.status(200).json({
        success: true,
        query,
        criteria,
        totalResults: results.length,
        exactMatches: exactCount,
        results
    });
}

export default allowCors(handler);
