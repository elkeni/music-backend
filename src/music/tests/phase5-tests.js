/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧪 FASE 5 TESTS - API DE BÚSQUEDA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Tests obligatorios:
 * 1. Cache hit vs miss
 * 2. grouped=true devuelve canonical + alternatives
 * 3. grouped=false devuelve ranking plano
 * 4. limit y offset funcionan
 * 5. debug=true incluye breakdown
 * 6. Queries cortas son rechazadas
 * 
 * NOTA: searchSongs es async en FASE 6
 * 
 * Ejecutar con: node src/music/tests/phase5-tests.js
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createSong } from '../song-model.js';
import { addSong, clearStore } from '../song-store.js';
import { clearIdentities, runPhase2Normalization } from '../identity/identity-store.js';
import { runPhase3Authority, clearAuthorityStores } from '../authority/authority-store.js';
import { searchSongs, validateQuery } from '../api/search-service.js';
import {
    generateCacheKey,
    getFromCache,
    setInCache,
    clearSearchCache,
    getCacheStats,
    resetCacheStats,
    hasInCache
} from '../cache/search-cache.js';

let passed = 0;
let failed = 0;

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
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        failed++;
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

/**
 * Setup: poblar store con datos de prueba
 */
function setupTestData() {
    clearStore();
    clearIdentities();
    clearAuthorityStores();
    clearSearchCache();
    resetCacheStats();

    const songs = [
        // Grupo 1: Bohemian Rhapsody (Deezer + YouTube)
        createSong({
            id: 'dz_bohemian',
            title: 'Bohemian Rhapsody',
            artistNames: ['Queen'],
            album: 'A Night at the Opera',
            releaseDate: '1975-10-31',
            duration: 354,
            versionType: 'original',
            source: 'deezer',
            sourceId: 'dz_bohemian',
            metadata: {}
        }),
        createSong({
            id: 'yt_bohemian',
            title: 'Bohemian Rhapsody',
            artistNames: ['Queen'],
            duration: 355,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'yt_bohemian',
            metadata: { channelTitle: 'Queen Official' }
        }),

        // Grupo 2: Blinding Lights
        createSong({
            id: 'dz_blinding',
            title: 'Blinding Lights',
            artistNames: ['The Weeknd'],
            album: 'After Hours',
            duration: 200,
            versionType: 'original',
            source: 'deezer',
            sourceId: 'dz_blinding',
            metadata: {}
        }),

        // Grupo 3: Shape of You (remix)
        createSong({
            id: 'yt_shape',
            title: 'Shape of You',
            artistNames: ['Ed Sheeran'],
            duration: 234,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'yt_shape',
            metadata: {}
        }),
        createSong({
            id: 'yt_shape_remix',
            title: 'Shape of You (Remix)',
            artistNames: ['Ed Sheeran'],
            duration: 280,
            versionType: 'remix',
            source: 'youtube',
            sourceId: 'yt_shape_remix',
            metadata: {}
        }),

        // Grupo 4: Cover
        createSong({
            id: 'yt_cover',
            title: 'Bohemian Rhapsody (Cover)',
            artistNames: ['Random Fan'],
            duration: 340,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'yt_cover',
            metadata: { channelTitle: 'Fan Covers' }
        })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();
}

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🧪 FASE 5 TESTS: API DE BÚSQUEDA');
console.log('═══════════════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cache
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 1: Cache');

test('generateCacheKey genera keys consistentes', () => {
    const key1 = generateCacheKey('Bohemian Rhapsody', { limit: 20, offset: 0 });
    const key2 = generateCacheKey('Bohemian Rhapsody', { limit: 20, offset: 0 });
    const key3 = generateCacheKey('bohemian rhapsody', { limit: 20, offset: 0 });

    assertEqual(key1, key2, 'Keys iguales para mismas opciones');
    assertEqual(key1, key3, 'Keys iguales para query normalizada');
});

test('Cache miss → null', () => {
    clearSearchCache();
    const result = getFromCache('nonexistent_key');
    assertEqual(result, null);
});

test('Cache set y get funcionan', () => {
    clearSearchCache();
    const testValue = { test: 'data' };
    setInCache('test_key', testValue);

    const retrieved = getFromCache('test_key');
    assertEqual(retrieved.test, 'data');
});

test('hasInCache devuelve true para key existente', () => {
    clearSearchCache();
    setInCache('existing_key', { data: 1 });

    assertTrue(hasInCache('existing_key'));
    assertFalse(hasInCache('nonexistent_key'));
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Validación de query
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 2: validateQuery()');

test('Query válida pasa validación', () => {
    const result = validateQuery('Bohemian');
    assertTrue(result.valid);
});

test('Query corta es rechazada', () => {
    const result = validateQuery('a');
    assertFalse(result.valid);
    assertTrue(result.error.includes('2 characters'));
});

test('Query vacía es rechazada', () => {
    const result = validateQuery('');
    assertFalse(result.valid);
});

test('Query nula es rechazada', () => {
    const result = validateQuery(null);
    assertFalse(result.valid);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: searchSongs con grouped=true (ASYNC)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 3: searchSongs() grouped=true');

await testAsync('grouped=true devuelve resultados agrupados', async () => {
    setupTestData();

    const result = await searchSongs('Bohemian Rhapsody', { grouped: true });

    assertTrue(result.totalSongs > 0, 'Debe haber canciones');
    assertTrue(result.totalGroups !== undefined, 'Debe tener totalGroups');
    assertTrue(Array.isArray(result.results), 'results debe ser array');
    assertEqual(result.meta.pagination.appliesTo, 'groups', 'Paginación debe aplicar a grupos');

    if (result.results.length > 0) {
        const firstGroup = result.results[0];
        assertTrue(firstGroup.identityKey !== undefined, 'Grupo debe tener identityKey');
        assertTrue(firstGroup.canonical !== undefined, 'Grupo debe tener canonical');
        assertTrue(Array.isArray(firstGroup.alternatives), 'Grupo debe tener alternatives');
    }
});

await testAsync('canonical tiene song y score', async () => {
    setupTestData();

    const result = await searchSongs('Bohemian', { grouped: true });
    const firstGroup = result.results[0];

    assertTrue(firstGroup.canonical.song !== undefined, 'canonical debe tener song');
    assertTrue(typeof firstGroup.canonical.score === 'number', 'canonical debe tener score numérico');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: searchSongs con grouped=false
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 4: searchSongs() grouped=false');

await testAsync('grouped=false devuelve ranking plano', async () => {
    setupTestData();

    const result = await searchSongs('Bohemian', { grouped: false });

    assertTrue(result.totalResults > 0);
    assertTrue(result.totalGroups === undefined, 'No debe tener totalGroups');
    assertTrue(result.totalSongs === undefined, 'No debe tener totalSongs en modo plano');
    assertEqual(result.meta.pagination.appliesTo, 'songs', 'Paginación debe aplicar a canciones');

    if (result.results.length > 0) {
        const firstResult = result.results[0];
        assertTrue(firstResult.song !== undefined, 'Resultado debe tener song');
        assertTrue(firstResult.score !== undefined, 'Resultado debe tener score');
        assertTrue(firstResult.rank !== undefined, 'Resultado debe tener rank');
    }
});

await testAsync('Resultados planos están ordenados por rank', async () => {
    setupTestData();

    const result = await searchSongs('Bohemian', { grouped: false });

    for (let i = 1; i < result.results.length; i++) {
        assertTrue(
            result.results[i].rank >= result.results[i - 1].rank,
            'Ranks deben ser ascendentes'
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Limit y Offset
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 5: limit y offset');

await testAsync('limit limita resultados', async () => {
    setupTestData();

    const result = await searchSongs('o', { grouped: false, limit: 2 });

    assertTrue(result.results.length <= 2, 'No debe haber más de 2 resultados');
});

await testAsync('offset salta resultados', async () => {
    setupTestData();

    const result1 = await searchSongs('Bohemian', { grouped: false, limit: 5, offset: 0 });
    const result2 = await searchSongs('Bohemian', { grouped: false, limit: 5, offset: 1 });

    if (result1.results.length > 1 && result2.results.length > 0) {
        assertEqual(
            result2.results[0]?.song?.id,
            result1.results[1]?.song?.id,
            'Offset debe saltar el primer resultado'
        );
    }
});

await testAsync('limit máximo es 50', async () => {
    setupTestData();

    const result = await searchSongs('song', { grouped: false, limit: 100 });

    assertTrue(result.results.length <= 50, 'No debe exceder límite máximo');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Debug mode
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 6: debug mode');

await testAsync('debug=false NO incluye breakdown', async () => {
    setupTestData();

    const result = await searchSongs('Bohemian', { grouped: false, debug: false });

    if (result.results.length > 0) {
        assertFalse(
            result.results[0].breakdown !== undefined,
            'No debe incluir breakdown sin debug'
        );
    }

    assertTrue(result.debug === undefined, 'No debe incluir objeto debug');
});

await testAsync('debug=true incluye breakdown', async () => {
    setupTestData();

    const result = await searchSongs('Bohemian', { grouped: false, debug: true });

    if (result.results.length > 0) {
        assertTrue(
            result.results[0].breakdown !== undefined,
            'Debe incluir breakdown con debug'
        );
    }

    assertTrue(result.debug !== undefined, 'Debe incluir objeto debug');
    assertTrue(result.debug.intent !== undefined, 'Debug debe incluir intent');
});

await testAsync('debug=true NO usa cache', async () => {
    setupTestData();
    clearSearchCache();
    resetCacheStats();

    await searchSongs('Bohemian', { debug: true });
    await searchSongs('Bohemian', { debug: true });

    const stats = getCacheStats();

    assertEqual(stats.hits, 0, 'Debug no debe usar cache');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Cache integration
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 7: Cache integration');

await testAsync('Segunda búsqueda igual es cache hit', async () => {
    setupTestData();
    clearSearchCache();
    resetCacheStats();

    const result1 = await searchSongs('Blinding Lights', { grouped: true });
    assertFalse(result1.meta.cached, 'Primera búsqueda no debe ser cached');

    const result2 = await searchSongs('Blinding Lights', { grouped: true });
    assertTrue(result2.meta.cached, 'Segunda búsqueda debe ser cached');

    const stats = getCacheStats();
    assertTrue(stats.hits >= 1, 'Debe haber al menos 1 cache hit');
});

await testAsync('meta incluye executionTimeMs', async () => {
    setupTestData();
    clearSearchCache();

    const result = await searchSongs('Shape', {});

    assertTrue(result.meta !== undefined, 'Debe tener meta');
    assertTrue(typeof result.meta.executionTimeMs === 'number', 'Debe tener executionTimeMs');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Error handling
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 8: Error handling');

await testAsync('Query corta devuelve error en response', async () => {
    const result = await searchSongs('a', {});

    assertTrue(result.error !== undefined, 'Debe incluir error');
    assertEqual(result.totalResults, 0);
    assertEqual(result.results.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`📊 RESULTADOS: ${passed} pasados, ${failed} fallados`);
console.log('═══════════════════════════════════════════════════════════════════════');

if (failed === 0) {
    console.log('✅ FASE 5 TESTS: TODOS PASADOS');
} else {
    console.log('❌ FASE 5 TESTS: HAY FALLOS');
    process.exit(1);
}
