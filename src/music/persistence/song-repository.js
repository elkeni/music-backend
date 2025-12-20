/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📦 SONG REPOSITORY - FASE 6: ACCESO A DATOS
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Repository layer para persistencia de Songs y metadatos derivados.
 * Usa queries parametrizadas, sin ORM.
 * 
 * REPARACIÓN FASE 6: Invalida cache en operaciones de escritura.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { query, getClient, isDBEnabled } from './db.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE INVALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Invalida TODO el cache de búsqueda (full clear, no granular)
 * Se llama después de cualquier operación de escritura
 */
async function invalidateSearchCache() {
    try {
        // Invalidar cache in-memory
        const { clearSearchCache } = await import('../cache/search-cache.js');
        clearSearchCache();

        // Invalidar cache Redis si disponible
        try {
            const redisCache = await import('../cache/redis-cache.js');
            if (redisCache.isRedisEnabled()) {
                await redisCache.redisClearSearchCache();
            }
        } catch (e) {
            // Redis no disponible, continuar
        }
    } catch (e) {
        // Ignorar errores de invalidación
        console.warn('[song-repository] Error invalidando cache:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SONGS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inserta o actualiza una canción
 * 
 * @param {import('../song-model.js').Song} song
 * @returns {Promise<void>}
 */
export async function upsertSong(song) {
    const sql = `
        INSERT INTO songs (
            id, title, artist_names, album, release_date, duration,
            version_type, version_details, source, source_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            artist_names = EXCLUDED.artist_names,
            album = EXCLUDED.album,
            release_date = EXCLUDED.release_date,
            duration = EXCLUDED.duration,
            version_type = EXCLUDED.version_type,
            version_details = EXCLUDED.version_details,
            source = EXCLUDED.source,
            source_id = EXCLUDED.source_id,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
    `;

    await query(sql, [
        song.id,
        song.title,
        JSON.stringify(song.artistNames || []),
        song.album || null,
        song.releaseDate || null,
        song.duration,
        song.versionType || 'original',
        song.versionDetails || null,
        song.source,
        song.sourceId,
        JSON.stringify(song.metadata || {})
    ]);

    // REPARACIÓN: Invalidar cache tras escritura
    await invalidateSearchCache();
}

/**
 * Inserta o actualiza múltiples canciones en una transacción
 * 
 * @param {import('../song-model.js').Song[]} songs
 * @returns {Promise<number>} - Número de canciones procesadas
 */
export async function upsertSongs(songs) {
    if (!songs || songs.length === 0) return 0;

    const client = await getClient();
    try {
        await client.query('BEGIN');

        for (const song of songs) {
            const sql = `
                INSERT INTO songs (
                    id, title, artist_names, album, release_date, duration,
                    version_type, version_details, source, source_id, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    artist_names = EXCLUDED.artist_names,
                    album = EXCLUDED.album,
                    release_date = EXCLUDED.release_date,
                    duration = EXCLUDED.duration,
                    version_type = EXCLUDED.version_type,
                    version_details = EXCLUDED.version_details,
                    source = EXCLUDED.source,
                    source_id = EXCLUDED.source_id,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
            `;

            await client.query(sql, [
                song.id,
                song.title,
                JSON.stringify(song.artistNames || []),
                song.album || null,
                song.releaseDate || null,
                song.duration,
                song.versionType || 'original',
                song.versionDetails || null,
                song.source,
                song.sourceId,
                JSON.stringify(song.metadata || {})
            ]);
        }

        await client.query('COMMIT');

        // REPARACIÓN: Invalidar cache tras escritura batch
        await invalidateSearchCache();

        return songs.length;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Obtiene una canción por ID
 * 
 * @param {string} id
 * @returns {Promise<import('../song-model.js').Song | null>}
 */
export async function getSongById(id) {
    const result = await query('SELECT * FROM songs WHERE id = $1', [id]);

    if (result.rows.length === 0) {
        return null;
    }

    return rowToSong(result.rows[0]);
}

/**
 * Obtiene múltiples canciones por IDs
 * 
 * @param {string[]} ids
 * @returns {Promise<import('../song-model.js').Song[]>}
 */
export async function getSongsByIds(ids) {
    if (!ids || ids.length === 0) return [];

    const result = await query(
        'SELECT * FROM songs WHERE id = ANY($1)',
        [ids]
    );

    return result.rows.map(rowToSong);
}

/**
 * Obtiene todas las canciones paginadas
 * 
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<import('../song-model.js').Song[]>}
 */
export async function getAllSongsPaged(limit = 1000, offset = 0) {
    const result = await query(
        'SELECT * FROM songs ORDER BY id LIMIT $1 OFFSET $2',
        [limit, offset]
    );

    return result.rows.map(rowToSong);
}

/**
 * Cuenta el total de canciones
 * 
 * @returns {Promise<number>}
 */
export async function countSongs() {
    const result = await query('SELECT COUNT(*) as count FROM songs');
    return parseInt(result.rows[0].count, 10);
}

/**
 * Elimina una canción por ID
 * 
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteSong(id) {
    const result = await query('DELETE FROM songs WHERE id = $1', [id]);
    return result.rowCount > 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SONG IDENTITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inserta o actualiza la identidad de una canción
 * 
 * @param {string} songId
 * @param {import('../identity/build-identity.js').SongIdentity} identity
 * @returns {Promise<void>}
 */
export async function upsertSongIdentity(songId, identity) {
    const sql = `
        INSERT INTO song_identity (
            song_id, identity_key, title_clean, title_normalized,
            title_identity, artist_normalized, duration_bucket
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (song_id) DO UPDATE SET
            identity_key = EXCLUDED.identity_key,
            title_clean = EXCLUDED.title_clean,
            title_normalized = EXCLUDED.title_normalized,
            title_identity = EXCLUDED.title_identity,
            artist_normalized = EXCLUDED.artist_normalized,
            duration_bucket = EXCLUDED.duration_bucket,
            updated_at = NOW()
    `;

    await query(sql, [
        songId,
        identity.identityKey,
        identity.titleClean,
        identity.titleNormalized,
        identity.titleIdentity || null,
        JSON.stringify(identity.artistNormalized || []),
        identity.durationBucket
    ]);

    // REPARACIÓN: Invalidar cache tras escritura
    await invalidateSearchCache();
}

/**
 * Obtiene la identidad de una canción
 * 
 * @param {string} songId
 * @returns {Promise<import('../identity/build-identity.js').SongIdentity | null>}
 */
export async function getSongIdentity(songId) {
    const result = await query(
        'SELECT * FROM song_identity WHERE song_id = $1',
        [songId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return rowToIdentity(result.rows[0]);
}

/**
 * Obtiene todas las identidades para rebuild
 * 
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Array<{songId: string, identity: SongIdentity}>>}
 */
export async function getAllIdentitiesPaged(limit = 1000, offset = 0) {
    const result = await query(
        'SELECT * FROM song_identity ORDER BY song_id LIMIT $1 OFFSET $2',
        [limit, offset]
    );

    return result.rows.map(row => ({
        songId: row.song_id,
        identity: rowToIdentity(row)
    }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SONG AUTHORITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inserta o actualiza la autoridad de una canción
 * 
 * @param {string} songId
 * @param {import('../authority/source-authority.js').SourceAuthority} authority
 * @param {{ isNonOfficial: boolean, reason?: string }} nonOfficial
 * @returns {Promise<void>}
 */
export async function upsertSongAuthority(songId, authority, nonOfficial) {
    const sql = `
        INSERT INTO song_authority (
            song_id, score, level, reasons, is_non_official, non_official_reason
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (song_id) DO UPDATE SET
            score = EXCLUDED.score,
            level = EXCLUDED.level,
            reasons = EXCLUDED.reasons,
            is_non_official = EXCLUDED.is_non_official,
            non_official_reason = EXCLUDED.non_official_reason,
            updated_at = NOW()
    `;

    await query(sql, [
        songId,
        authority.score,
        authority.level,
        JSON.stringify(authority.reasons || []),
        nonOfficial?.isNonOfficial || false,
        nonOfficial?.reason || null
    ]);

    // REPARACIÓN: Invalidar cache tras escritura
    await invalidateSearchCache();
}

/**
 * Obtiene la autoridad de una canción
 * 
 * @param {string} songId
 * @returns {Promise<{authority: SourceAuthority, nonOfficial: {isNonOfficial: boolean, reason?: string}} | null>}
 */
export async function getSongAuthority(songId) {
    const result = await query(
        'SELECT * FROM song_authority WHERE song_id = $1',
        [songId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const row = result.rows[0];
    return {
        authority: {
            score: row.score,
            level: row.level,
            reasons: row.reasons || []
        },
        nonOfficial: {
            isNonOfficial: row.is_non_official,
            reason: row.non_official_reason
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL SELECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inserta o actualiza una selección canónica
 * 
 * @param {string} identityKey
 * @param {string} canonicalSongId
 * @param {number} authorityScore
 * @param {string[]} alternativeIds
 * @returns {Promise<void>}
 */
export async function upsertCanonicalSelection(identityKey, canonicalSongId, authorityScore, alternativeIds) {
    const sql = `
        INSERT INTO canonical_selections (
            identity_key, canonical_song_id, canonical_authority_score, alternatives
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (identity_key) DO UPDATE SET
            canonical_song_id = EXCLUDED.canonical_song_id,
            canonical_authority_score = EXCLUDED.canonical_authority_score,
            alternatives = EXCLUDED.alternatives,
            updated_at = NOW()
    `;

    await query(sql, [
        identityKey,
        canonicalSongId,
        authorityScore,
        JSON.stringify(alternativeIds || [])
    ]);
}

/**
 * Obtiene una selección canónica por identityKey
 * 
 * @param {string} identityKey
 * @returns {Promise<{canonicalSongId: string, authorityScore: number, alternativeIds: string[]} | null>}
 */
export async function getCanonicalSelectionByKey(identityKey) {
    const result = await query(
        'SELECT * FROM canonical_selections WHERE identity_key = $1',
        [identityKey]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const row = result.rows[0];
    return {
        canonicalSongId: row.canonical_song_id,
        authorityScore: row.canonical_authority_score,
        alternativeIds: row.alternatives || []
    };
}

/**
 * Obtiene todas las selecciones canónicas paginadas (para rebuild)
 * 
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Array<{identityKey: string, canonicalSongId: string, authorityScore: number, alternativeIds: string[]}>>}
 */
export async function getAllCanonicalSelectionsPaged(limit = 1000, offset = 0) {
    const result = await query(
        'SELECT * FROM canonical_selections ORDER BY identity_key LIMIT $1 OFFSET $2',
        [limit, offset]
    );

    return result.rows.map(row => ({
        identityKey: row.identity_key,
        canonicalSongId: row.canonical_song_id,
        authorityScore: row.canonical_authority_score,
        alternativeIds: row.alternatives || []
    }));
}

/**
 * Cuenta el total de selecciones canónicas
 * 
 * @returns {Promise<number>}
 */
export async function countCanonicalSelections() {
    const result = await query('SELECT COUNT(*) as count FROM canonical_selections');
    return parseInt(result.rows[0].count, 10);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convierte una fila de DB a objeto Song
 * 
 * @param {Object} row
 * @returns {import('../song-model.js').Song}
 */
function rowToSong(row) {
    return {
        id: row.id,
        title: row.title,
        artistNames: row.artist_names || [],
        album: row.album,
        releaseDate: row.release_date ? row.release_date.toISOString().split('T')[0] : undefined,
        duration: row.duration,
        versionType: row.version_type,
        versionDetails: row.version_details,
        source: row.source,
        sourceId: row.source_id,
        metadata: row.metadata || {}
    };
}

/**
 * Convierte una fila de DB a objeto SongIdentity
 * 
 * @param {Object} row
 * @returns {import('../identity/build-identity.js').SongIdentity}
 */
function rowToIdentity(row) {
    return {
        titleClean: row.title_clean,
        titleNormalized: row.title_normalized,
        titleIdentity: row.title_identity,
        artistNormalized: row.artist_normalized || [],
        durationBucket: row.duration_bucket,
        identityKey: row.identity_key
    };
}
