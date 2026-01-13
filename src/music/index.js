/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎵 MUSIC MODULE - ÍNDICE PRINCIPAL
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Punto de entrada del módulo de canciones unificado.
 * 
 * FASE 1: Modelo, Store, Loader
 * FASE 2: Normalización, Identidad
 * FASE 3: Autoridad, Grupos Canónicos, Selección
 * FASE 4: Ranking, Intent, Scoring Final
 * FASE 5: API Búsqueda, Cache, Search Service
 * FASE 6: Persistencia, Redis, Meilisearch, Bootstrap
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 1: MODELO (song-model.js)
// ═══════════════════════════════════════════════════════════════════════════════

import 'dotenv/config';

export {
    createSong,
    validateSong,
    VERSION_TYPES,
    SOURCE_TYPES
} from './song-model.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 1: STORE (song-store.js)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    addSong,
    addSongs,
    getSongById,
    getAllSongs,
    getSongCount,
    hasSong,
    removeSong,
    clearStore,
    getSongsBySource,
    getSongsByVersionType,
    getStoreStats,
    _store
} from './song-store.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 1: LOADER (song-loader.js)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    populateSongStore,
    loadFromYouTube,
    loadFromDeezer,
    transformYouTubeItem,
    transformDeezerTrack
} from './song-loader.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 2: NORMALIZACIÓN (normalization/)
// ═══════════════════════════════════════════════════════════════════════════════

export { normalizeText } from './normalization/normalize-text.js';
export { cleanTitle } from './normalization/clean-title.js';

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN (extraction/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    // Detección de versiones
    detectVersion,
    FORBIDDEN_VERSIONS,
    ALLOWED_VERSIONS,
    // Contenido basura
    isTrashContent,
    // Extracción de artista
    extractArtistName,
    extractArtistInfo,
    extractFeats,
    // Evaluación
    evaluatePrimaryIdentity,
    evaluateMusicalContext,
    evaluateCandidate
} from './extraction/youtube-extractor.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 2: IDENTIDAD (identity/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    buildSongIdentity,
    calculateDurationBucket,
    buildIdentityKey,
    stripGeographicContext
} from './identity/build-identity.js';

export {
    attachIdentity,
    getIdentity,
    hasIdentity,
    getAllIdentities,
    getIdentityCount,
    clearIdentities,
    findByIdentityKey,
    groupByIdentityKey,
    runPhase2Normalization,
    _identityStore
} from './identity/identity-store.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3: GRUPOS CANÓNICOS (authority/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    buildCanonicalGroups,
    getCanonicalGroup,
    getGroupStats
} from './authority/canonical-groups.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3: DETECCIÓN NO OFICIAL (authority/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    detectNonOfficial,
    detectNonOfficialChannel,
    evaluateNonOfficial
} from './authority/detect-non-official.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3: AUTORIDAD DE FUENTE (authority/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    evaluateSourceAuthority,
    compareAuthority
} from './authority/source-authority.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3: SELECCIÓN CANÓNICA (authority/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    selectCanonicalSong,
    selectAllCanonicals
} from './authority/select-canonical.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3: AUTHORITY STORE (authority/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    getAuthority,
    hasAuthority,
    getCanonicalSongId,
    getCanonicalSelection,
    getAlternatives,
    isCanonical,
    isNonOfficial,
    getNonOfficialStatus,
    getCachedGroups,
    getCachedSelections,
    clearAuthorityStores,
    runPhase3Authority,
    // FASE 6: Funciones de rehidratación
    rehydrateAuthority,
    rehydrateNonOfficial,
    rehydrateCanonicalSelection,
    getAuthorityCount,
    getNonOfficialCount,
    getCanonicalSelectionsCount,
    _authorityMap,
    _nonOfficialMap
} from './authority/authority-store.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 4: CONTEXTO DE BÚSQUEDA (ranking/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    buildSearchContext,
    getSearchTokens,
    hasSpecificIntent
} from './ranking/search-context.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 4: MATCHING SCORE (ranking/)
// ═══════════════════════════════════════════════════════════════════════════════

export { computeMatchingScore } from './ranking/matching-score.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 4: INTENT ADJUSTMENT (ranking/)
// ═══════════════════════════════════════════════════════════════════════════════

export { applyIntentAdjustment } from './ranking/intent-adjustment.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 4: AUTHORITY WEIGHT (ranking/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    applyAuthorityWeight,
    calculateAuthorityAdjustment
} from './ranking/authority-weight.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 4: FINAL SCORE (ranking/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    computeFinalScore,
    computeAllFinalScores
} from './ranking/final-score.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 4: RANK RESULTS (ranking/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    rankResults,
    rankAndGroupResults,
    getTopResults
} from './ranking/rank-results.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 5: CACHE (cache/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    generateCacheKey,
    getFromCache,
    setInCache,
    clearSearchCache,
    getCacheStats,
    resetCacheStats,
    hasInCache,
    pruneExpiredEntries
} from './cache/search-cache.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 5: SEARCH SERVICE (api/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    searchSongs,
    validateQuery
} from './api/search-service.js';

// ═══════════════════════════════════════════════════════════════════════════════
// EXPERIMENTAL: SUGGESTIONS (api/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    getSearchSuggestions,
    getArtistSuggestions
} from './api/suggestions.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 6: PERSISTENCE (persistence/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    initDB,
    closeDB,
    isDBEnabled,
    query as dbQuery,
    getClient as dbGetClient
} from './persistence/db.js';

export {
    upsertSong,
    upsertSongs,
    getSongById as dbGetSongById,
    getSongsByIds as dbGetSongsByIds,
    getAllSongsPaged,
    countSongs,
    upsertSongIdentity,
    getSongIdentity,
    upsertSongAuthority,
    getSongAuthority,
    upsertCanonicalSelection,
    getCanonicalSelectionByKey,
    // FASE 6 HARDENING
    getAllCanonicalSelectionsPaged,
    countCanonicalSelections,
    // CLI helper
    persistSong
} from './persistence/song-repository.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 6: SEARCH INDEX (search-index/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    initMeili,
    closeMeili,
    isMeiliEnabled,
    getSongsIndex,
    SONGS_INDEX_NAME
} from './search-index/meili-client.js';

export {
    indexSong,
    indexSongsBatch,
    deleteSongFromIndex,
    clearIndex,
    getIndexStats,
    buildSongDocument
} from './search-index/indexer.js';

export {
    getCandidateSongIds,
    searchCandidatesByQuery,
    isCandidateRetrieverAvailable
} from './search-index/candidate-retriever.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 6: REDIS CACHE (cache/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    initRedis,
    closeRedis,
    isRedisEnabled,
    redisGet,
    redisSet,
    redisDel,
    redisClearSearchCache,
    redisStats,
    redisResetStats
} from './cache/redis-cache.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 6: BOOTSTRAP (bootstrap/)
// ═══════════════════════════════════════════════════════════════════════════════

export {
    rebuildStoresFromDB,
    verifyRebuild
} from './bootstrap/rebuild-from-db.js';

export {
    rebuildMeiliIndex,
    verifyIndex
} from './bootstrap/rebuild-index.js';
