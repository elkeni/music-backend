/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧪 FASE 3 TESTS - AUTORIDAD Y SELECCIÓN CANÓNICA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Tests obligatorios:
 * 1. Cover ≠ original (misma identityKey)
 * 2. Deezer siempre gana contra YouTube
 * 3. YouTube Topic > YouTube random
 * 4. Live no oficial ≠ Live oficial
 * 5. CanonicalGroup nunca mezcla versiones
 * 6. canonicalSong ∈ group
 * 7. Covers NO pueden ser canónicos si hay alternativa oficial
 * 
 * Ejecutar con: node src/music/tests/phase3-tests.js
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createSong } from '../song-model.js';
import { addSong, clearStore, getAllSongs } from '../song-store.js';
import { buildSongIdentity } from '../identity/build-identity.js';
import { attachIdentity, clearIdentities, runPhase2Normalization } from '../identity/identity-store.js';
import { detectNonOfficial, evaluateNonOfficial } from '../authority/detect-non-official.js';
import { evaluateSourceAuthority, compareAuthority } from '../authority/source-authority.js';
import { buildCanonicalGroups } from '../authority/canonical-groups.js';
import { selectCanonicalSong } from '../authority/select-canonical.js';
import {
    runPhase3Authority,
    getAuthority,
    getCanonicalSongId,
    getCanonicalSelection,
    isCanonical,
    getNonOfficialStatus,
    clearAuthorityStores,
    getCachedSelections
} from '../authority/authority-store.js';

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
 * Helper: Construir maps de autoridad y no oficial para un conjunto de canciones
 */
function buildTestMaps(songs) {
    const authorityMap = new Map();
    const nonOfficialMap = new Map();

    for (const song of songs) {
        authorityMap.set(song.id, evaluateSourceAuthority(song));
        nonOfficialMap.set(song.id, evaluateNonOfficial(song));
    }

    return { authorityMap, nonOfficialMap };
}

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🧪 FASE 3 TESTS: AUTORIDAD Y SELECCIÓN CANÓNICA');
console.log('═══════════════════════════════════════════════════════════════════════');

// Limpiar stores antes de tests
clearStore();
clearIdentities();
clearAuthorityStores();

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Detección de covers y contenido no oficial
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 1: detectNonOfficial()');

test('Cover detectado: "Song (Cover)"', () => {
    const song = createSong({
        id: 'cover1',
        title: 'Bohemian Rhapsody (Cover)',
        artistNames: ['Random Fan'],
        duration: 350,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'cover1',
        metadata: {}
    });

    const result = detectNonOfficial(song);
    assertTrue(result.isNonOfficial, 'Debería detectar cover');
    assertEqual(result.reason, 'cover');
});

test('Karaoke detectado: "Song - Karaoke Version"', () => {
    const song = createSong({
        id: 'karaoke1',
        title: 'Song - Karaoke Version',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'karaoke1',
        metadata: {}
    });

    const result = detectNonOfficial(song);
    assertTrue(result.isNonOfficial);
    assertEqual(result.reason, 'karaoke');
});

test('Nightcore detectado: "Song (Nightcore)"', () => {
    const song = createSong({
        id: 'nightcore1',
        title: 'Song (Nightcore)',
        artistNames: ['Artist'],
        duration: 180,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'nightcore1',
        metadata: {}
    });

    const result = detectNonOfficial(song);
    assertTrue(result.isNonOfficial);
    assertEqual(result.reason, 'nightcore');
});

test('8D Audio detectado: "Song - 8D Audio"', () => {
    const song = createSong({
        id: '8d1',
        title: 'Song - 8D Audio',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: '8d1',
        metadata: {}
    });

    const result = detectNonOfficial(song);
    assertTrue(result.isNonOfficial);
    assertEqual(result.reason, '8d_audio');
});

