/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧪 FASE 2 TESTS - NORMALIZACIÓN CANÓNICA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Tests obligatorios para verificar FASE 2:
 * 1. "BÉSAME MUCHO" → "besame mucho"
 * 2. "Thunderstruck (Official Video)" → "thunderstruck"
 * 3. "AC/DC" → "ac dc"
 * 4. "Song (Remix)" ≠ "Song (Live)"
 * 5. Canciones con ±3 segundos → mismo durationBucket
 * 6. Distintas versiones → distinto identityKey
 * 
 * Ejecutar con: node src/music/tests/phase2-tests.js
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { normalizeText } from '../normalization/normalize-text.js';
import { cleanTitle } from '../normalization/clean-title.js';
import { buildSongIdentity, calculateDurationBucket, buildIdentityKey, stripGeographicContext } from '../identity/build-identity.js';
import { attachIdentity, getIdentity, runPhase2Normalization, clearIdentities } from '../identity/identity-store.js';
import { createSong } from '../song-model.js';
import { addSong, clearStore } from '../song-store.js';

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

function assertNotEqual(actual, expected, message = '') {
    if (actual === expected) {
        throw new Error(`${message}\n   Values should be different but both are: "${actual}"`);
    }
}

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🧪 FASE 2 TESTS: NORMALIZACIÓN CANÓNICA');
console.log('═══════════════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: "BÉSAME MUCHO" → "besame mucho"
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 1: normalizeText()');

test('Acentos y mayúsculas: "BÉSAME MUCHO" → "besame mucho"', () => {
    const result = normalizeText('BÉSAME MUCHO');
    assertEqual(result, 'besame mucho');
});

test('Acentos mixtos: "Corazón Partío" → "corazon partio"', () => {
    const result = normalizeText('Corazón Partío');
    assertEqual(result, 'corazon partio');
});

test('Ñ: "Niño" → "nino"', () => {
    const result = normalizeText('Niño');
    assertEqual(result, 'nino');
});

test('Leetspeak: "CA7RIEL" → "catriel"', () => {
    const result = normalizeText('CA7RIEL');
    assertEqual(result, 'catriel');
});

test('Leetspeak complejo: "4M3R1C4" → "america"', () => {
    const result = normalizeText('4M3R1C4');
    assertEqual(result, 'america');
});

test('Slash: "AC/DC" → "ac dc"', () => {
    const result = normalizeText('AC/DC');
    assertEqual(result, 'ac dc');
});

test('Ampersand: "Tom & Jerry" → "tom jerry"', () => {
    const result = normalizeText('Tom & Jerry');
    assertEqual(result, 'tom jerry');
});

test('Símbolos: "Hello! World?" → "hello world"', () => {
    const result = normalizeText('Hello! World?');
    assertEqual(result, 'hello world');
});

test('Espacios múltiples: "  Hello    World  " → "hello world"', () => {
    const result = normalizeText('  Hello    World  ');
    assertEqual(result, 'hello world');
});

test('String vacío → ""', () => {
    const result = normalizeText('');
    assertEqual(result, '');
});

test('Null → ""', () => {
    const result = normalizeText(null);
    assertEqual(result, '');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: cleanTitle() - Eliminar ruido editorial
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 2: cleanTitle()');

test('Official Video: "Thunderstruck (Official Video)" → "Thunderstruck"', () => {
    const result = cleanTitle('Thunderstruck (Official Video)');
    assertEqual(result, 'Thunderstruck');
});

test('Official Music Video: "Song (Official Music Video)" → "Song"', () => {
    const result = cleanTitle('Song (Official Music Video)');
    assertEqual(result, 'Song');
});

test('HD marker: "Song [HD]" → "Song"', () => {
    const result = cleanTitle('Song [HD]');
    assertEqual(result, 'Song');
});

test('4K marker: "Song (4K)" → "Song"', () => {
    const result = cleanTitle('Song (4K)');
    assertEqual(result, 'Song');
});

test('Lyrics: "Song (Lyrics)" → "Song"', () => {
    const result = cleanTitle('Song (Lyrics)');
    assertEqual(result, 'Song');
});

test('Video Oficial (Spanish): "Canción (Video Oficial)" → "Canción"', () => {
    const result = cleanTitle('Canción (Video Oficial)');
    assertEqual(result, 'Canción');
});

test('Explicit: "Song (Explicit)" → "Song"', () => {
    const result = cleanTitle('Song (Explicit)');
    assertEqual(result, 'Song');
});

// PRESERVAR versiones
test('PRESERVAR Remix: "Song (Calvin Harris Remix)" → "Song (Calvin Harris Remix)"', () => {
    const result = cleanTitle('Song (Calvin Harris Remix)');
    assertEqual(result, 'Song (Calvin Harris Remix)');
});

test('PRESERVAR Remaster: "Song - Remastered 2023" → "Song - Remastered 2023"', () => {
    const result = cleanTitle('Song - Remastered 2023');
    assertEqual(result, 'Song - Remastered 2023');
});

test('PRESERVAR Live: "Song (Live at Wembley)" → "Song (Live at Wembley)"', () => {
    const result = cleanTitle('Song (Live at Wembley)');
    assertEqual(result, 'Song (Live at Wembley)');
});

test('PRESERVAR Radio Edit: "Song (Radio Edit)" → "Song (Radio Edit)"', () => {
    const result = cleanTitle('Song (Radio Edit)');
    assertEqual(result, 'Song (Radio Edit)');
});

test('PRESERVAR Extended: "Song (Extended Mix)" → "Song (Extended Mix)"', () => {
    const result = cleanTitle('Song (Extended Mix)');
    assertEqual(result, 'Song (Extended Mix)');
});

test('Combinación: "Song (Official Video) [HD]" → "Song"', () => {
    const result = cleanTitle('Song (Official Video) [HD]');
    assertEqual(result, 'Song');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2.5: stripGeographicContext() - Eliminar contexto geográfico
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 2.5: stripGeographicContext()');

test('Live at venue: "Song (Live at Wembley)" → "Song"', () => {
    const result = stripGeographicContext('Song (Live at Wembley)');
    assertEqual(result, 'Song');
});

test('Live from venue: "Song (Live from Madison Square)" → "Song"', () => {
    const result = stripGeographicContext('Song (Live from Madison Square)');
    assertEqual(result, 'Song');
});

test('From album: "Song (from The Album)" → "Song"', () => {
    const result = stripGeographicContext('Song (from The Album)');
    assertEqual(result, 'Song');
});

test('PRESERVAR Remix: "Song (Remix)" → "Song (Remix)"', () => {
    const result = stripGeographicContext('Song (Remix)');
    assertEqual(result, 'Song (Remix)');
});

test('PRESERVAR Remaster: "Song - Remastered 2023" → "Song - Remastered 2023"', () => {
    const result = stripGeographicContext('Song - Remastered 2023');
    assertEqual(result, 'Song - Remastered 2023');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: durationBucket - Múltiplos de 5s con Math.round
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 3: durationBucket (múltiplos de 5s)');

test('Bucket 245: 243s → 245', () => {
    const result = calculateDurationBucket(243);
    assertEqual(result, 245);
});

test('Bucket 245: 247s → 245', () => {
    const result = calculateDurationBucket(247);
    assertEqual(result, 245);
});

test('Bucket 250: 248s → 250', () => {
    const result = calculateDurationBucket(248);
    assertEqual(result, 250);
});

test('Bucket 250: 250s → 250', () => {
    const result = calculateDurationBucket(250);
    assertEqual(result, 250);
});

test('Bucket 250: 252s → 250', () => {
    const result = calculateDurationBucket(252);
    assertEqual(result, 250);
});

test('Bucket 255: 253s → 255', () => {
    const result = calculateDurationBucket(253);
    assertEqual(result, 255);
});

test('Canciones con ±2s → mismo bucket: 248 y 252', () => {
    const bucket1 = calculateDurationBucket(248);
    const bucket2 = calculateDurationBucket(252);
    assertEqual(bucket1, bucket2, '248 y 252 deberían tener el mismo bucket (250)');
});

test('Diferencia de fuentes típica (±2s) → mismo bucket', () => {
    // YouTube: 249s, Deezer: 251s → ambos bucket 250
    const bucket1 = calculateDurationBucket(249);
    const bucket2 = calculateDurationBucket(251);
    assertEqual(bucket1, bucket2, 'Diferencia típica entre fuentes debe dar mismo bucket');
});

test('Duración 0 → bucket 0', () => {
    const result = calculateDurationBucket(0);
    assertEqual(result, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: identityKey - Versiones diferentes
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 4: identityKey versiones');

test('"Song (Remix)" ≠ "Song (Live)" - diferentes identityKey', () => {
    const key1 = buildIdentityKey('song', ['artist'], 'remix', 200);
    const key2 = buildIdentityKey('song', ['artist'], 'live', 200);
    assertNotEqual(key1, key2, 'Remix y Live deben tener identityKey diferente');
});

test('"Song" original ≠ "Song" remaster', () => {
    const key1 = buildIdentityKey('song', ['artist'], 'original', 200);
    const key2 = buildIdentityKey('song', ['artist'], 'remaster', 200);
    assertNotEqual(key1, key2, 'Original y Remaster deben tener identityKey diferente');
});

test('Misma canción, misma versión → mismo identityKey', () => {
    const key1 = buildIdentityKey('thunderstruck', ['ac dc'], 'original', 290);
    const key2 = buildIdentityKey('thunderstruck', ['ac dc'], 'original', 290);
    assertEqual(key1, key2);
});

test('Artistas en diferente orden → mismo identityKey', () => {
    const key1 = buildIdentityKey('song', ['artist1', 'artist2'], 'original', 200);
    const key2 = buildIdentityKey('song', ['artist2', 'artist1'], 'original', 200);
    assertEqual(key1, key2, 'Artistas deben ordenarse para consistencia');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: buildSongIdentity completo
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 5: buildSongIdentity()');

test('Identidad completa de canción', () => {
    const song = createSong({
        id: 'test1',
        title: 'Thunderstruck (Official Video)',
        artistNames: ['AC/DC'],
        duration: 292,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'test1',
        metadata: {}
    });

    const identity = buildSongIdentity(song);

    assertEqual(identity.songId, 'test1');
    assertEqual(identity.titleRaw, 'Thunderstruck (Official Video)');
    assertEqual(identity.titleClean, 'Thunderstruck');
    assertEqual(identity.titleIdentity, 'Thunderstruck');
    assertEqual(identity.titleNormalized, 'thunderstruck');
    assertEqual(identity.artistNormalized[0], 'ac dc');
    assertEqual(identity.versionType, 'original');
    assertEqual(identity.durationBucket, 290);
});

test('Identidad de remix preserva versión', () => {
    const song = createSong({
        id: 'remix1',
        title: 'Blinding Lights (Major Lazer Remix)',
        artistNames: ['The Weeknd'],
        duration: 245,
        versionType: 'remix',
        source: 'youtube',
        sourceId: 'remix1',
        metadata: {}
    });

    const identity = buildSongIdentity(song);

    assertEqual(identity.versionType, 'remix');
    // El título limpio PRESERVA el remix
    assertEqual(identity.titleClean, 'Blinding Lights (Major Lazer Remix)');
});

test('Identidad es inmutable (frozen)', () => {
    const song = createSong({
        id: 'frozen1',
        title: 'Test Song',
        artistNames: ['Artist'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'frozen1',
        metadata: {}
    });

    const identity = buildSongIdentity(song);

    // Intentar modificar debería fallar silenciosamente en strict mode
    // o no tener efecto
    try {
        identity.titleNormalized = 'modified';
    } catch (e) {
        // Expected in strict mode
    }

    assertEqual(identity.titleNormalized, 'test song', 'Identidad no debería ser modificable');
});

test('Artistas vacíos → fallback a "unknown"', () => {
    const song = createSong({
        id: 'empty1',
        title: 'Test Song',
        artistNames: [''],  // String vacío
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'empty1',
        metadata: {}
    });

    const identity = buildSongIdentity(song);

    assertEqual(identity.artistNormalized.length, 1);
    assertEqual(identity.artistNormalized[0], 'unknown');
});

test('Live at venue → titleIdentity sin contexto, versionType intacto', () => {
    const song = createSong({
        id: 'live1',
        title: 'Bohemian Rhapsody (Live at Wembley 1986)',
        artistNames: ['Queen'],
        duration: 360,
        versionType: 'live',
        source: 'youtube',
        sourceId: 'live1',
        metadata: {}
    });

    const identity = buildSongIdentity(song);

    // titleIdentity NO tiene "Live at Wembley"
    assertEqual(identity.titleIdentity, 'Bohemian Rhapsody');
    // versionType SÍ es live
    assertEqual(identity.versionType, 'live');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Pipeline FASE 2
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n📝 GRUPO 6: Pipeline FASE 2');

test('runPhase2Normalization procesa todas las canciones', () => {
    // Limpiar stores
    clearStore();
    clearIdentities();

    // Agregar canciones de prueba
    addSong(createSong({
        id: 'pipeline1',
        title: 'Song 1',
        artistNames: ['Artist 1'],
        duration: 200,
        versionType: 'original',
        source: 'youtube',
        sourceId: 'pipeline1',
        metadata: {}
    }));

    addSong(createSong({
        id: 'pipeline2',
        title: 'Song 2',
        artistNames: ['Artist 2'],
        duration: 250,
        versionType: 'remix',
        source: 'deezer',
        sourceId: '123',
        metadata: {}
    }));

    // Ejecutar FASE 2
    const result = runPhase2Normalization();

    assertEqual(result.total, 2);
    assertEqual(result.withIdentity, 2);

    // Verificar identidades
    const id1 = getIdentity('pipeline1');
    const id2 = getIdentity('pipeline2');

    if (!id1 || !id2) {
        throw new Error('Identidades no encontradas');
    }

    assertNotEqual(id1.identityKey, id2.identityKey, 'Canciones diferentes deben tener identityKey diferente');
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMEN
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`📊 RESULTADOS: ${passed} pasados, ${failed} fallados`);
console.log('═══════════════════════════════════════════════════════════════════════');

if (failed === 0) {
    console.log('✅ FASE 2 TESTS: TODOS PASADOS');
} else {
    console.log('❌ FASE 2 TESTS: HAY FALLOS');
    process.exit(1);
}
