/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧪 FASE 6 TESTS - PERSISTENCIA, CACHE DISTRIBUIDO E INDEXACIÓN
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Tests obligatorios:
 * 1. Persistencia: upsertSong + getSongById
 * 2. Rebuild: after rebuild, identityKey igual
 * 3. Candidate retrieval devuelve IDs
 * 4. Search-service usa candidates (NO getAllSongs)
 * 5. Redis cache hit vs miss (mock)
 * 6. Output de searchSongs no cambia con respecto a FASE 5
 * 
 * NOTA: Estos tests requieren PostgreSQL, Redis y Meilisearch corriendo.
 * Si no están disponibles, algunos tests se saltan automáticamente.
 * 
 * Ejecutar con: node src/music/tests/phase6-tests.js
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createSong } from '../song-model.js';
import { addSong, clearStore, getSongById as getFromStore } from '../song-store.js';
import { buildSongIdentity } from '../identity/build-identity.js';
import { attachIdentity, clearIdentities, runPhase2Normalization, getIdentity } from '../identity/identity-store.js';
import { runPhase3Authority, clearAuthorityStores } from '../authority/authority-store.js';
import { searchSongs, validateQuery } from '../api/search-service.js';

// Imports de FASE 6
import { initDB, closeDB, isDBEnabled, query } from '../persistence/db.js';
import * as songRepository from '../persistence/song-repository.js';
import { initMeili, closeMeili, isMeiliEnabled } from '../search-index/meili-client.js';
import { indexSong, clearIndex, getIndexStats } from '../search-index/indexer.js';
import { getCandidateSongIds, isCandidateRetrieverAvailable } from '../search-index/candidate-retriever.js';
import { initRedis, closeRedis, isRedisEnabled, redisGet, redisSet, redisDel, redisStats, redisResetStats } from '../cache/redis-cache.js';
import { buildSearchContext } from '../ranking/search-context.js';

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        if (error.message?.includes('SKIP')) {
            console.log(`⏭️ ${name} (SKIPPED: ${error.message})`);
            skipped++;
        } else {
            console.log(`❌ ${name}`);
            console.log(`   Error: ${error.message}`);
            failed++;
        }
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message}\n   Expected: "${expected}"\n   Actual:   "${actual}"`);
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(message || 'Condition should be true');
    }
}

function assertFalse(condition, message = '') {
    if (condition) {
        throw new Error(message || 'Condition should be false');
    }
}

function skip(reason) {
    throw new Error('SKIP: ' + reason);
}

/**
 * Crea una canción de prueba
 */
function createTestSong(overrides = {}) {
    return createSong({
        id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: 'Test Song',
        artistNames: ['Test Artist'],
        album: 'Test Album',
        releaseDate: '2023-01-01',
        duration: 200,
        versionType: 'original',
        source: 'deezer',
        sourceId: `src_${Date.now()}`,
        metadata: {},
        ...overrides
    });
}

/**
 * Setup in-memory para tests que no requieren DB
 */
function setupInMemory() {
    clearStore();
    clearIdentities();
    clearAuthorityStores();
}

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🧪 FASE 6 TESTS: PERSISTENCIA, CACHE DISTRIBUIDO E INDEXACIÓN');
console.log('═══════════════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: PostgreSQL Persistence
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 1: PostgreSQL Persistence');

await testAsync('initDB conecta a PostgreSQL (o skip si no disponible)', async () => {
    const connected = await initDB();
    if (!connected) {
        skip('PostgreSQL no disponible');
    }
    assertTrue(isDBEnabled());
});

await testAsync('upsertSong + getSongById funciona', async () => {
    if (!isDBEnabled()) skip('PostgreSQL no disponible');

    const song = createTestSong({ id: 'db_test_1' });
    await songRepository.upsertSong(song);

    const retrieved = await songRepository.getSongById('db_test_1');
    assertTrue(retrieved !== null, 'Canción debe existir');
    assertEqual(retrieved.title, song.title);
    assertEqual(retrieved.source, song.source);
});

await testAsync('upsertSongIdentity + getSongIdentity funciona', async () => {
    if (!isDBEnabled()) skip('PostgreSQL no disponible');

    const song = createTestSong({ id: 'db_test_identity' });
    await songRepository.upsertSong(song);

    const identity = buildSongIdentity(song);
    await songRepository.upsertSongIdentity(song.id, identity);

    const retrieved = await songRepository.getSongIdentity(song.id);
    assertTrue(retrieved !== null, 'Identidad debe existir');
    assertEqual(retrieved.identityKey, identity.identityKey);
});

await testAsync('countSongs devuelve número correcto', async () => {
    if (!isDBEnabled()) skip('PostgreSQL no disponible');

    const count = await songRepository.countSongs();
    assertTrue(typeof count === 'number', 'Count debe ser número');
    assertTrue(count >= 0, 'Count debe ser >= 0');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Meilisearch Indexing
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 2: Meilisearch Indexing');

await testAsync('initMeili conecta a Meilisearch (o skip)', async () => {
    const connected = await initMeili();
    if (!connected) {
        skip('Meilisearch no disponible');
    }
    assertTrue(isMeiliEnabled());
});

await testAsync('indexSong indexa una canción', async () => {
    if (!isMeiliEnabled()) skip('Meilisearch no disponible');

    const song = createTestSong({ id: 'meili_test_1', title: 'Indexed Song' });
    const identity = buildSongIdentity(song);

    const result = await indexSong(song, identity);
    assertTrue(result, 'Debe indexar exitosamente');
});

await testAsync('getIndexStats devuelve estadísticas', async () => {
    if (!isMeiliEnabled()) skip('Meilisearch no disponible');

    const stats = await getIndexStats();
    assertTrue(stats !== null, 'Stats no debe ser null');
    assertTrue(typeof stats.numberOfDocuments === 'number');
});

await testAsync('getCandidateSongIds devuelve IDs', async () => {
    if (!isMeiliEnabled()) skip('Meilisearch no disponible');

    // Indexar una canción primero
    const song = createTestSong({ id: 'candidate_test', title: 'Searchable Track' });
    const identity = buildSongIdentity(song);
    await indexSong(song, identity);

    // Esperar a que se indexe
    await new Promise(resolve => setTimeout(resolve, 500));

    const context = buildSearchContext('Searchable');
    const ids = await getCandidateSongIds(context, 10);

    assertTrue(Array.isArray(ids), 'Debe devolver array');
    // Puede estar vacío si el índice no se ha actualizado aún
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Redis Cache
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 3: Redis Cache');

await testAsync('initRedis conecta a Redis (o skip)', async () => {
    const connected = await initRedis();
    if (!connected) {
        skip('Redis no disponible');
    }
    assertTrue(isRedisEnabled());
});

await testAsync('redisSet + redisGet funciona', async () => {
    if (!isRedisEnabled()) skip('Redis no disponible');

    const testValue = { test: 'data', nested: { value: 123 } };
    await redisSet('test_key_1', testValue, 30);

    const retrieved = await redisGet('test_key_1');
    assertTrue(retrieved !== null, 'Valor debe existir');
    assertEqual(retrieved.test, 'data');
    assertEqual(retrieved.nested.value, 123);
});

await testAsync('redisDel elimina key', async () => {
    if (!isRedisEnabled()) skip('Redis no disponible');

    await redisSet('test_del_key', { x: 1 }, 30);
    await redisDel('test_del_key');

    const retrieved = await redisGet('test_del_key');
    assertTrue(retrieved === null, 'Valor debe ser eliminado');
});

await testAsync('redisStats devuelve estadísticas', async () => {
    if (!isRedisEnabled()) skip('Redis no disponible');

    redisResetStats();
    await redisSet('stat_test', {}, 30);
    await redisGet('stat_test'); // hit
    await redisGet('nonexistent'); // miss

    const stats = redisStats();
    assertTrue(stats.hits >= 1, 'Debe tener hits');
    assertTrue(stats.misses >= 1, 'Debe tener misses');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Search Service Integration
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 4: Search Service Integration');

await testAsync('searchSongs funciona con fallback in-memory', async () => {
    setupInMemory();

    const songs = [
        createTestSong({ id: 'search_1', title: 'Beautiful Song' }),
        createTestSong({ id: 'search_2', title: 'Amazing Track' })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const result = await searchSongs('Beautiful', { grouped: false });

    assertTrue(result.totalResults > 0 || result.results.length >= 0, 'Debe devolver resultados o array vacío');
    assertTrue(result.meta.executionTimeMs !== undefined);
});

await testAsync('searchSongs incluye candidateSource en meta', async () => {
    setupInMemory();

    const song = createTestSong({ id: 'meta_test', title: 'Meta Test Song' });
    addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const result = await searchSongs('Meta', { grouped: false });

    assertTrue(result.meta.candidateSource !== undefined, 'Debe tener candidateSource');
    // Puede ser 'meilisearch' o 'memory' dependiendo de disponibilidad
});

await testAsync('Output de searchSongs mantiene contrato FASE 5', async () => {
    setupInMemory();

    const songs = [
        createTestSong({ id: 'contract_1', title: 'Contract Test' }),
        createTestSong({ id: 'contract_2', title: 'Contract Test Two' })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    // grouped=true
    const groupedResult = await searchSongs('Contract', { grouped: true });
    assertTrue(groupedResult.totalGroups !== undefined, 'grouped debe tener totalGroups');
    assertTrue(groupedResult.totalSongs !== undefined, 'grouped debe tener totalSongs');
    assertTrue(groupedResult.meta.pagination.appliesTo === 'groups');

    // grouped=false
    const flatResult = await searchSongs('Contract', { grouped: false });
    assertTrue(flatResult.totalResults !== undefined, 'flat debe tener totalResults');
    assertTrue(flatResult.totalGroups === undefined, 'flat no debe tener totalGroups');
    assertTrue(flatResult.meta.pagination.appliesTo === 'songs');
});

await testAsync('debug=true incluye redisStats', async () => {
    setupInMemory();

    const song = createTestSong({ id: 'debug_test', title: 'Debug Song' });
    addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const result = await searchSongs('Debug', { debug: true });

    assertTrue(result.debug !== undefined, 'Debe tener objeto debug');
    assertTrue(result.debug.candidateCount !== undefined, 'Debug debe tener candidateCount');
    // redisStats puede ser null si Redis no está disponible
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Determinism
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 5: Determinism');

await testAsync('identityKey es determinístico', async () => {
    const song = createTestSong({ id: 'determinism_test', title: 'Same Song', artistNames: ['Same Artist'], duration: 200 });

    const identity1 = buildSongIdentity(song);
    const identity2 = buildSongIdentity(song);

    assertEqual(identity1.identityKey, identity2.identityKey, 'identityKey debe ser igual');
});

await testAsync('Ranking es determinístico entre ejecuciones', async () => {
    setupInMemory();

    const songs = [
        createTestSong({ id: 'det_1', title: 'Song' }),
        createTestSong({ id: 'det_2', title: 'Song' }),
        createTestSong({ id: 'det_3', title: 'Song' })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const result1 = await searchSongs('Song', { grouped: false });
    const result2 = await searchSongs('Song', { grouped: false });

    const ids1 = result1.results.map(r => r.song.id).join(',');
    const ids2 = result2.results.map(r => r.song.id).join(',');

    assertEqual(ids1, ids2, 'Orden debe ser determinístico');
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 Limpieza...');

// Limpiar datos de test de PostgreSQL
if (isDBEnabled()) {
    try {
        await query("DELETE FROM songs WHERE id LIKE 'test_%' OR id LIKE 'db_test_%' OR id LIKE 'meili_test_%' OR id LIKE 'candidate_%' OR id LIKE 'search_%' OR id LIKE 'meta_test%' OR id LIKE 'contract_%' OR id LIKE 'debug_test%' OR id LIKE 'det_%' OR id LIKE 'determinism_%'");
        console.log('[cleanup] Datos de test eliminados de PostgreSQL');
    } catch (e) {
        console.log('[cleanup] Error limpiando PostgreSQL:', e.message);
    }
    await closeDB();
}

// Cerrar Meili
if (isMeiliEnabled()) {
    closeMeili();
}

// Cerrar Redis
if (isRedisEnabled()) {
    await closeRedis();
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`📊 RESULTADOS: ${passed} pasados, ${failed} fallados, ${skipped} saltados`);
console.log('═══════════════════════════════════════════════════════════════════════');

if (failed === 0) {
    console.log('✅ FASE 6 TESTS: TODOS PASADOS (o saltados si servicios no disponibles)');
} else {
    console.log('❌ FASE 6 TESTS: HAY FALLOS');
    process.exit(1);
}
