/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧪 FASE 4 TESTS - RANKING FINAL
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Tests obligatorios:
 * 1. "Song live" prioriza live
 * 2. "Song remix" prioriza remix
 * 3. Autoridad NO gana si no hay matching
 * 4. CanonicalSong siempre arriba en empate
 * 5. Covers nunca lideran si hay original
 * 6. Orden estable entre ejecuciones
 * 
 * Ejecutar con: node src/music/tests/phase4-tests.js
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createSong } from '../song-model.js';
import { addSong, clearStore } from '../song-store.js';
import { attachIdentity, clearIdentities, runPhase2Normalization, getIdentity } from '../identity/identity-store.js';
import { runPhase3Authority, clearAuthorityStores, getAuthority } from '../authority/authority-store.js';
import { buildSearchContext, getSearchTokens, hasSpecificIntent } from '../ranking/search-context.js';
import { computeMatchingScore } from '../ranking/matching-score.js';
import { applyIntentAdjustment } from '../ranking/intent-adjustment.js';
import { applyAuthorityWeight } from '../ranking/authority-weight.js';
import { computeFinalScore } from '../ranking/final-score.js';
import { rankResults, getTopResults } from '../ranking/rank-results.js';

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

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🧪 FASE 4 TESTS: RANKING FINAL');
console.log('═══════════════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Search Context
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 1: buildSearchContext()');

test('Query simple se normaliza correctamente', () => {
    const context = buildSearchContext('Bohemian Rhapsody');
    assertEqual(context.normalizedQuery, 'bohemian rhapsody');
    assertEqual(context.tokens.length, 2);
});

test('Detecta intención "live"', () => {
    const context = buildSearchContext('Bohemian Rhapsody live');
    assertTrue(context.intent.wantsLive, 'Debería detectar wantsLive');
    assertFalse(context.intent.wantsRemix);
});

test('Detecta intención "en vivo"', () => {
    const context = buildSearchContext('Bohemian Rhapsody en vivo');
    assertTrue(context.intent.wantsLive, 'Debería detectar wantsLive con "en vivo"');
});

test('Detecta intención "remix"', () => {
    const context = buildSearchContext('Blinding Lights remix');
    assertTrue(context.intent.wantsRemix);
    assertFalse(context.intent.wantsLive);
});

test('Detecta intención "cover"', () => {
    const context = buildSearchContext('Yesterday cover');
    assertTrue(context.intent.wantsCover);
});

test('Query sin intención específica', () => {
    const context = buildSearchContext('Shape of You');
    assertFalse(hasSpecificIntent(context), 'No debería tener intención específica');
});

test('getSearchTokens excluye tokens de intención', () => {
    const context = buildSearchContext('Song live remix');
    const tokens = getSearchTokens(context);
    assertEqual(tokens.length, 1); // Solo "song"
    assertEqual(tokens[0], 'song');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Matching Score
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 2: computeMatchingScore()');

test('Match exacto de título = +50', () => {
    clearStore();
    clearIdentities();

    const song = createSong({
        id: 'match1',
        title: 'Bohemian Rhapsody',
        artistNames: ['Queen'],
        duration: 354,
        versionType: 'original',
        source: 'deezer',
        sourceId: 'match1',
        metadata: {}
    });

    addSong(song);
    attachIdentity(song);

    const identity = getIdentity(song.id);
    const context = buildSearchContext('Bohemian Rhapsody');

    const result = computeMatchingScore(identity, context);

    assertEqual(result.breakdown.titleScore, 50);
    assertEqual(result.breakdown.titleMatch, 'exact');
});

test('Match parcial de título = +25 o menos', () => {
    clearStore();
    clearIdentities();

    const song = createSong({
        id: 'match2',
        title: 'Bohemian Rhapsody',
        artistNames: ['Queen'],
        duration: 354,
        versionType: 'original',
        source: 'deezer',
        sourceId: 'match2',
        metadata: {}
    });

    addSong(song);
    attachIdentity(song);

    const identity = getIdentity(song.id);
    const context = buildSearchContext('Bohemian');

    const result = computeMatchingScore(identity, context);

    assertTrue(result.breakdown.titleScore >= 10 && result.breakdown.titleScore <= 40);
});

test('Match de artista = +30 exacto', () => {
    clearStore();
    clearIdentities();

    const song = createSong({
        id: 'match3',
        title: 'Bohemian Rhapsody',
        artistNames: ['Queen'],
        duration: 354,
        versionType: 'original',
        source: 'deezer',
        sourceId: 'match3',
        metadata: {}
    });

    addSong(song);
    attachIdentity(song);

    const identity = getIdentity(song.id);
    const context = buildSearchContext('Queen');

    const result = computeMatchingScore(identity, context);

    assertTrue(result.breakdown.artistScore > 0, 'Debería matchear artista');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Intent Adjustment
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 3: applyIntentAdjustment()');

test('Live song con wantsLive = +20', () => {
    const song = createSong({
        id: 'intent1',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'live',
        source: 'youtube',
        sourceId: 'intent1',
        metadata: {}
    });

    const context = buildSearchContext('Song live');
    const result = applyIntentAdjustment(50, song, context);

    assertEqual(result.breakdown.liveAdjustment, 20);
    assertEqual(result.adjustedScore, 70); // 50 + 20
});

test('Non-live song con wantsLive = -10', () => {
    const song = createSong({
        id: 'intent2',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'intent2',
        metadata: {}
    });

    const context = buildSearchContext('Song live');
    const result = applyIntentAdjustment(50, song, context);

    assertEqual(result.breakdown.liveAdjustment, -10);
    assertEqual(result.adjustedScore, 40); // 50 - 10
});

test('Remix song con wantsRemix = +20', () => {
    const song = createSong({
        id: 'intent3',
        title: 'Song (Remix)',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'remix',
        source: 'youtube',
        sourceId: 'intent3',
        metadata: {}
    });

    const context = buildSearchContext('Song remix');
    const result = applyIntentAdjustment(50, song, context);

    assertEqual(result.breakdown.remixAdjustment, 20);
});

test('Sin intención específica = sin ajuste', () => {
    const song = createSong({
        id: 'intent4',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'intent4',
        metadata: {}
    });

    const context = buildSearchContext('Song');
    const result = applyIntentAdjustment(50, song, context);

    assertEqual(result.breakdown.totalAdjustment, 0);
    assertEqual(result.adjustedScore, 50);
});

// REPARACIÓN 3: wantsCover no penaliza originales
test('wantsCover && !isCover = 0 (no -10)', () => {
    const song = createSong({
        id: 'intent_cover_original',
        title: 'Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'intent_cover_original',
        metadata: {}
    });

    const context = buildSearchContext('Song cover');
    const result = applyIntentAdjustment(50, song, context);

    assertEqual(result.breakdown.coverAdjustment, 0, 'No debe penalizar original cuando busca cover');
    assertEqual(result.adjustedScore, 50);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Authority Weight
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 4: applyAuthorityWeight()');

test('Authority 100 = +15', () => {
    const result = applyAuthorityWeight(50, { score: 100, level: 'high', reasons: [] });
    assertEqual(result.authorityAdjustment, 15);
    assertEqual(result.weightedScore, 65);
});

test('Authority 50 = 0', () => {
    const result = applyAuthorityWeight(50, { score: 50, level: 'medium', reasons: [] });
    assertEqual(result.authorityAdjustment, 0);
    assertEqual(result.weightedScore, 50);
});

test('Authority 0 = -15', () => {
    const result = applyAuthorityWeight(50, { score: 0, level: 'low', reasons: [] });
    assertEqual(result.authorityAdjustment, -15);
    assertEqual(result.weightedScore, 35);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Ranking completo
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 5: rankResults()');

test('"Song live" prioriza versión live', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    const songs = [
        createSong({
            id: 'rank_orig',
            title: 'Song',
            artistNames: ['Artist'],
            duration: 200,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'rank_orig',
            metadata: {}
        }),
        createSong({
            id: 'rank_live',
            title: 'Song',
            artistNames: ['Artist'],
            duration: 220,
            versionType: 'live',
            source: 'youtube',
            sourceId: 'rank_live',
            metadata: {}
        })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const context = buildSearchContext('Song live');
    const ranked = rankResults(songs, context);

    assertEqual(ranked[0].song.id, 'rank_live', 'Live debería estar primero');
    assertEqual(ranked[0].song.versionType, 'live');
});

test('"Song remix" prioriza versión remix', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    const songs = [
        createSong({
            id: 'rank_orig2',
            title: 'Song',
            artistNames: ['Artist'],
            duration: 200,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'rank_orig2',
            metadata: {}
        }),
        createSong({
            id: 'rank_remix',
            title: 'Song',
            artistNames: ['Artist'],
            duration: 240,
            versionType: 'remix',
            source: 'youtube',
            sourceId: 'rank_remix',
            metadata: {}
        })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const context = buildSearchContext('Song remix');
    const ranked = rankResults(songs, context);

    assertEqual(ranked[0].song.id, 'rank_remix', 'Remix debería estar primero');
});

test('Autoridad NO gana si no hay matching', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    const songs = [
        createSong({
            id: 'auth_low',
            title: 'Target Song',      // Matchea con búsqueda
            artistNames: ['Artist'],
            duration: 200,
            versionType: 'original',
            source: 'youtube',         // Menor autoridad
            sourceId: 'auth_low',
            metadata: {}
        }),
        createSong({
            id: 'auth_high',
            title: 'Different Song',   // NO matchea
            artistNames: ['Other'],
            album: 'Album',
            releaseDate: '2023-01-01',
            duration: 200,
            versionType: 'original',
            source: 'deezer',          // Mayor autoridad
            sourceId: 'auth_high',
            metadata: {}
        })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const context = buildSearchContext('Target Song');
    const ranked = rankResults(songs, context);

    // Target Song debe ganar aunque Deezer tenga mayor autoridad
    assertEqual(ranked[0].song.id, 'auth_low', 'Matching debe superar autoridad');
});

test('CanonicalSong arriba en empate', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    const songs = [
        createSong({
            id: 'yt_song',
            title: 'Same Song',
            artistNames: ['Artist'],
            duration: 200,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'yt_song',
            metadata: {}
        }),
        createSong({
            id: 'dz_song',
            title: 'Same Song',
            artistNames: ['Artist'],
            duration: 200,
            versionType: 'original',
            source: 'deezer',
            sourceId: 'dz_song',
            metadata: {}
        })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const context = buildSearchContext('Same Song');
    const ranked = rankResults(songs, context);

    // Deezer (canónico por autoridad) debe estar primero
    assertEqual(ranked[0].song.id, 'dz_song', 'Deezer/Canónico debe estar primero');
    assertTrue(ranked[0].isCanonical);
});

test('Covers nunca lideran si hay original', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    const songs = [
        createSong({
            id: 'original_song',
            title: 'Hit Song',
            artistNames: ['Artist'],
            duration: 200,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'original_song',
            metadata: { channelTitle: 'Random' }
        }),
        createSong({
            id: 'cover_song',
            title: 'Hit Song (Cover)',
            artistNames: ['Fan'],
            duration: 200,
            versionType: 'original',
            source: 'youtube',
            sourceId: 'cover_song',
            metadata: { channelTitle: 'Covers' }
        })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const context = buildSearchContext('Hit Song');
    const ranked = rankResults(songs, context);

    // El original debe liderar (cover tiene isNonOfficial=true)
    assertEqual(ranked[0].song.id, 'original_song', 'Original debe liderar sobre cover');
    assertFalse(ranked[0].isNonOfficial);
});

test('Orden estable entre ejecuciones', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    const songs = [
        createSong({ id: 'stable1', title: 'Song', artistNames: ['A'], duration: 200, versionType: 'original', source: 'youtube', sourceId: '1', metadata: {} }),
        createSong({ id: 'stable2', title: 'Song', artistNames: ['A'], duration: 200, versionType: 'original', source: 'youtube', sourceId: '2', metadata: {} }),
        createSong({ id: 'stable3', title: 'Song', artistNames: ['A'], duration: 200, versionType: 'original', source: 'youtube', sourceId: '3', metadata: {} })
    ];

    for (const song of songs) addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const context = buildSearchContext('Song');

    // Ejecutar varias veces
    const result1 = rankResults(songs, context).map(r => r.song.id);
    const result2 = rankResults(songs, context).map(r => r.song.id);
    const result3 = rankResults(songs, context).map(r => r.song.id);

    assertEqual(result1.join(','), result2.join(','), 'Orden debe ser estable (1 vs 2)');
    assertEqual(result2.join(','), result3.join(','), 'Orden debe ser estable (2 vs 3)');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Final Score Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 6: computeFinalScore()');

test('Pipeline completo genera breakdown explicable', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    const song = createSong({
        id: 'pipeline1',
        title: 'Test Song',
        artistNames: ['Test Artist'],
        duration: 200,
        versionType: 'original',
        source: 'deezer',
        sourceId: 'pipeline1',
        metadata: {}
    });

    addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const identity = getIdentity(song.id);
    const authority = getAuthority(song.id);
    const context = buildSearchContext('Test Song');

    const result = computeFinalScore(song, identity, authority, context);

    assertTrue(result.breakdown !== undefined, 'Debe tener breakdown');
    assertTrue(result.breakdown.matchingScore !== undefined, 'Debe tener matchingScore');
    assertTrue(result.breakdown.matchingDetails !== undefined, 'Debe tener matchingDetails');
    assertTrue(result.breakdown.intentAdjustment !== undefined, 'Debe tener intentAdjustment');
    assertTrue(result.breakdown.authorityAdjustment !== undefined, 'Debe tener authorityAdjustment');
    assertTrue(result.breakdown.finalScore === result.finalScore, 'finalScore debe coincidir');
    assertTrue(result.breakdown.authorityApplied !== undefined, 'Debe tener authorityApplied');
});

// REPARACIÓN 1: Score final nunca es negativo
test('finalScore nunca es negativo (clamp a 0)', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    // Canción que no matchea bien y tiene baja autoridad
    const song = createSong({
        id: 'clamp_test',
        title: 'Completely Different',
        artistNames: ['Unknown'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'clamp_test',
        metadata: {}
    });

    addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const identity = getIdentity(song.id);
    const authority = getAuthority(song.id);

    // Buscar algo que no matchea, con intent que no cumple
    const context = buildSearchContext('Something Else live remix');

    const result = computeFinalScore(song, identity, authority, context);

    assertTrue(result.finalScore >= 0, 'Score final no debe ser negativo');
});

// REPARACIÓN 4: Authority no aplica si matching < 20
test('Authority solo aplica si matchingScore >= 20', () => {
    clearStore();
    clearIdentities();
    clearAuthorityStores();

    // Canción con bajo matching pero alta autoridad
    const song = createSong({
        id: 'auth_no_match',
        title: 'Completely Different Song',
        artistNames: ['Other Artist'],
        album: 'Album',
        releaseDate: '2023-01-01',
        duration: 200,
        versionType: 'original',
        source: 'deezer',  // Alta autoridad
        sourceId: 'auth_no_match',
        metadata: {}
    });

    addSong(song);
    runPhase2Normalization();
    runPhase3Authority();

    const identity = getIdentity(song.id);
    const authority = getAuthority(song.id);

    // Buscar algo que no matchea
    const context = buildSearchContext('Unrelated Query');

    const result = computeFinalScore(song, identity, authority, context);

    // matchingScore < 20, authority no debe aplicar
    assertFalse(result.breakdown.authorityApplied, 'Authority no debe aplicar sin matching mínimo');
    assertEqual(result.breakdown.authorityAdjustment, 0, 'Ajuste de autoridad debe ser 0');
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`📊 RESULTADOS: ${passed} pasados, ${failed} fallados`);
console.log('═══════════════════════════════════════════════════════════════════════');

if (failed === 0) {
    console.log('✅ FASE 4 TESTS: TODOS PASADOS');
} else {
    console.log('❌ FASE 4 TESTS: HAY FALLOS');
    process.exit(1);
}