test('Canción original NO marcada como no oficial', () => {
    const song = createSong({
        id: 'original1',
        title: 'Bohemian Rhapsody',
        artistNames: ['Queen'],
        duration: 354,
        versionType: 'original',
        source: 'deezer',
        sourceId: '354',
        metadata: {}
    });

    const result = detectNonOfficial(song);
    assertFalse(result.isNonOfficial, 'No debería marcar original como no oficial');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Autoridad de fuente - Deezer vs YouTube
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 2: evaluateSourceAuthority()');

test('Deezer siempre tiene score >= 90', () => {
    const deezerSong = createSong({
        id: 'dz_1',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'deezer',
        sourceId: '1',
        metadata: {}
    });

    const authority = evaluateSourceAuthority(deezerSong);
    assertTrue(authority.score >= 90, `Deezer score ${authority.score} debe ser >= 90`);
    assertEqual(authority.level, 'high');
});

test('Deezer con album y releaseDate tiene score 100', () => {
    const deezerFull = createSong({
        id: 'dz_2',
        title: 'Song',
        artistNames: ['Artist'],
        album: 'Great Album',
        releaseDate: '2023-01-15',
        duration: 200,
        versionType: 'original',
        source: 'deezer',
        sourceId: '2',
        metadata: {}
    });

    const authority = evaluateSourceAuthority(deezerFull);
    assertEqual(authority.score, 100);
});

test('YouTube base score es 70', () => {
    const ytSong = createSong({
        id: 'yt1',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'yt1',
        metadata: { channelTitle: 'Random Channel' }
    });

    const authority = evaluateSourceAuthority(ytSong);
    assertEqual(authority.score, 70);
    assertEqual(authority.level, 'medium');
});

test('YouTube Topic channel tiene +10 bonus', () => {
    const ytTopic = createSong({
        id: 'yt_topic',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'yt_topic',
        metadata: { channelTitle: 'Artist - Topic' }
    });

    const authority = evaluateSourceAuthority(ytTopic);
    assertEqual(authority.score, 80);
    assertEqual(authority.level, 'high');
});

test('YouTube Official/VEVO tiene +10 bonus', () => {
    const ytOfficial = createSong({
        id: 'yt_vevo',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'yt_vevo',
        metadata: { channelTitle: 'ArtistVEVO' }
    });

    const authority = evaluateSourceAuthority(ytOfficial);
    assertEqual(authority.score, 80);
});

test('YouTube cover tiene penalización -20', () => {
    const ytCover = createSong({
        id: 'yt_cover',
        title: 'Song (Cover)',
        artistNames: ['Fan'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'yt_cover',
        metadata: { channelTitle: 'Random' }
    });

    const authority = evaluateSourceAuthority(ytCover);
    assertEqual(authority.score, 50); // 70 - 20
    assertEqual(authority.level, 'low');
});

test('YouTube mínimo score es 30', () => {
    const ytBad = createSong({
        id: 'yt_bad',
        title: 'Song (Cover)',
        artistNames: ['Fan'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'yt_bad',
        metadata: { channelTitle: 'Fan Covers Channel' }
    });

    const authority = evaluateSourceAuthority(ytBad);
    assertTrue(authority.score >= 30, 'Score no debe bajar de 30');
});

test('Deezer > YouTube en autoridad', () => {
    const deezerSong = createSong({
        id: 'dz_cmp',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'deezer',
        sourceId: 'dz_cmp',
        metadata: {}
    });

    const ytSong = createSong({
        id: 'yt_cmp',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'yt_cmp',
        metadata: { channelTitle: 'ArtistVEVO' }
    });

    const dzAuth = evaluateSourceAuthority(deezerSong);
    const ytAuth = evaluateSourceAuthority(ytSong);

    assertTrue(dzAuth.score > ytAuth.score, 'Deezer debe tener mayor score que YouTube');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Grupos canónicos
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 3: buildCanonicalGroups()');

test('Canciones con mismo identityKey se agrupan', () => {
    clearStore();
    clearIdentities();

    // Dos canciones "iguales" de diferentes fuentes
    const song1 = createSong({
        id: 'grp_dz',
        title: 'Test Song',
        artistNames: ['Test Artist'],
        duration: 200,
        versionType: 'original',
        source: 'deezer',
        sourceId: 'grp_dz',
        metadata: {}
    });

    const song2 = createSong({
        id: 'grp_yt',
        title: 'Test Song',
        artistNames: ['Test Artist'],
        duration: 200, // Mismo bucket
        versionType: 'original',
        source: 'youtube',
        sourceId: 'grp_yt',
        metadata: {}
    });

    addSong(song1);
    addSong(song2);
    attachIdentity(song1);
    attachIdentity(song2);

    const groups = buildCanonicalGroups();

    // Deberían estar en el mismo grupo
    let foundGroup = null;
    for (const group of groups.values()) {
        if (group.songs.length === 2) {
            foundGroup = group;
            break;
        }
    }

    assertTrue(foundGroup !== null, 'Debería haber un grupo con 2 canciones');
    assertEqual(foundGroup.songs.length, 2);
});

test('Versiones diferentes NO se mezclan (remix vs original)', () => {
    clearStore();
    clearIdentities();

    const original = createSong({
        id: 'ver_orig',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'ver_orig',
        metadata: {}
    });

    const remix = createSong({
        id: 'ver_remix',
        title: 'Song (Remix)',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'remix',
        source: 'youtube',
        sourceId: 'ver_remix',
        metadata: {}
    });

    addSong(original);
    addSong(remix);
    attachIdentity(original);
    attachIdentity(remix);

    const groups = buildCanonicalGroups();

    // Cada versión debe estar en su propio grupo
    assertEqual(groups.size, 2, 'Original y Remix deben estar en grupos separados');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Selección canónica (con authorityMap pre-calculado)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 4: selectCanonicalSong()');

test('Deezer gana contra YouTube en grupo', () => {
    clearStore();
    clearIdentities();

    const dz = createSong({
        id: 'sel_dz',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'deezer',
        sourceId: 'sel_dz',
        metadata: {}
    });

    const yt = createSong({
        id: 'sel_yt',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'sel_yt',
        metadata: { channelTitle: 'Random' }
    });

    addSong(dz);
    addSong(yt);
    attachIdentity(dz);
    attachIdentity(yt);

    const groups = buildCanonicalGroups();
    const group = Array.from(groups.values())[0];

    // REPARACIÓN: Pasar maps pre-calculados
    const { authorityMap, nonOfficialMap } = buildTestMaps(group.songs);
    const selection = selectCanonicalSong(group, authorityMap, nonOfficialMap);

    assertEqual(selection.canonicalSong.id, 'sel_dz', 'Deezer debe ser canónico');
    assertEqual(selection.alternatives.length, 1);
    assertEqual(selection.alternatives[0].id, 'sel_yt');
});

test('canonicalSong pertenece al grupo', () => {
    clearStore();
    clearIdentities();

    const song = createSong({
        id: 'belong1',
        title: 'Solo Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'belong1',
        metadata: {}
    });

    addSong(song);
    attachIdentity(song);

    const groups = buildCanonicalGroups();
    const group = Array.from(groups.values())[0];

    // REPARACIÓN: Pasar maps pre-calculados
    const { authorityMap, nonOfficialMap } = buildTestMaps(group.songs);
    const selection = selectCanonicalSong(group, authorityMap, nonOfficialMap);

    assertTrue(
        group.songs.some(s => s.id === selection.canonicalSong.id),
        'canonicalSong debe pertenecer al grupo'
    );
});

test('Cover NO puede ser canónico si hay alternativa oficial', () => {
    clearStore();
    clearIdentities();

    // YouTube oficial (menor score que cover con alto score hipotético)
    const ytOfficial = createSong({
        id: 'off_yt',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'off_yt',
        metadata: { channelTitle: 'Random Channel' } // score 70
    });

    // Cover (tiene score más bajo pero es no oficial)
    const ytCover = createSong({
        id: 'cov_yt',
        title: 'Song (Cover)',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'cov_yt',
        metadata: { channelTitle: 'Random' } // score 50
    });

    addSong(ytOfficial);
    addSong(ytCover);
    attachIdentity(ytOfficial);
    attachIdentity(ytCover);

    const groups = buildCanonicalGroups();
    const group = Array.from(groups.values())[0];

    const { authorityMap, nonOfficialMap } = buildTestMaps(group.songs);
    const selection = selectCanonicalSong(group, authorityMap, nonOfficialMap);

    // El oficial debe ganar aunque el cover existiera
    assertEqual(selection.canonicalSong.id, 'off_yt', 'Oficial debe ser canónico, no el cover');
});

test('Alternatives están ordenados determinísticamente y frozen', () => {
    clearStore();
    clearIdentities();

    const songs = [
        createSong({ id: 'z_song', title: 'Song', artistNames: ['A'], duration: 200, versionType: 'original', source: 'youtube', sourceId: 'z', metadata: {} }),
        createSong({ id: 'a_song', title: 'Song', artistNames: ['A'], duration: 200, versionType: 'original', source: 'youtube', sourceId: 'a', metadata: {} }),
        createSong({ id: 'm_song', title: 'Song', artistNames: ['A'], duration: 200, versionType: 'original', source: 'deezer', sourceId: 'm', metadata: {} }) // Deezer gana
    ];

    for (const song of songs) {
        addSong(song);
        attachIdentity(song);
    }

    const groups = buildCanonicalGroups();
    const group = Array.from(groups.values())[0];

    const { authorityMap, nonOfficialMap } = buildTestMaps(group.songs);
    const selection = selectCanonicalSong(group, authorityMap, nonOfficialMap);

    // Deezer debe ser canónico
    assertEqual(selection.canonicalSong.id, 'm_song');

    // Alternatives deben estar ordenados por ID
    assertEqual(selection.alternatives.length, 2);
    assertEqual(selection.alternatives[0].id, 'a_song');
    assertEqual(selection.alternatives[1].id, 'z_song');

    // Alternatives debe estar frozen
    assertTrue(Object.isFrozen(selection.alternatives), 'Alternatives debe estar frozen');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Pipeline completo FASE 3
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 5: runPhase3Authority()');

test('Pipeline FASE 3 completo', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    // Crear dataset de prueba
    const songs = [
        createSong({
            id: 'pipe_dz1',
            title: 'Hit Song',
            artistNames: ['Famous Artist'],
            album: 'Great Album',
            releaseDate: '2023-01-01',
            duration: 240,
            versionType: 'original',
            source: 'deezer',
            sourceId: 'pipe_dz1',
            metadata: {}
        }),
        createSong({
            id: 'pipe_yt1',
            title: 'Hit Song',
            artistNames: ['Famous Artist'],
            duration: 241,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'pipe_yt1',
            metadata: { channelTitle: 'Famous Artist - Topic' }
        }),
        createSong({
            id: 'pipe_cover',
            title: 'Hit Song (Cover)',
            artistNames: ['Random Fan'],
            duration: 238,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'pipe_cover',
            metadata: { channelTitle: 'Fan Covers' }
        })
    ];

    for (const song of songs) {
        addSong(song);
    }

    // Ejecutar FASE 2
    runPhase2Normalization();

    // Ejecutar FASE 3
    const result = runPhase3Authority();

    assertTrue(result.totalSongs === 3, 'Deben procesarse 3 canciones');
    assertTrue(result.nonOfficialCount >= 1, 'Al menos 1 cover detectado');

    // Verificar autoridad almacenada
    const dzAuth = getAuthority('pipe_dz1');
    assertTrue(dzAuth !== null, 'Deezer debe tener autoridad');
    assertEqual(dzAuth.score, 100);

    // Verificar cover marcado
    const coverStatus = getNonOfficialStatus('pipe_cover');
    assertTrue(coverStatus.isNonOfficial, 'Cover debe estar marcado');
});

test('cachedSelections contiene CanonicalSelection completo', () => {
    // Depende del test anterior
    const selections = getCachedSelections();

    assertTrue(selections !== null, 'cachedSelections debe existir');
    assertTrue(selections.size > 0, 'Debe haber selecciones');

    // Verificar estructura
    for (const [identityKey, selection] of selections) {
        assertTrue(selection.canonicalSong !== undefined, 'Debe tener canonicalSong');
        assertTrue(selection.alternatives !== undefined, 'Debe tener alternatives');
        assertTrue(selection.canonicalAuthority !== undefined, 'Debe tener canonicalAuthority');
        assertTrue(Array.isArray(selection.alternatives), 'alternatives debe ser array');
    }
});

test('getCanonicalSelection retorna objeto completo', () => {
    const selections = getCachedSelections();
    const firstKey = Array.from(selections.keys())[0];

    const selection = getCanonicalSelection(firstKey);

    assertTrue(selection !== null);
    assertTrue(selection.canonicalSong !== undefined);
    assertTrue(selection.canonicalAuthority !== undefined);
    assertTrue(selection.canonicalAuthority.score >= 0);
    assertTrue(Array.isArray(selection.canonicalAuthority.reasons));
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`📊 RESULTADOS: ${passed} pasados, ${failed} fallados`);
console.log('═══════════════════════════════════════════════════════════════════════');

if (failed === 0) {
    console.log('✅ FASE 3 TESTS: TODOS PASADOS');
} else {
    console.log('❌ FASE 3 TESTS: HAY FALLOS');
    process.exit(1);
}
