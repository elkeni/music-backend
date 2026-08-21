import { evaluateCandidate, evaluatePrimaryIdentity } from '../extraction/youtube-extractor.js';
import { calculateStringSimilarity, normalizedLevenshtein } from '../extraction/string-similarity.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.error(`❌ ${name}: ${error.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function evaluate({ targetArtist, targetTitle, targetDuration = 0, candidate }) {
    return evaluateCandidate(candidate, {
        targetArtist,
        targetTitle,
        targetDuration,
        targetAlbum: ''
    });
}

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🧪 MATCHING V2 - REGRESIONES DE FALSOS POSITIVOS Y NEGATIVOS');
console.log('═══════════════════════════════════════════════════════════════════════');

test('Levenshtein tolera un typo pequeño', () => {
    assert(normalizedLevenshtein('culebritica', 'culebritica') === 1, 'acentos ya normalizados deben ser exactos');
    assert(calculateStringSimilarity('culebritica', 'culebritca').score >= 0.84, 'un typo debe conservar score suficiente');
});

test('Acepta artista y título exactos', () => {
    const result = evaluate({
        targetArtist: 'The Weeknd',
        targetTitle: 'Blinding Lights',
        candidate: { name: 'The Weeknd - Blinding Lights', artist: 'The Weeknd', duration: 200 }
    });
    assert(result.passed, result.rejectReason);
});

test('Acepta ruido editorial y de género', () => {
    const result = evaluate({
        targetArtist: 'Daniela Darcourt',
        targetTitle: 'Señor Mentira',
        candidate: { name: 'Daniela Darcourt - Señor Mentira (Salsa Version)', artist: 'Daniela Darcourt', duration: 280 }
    });
    assert(result.passed, result.rejectReason);
    assert(result.details.identity.titleScore === 1, 'el descriptor editorial debe limpiarse');
});

test('Acepta Audio Oficial y año después de separador', () => {
    const result = evaluate({
        targetArtist: 'Armonía 10',
        targetTitle: 'La Duda',
        candidate: { name: 'ARMONIA 10 - LA DUDA | AUDIO OFICIAL 2024', artist: 'Armonía 10', duration: 210 }
    });
    assert(result.passed, result.rejectReason);
});

test('Acepta sufijo de canal oficial', () => {
    const identity = evaluatePrimaryIdentity(
        { name: 'Peaches', artist: 'Justin Bieber - Topic' },
        'Justin Bieber',
        'Peaches'
    );
    assert(identity.passed, JSON.stringify(identity));
    assert(identity.artistScore === 1, 'Topic debe ser ruido de canal');
});

test('Decodifica entidades HTML en artistas colaborativos de Saavn', () => {
    const result = evaluate({
        targetArtist: 'CA7RIEL & Paco Amoroso',
        targetTitle: 'DUMBAI',
        candidate: {
            name: 'DUMBAI',
            artists: { primary: [{ name: 'CA7RIEL &amp; Paco Amoroso' }] },
            duration: 148
        }
    });
    assert(result.passed, result.rejectReason);
    assert(result.details.identity.artistScore === 1, 'la entidad &amp; debe decodificarse');
});

test('Infiere artista del título si falta metadata', () => {
    const result = evaluate({
        targetArtist: 'Adele',
        targetTitle: 'Hello',
        candidate: { name: 'Adele - Hello (Official Video)', artist: '', duration: 295 }
    });
    assert(result.passed, result.rejectReason);
});

test('Tolera un typo real sin relajar el artista', () => {
    const result = evaluate({
        targetArtist: 'Grupo 5',
        targetTitle: 'La Culebritica',
        candidate: { name: 'Grupo 5 - La Culebritka', artist: 'Grupo 5', duration: 240 }
    });
    assert(result.passed, result.rejectReason);
});

test('Acepta live solicitado y limpia el descriptor para identidad', () => {
    const result = evaluate({
        targetArtist: 'Agua Marina',
        targetTitle: 'Tu Traición En Vivo',
        candidate: { name: 'Agua Marina - Tu Traición (Concierto En Vivo)', artist: 'Agua Marina', duration: 300 }
    });
    assert(result.passed, result.rejectReason);
});

test('Bloquea misma artista con canción diferente', () => {
    const result = evaluate({
        targetArtist: 'Adele',
        targetTitle: 'Hello',
        candidate: { name: 'Adele - Easy On Me', artist: 'Adele', duration: 225 }
    });
    assert(!result.passed, 'no debe compensar título incorrecto con artista exacto');
    assert(result.rejectReason.startsWith('same_artist_different_track'), result.rejectReason);
});

test('Bloquea título exacto interpretado por artista diferente', () => {
    const result = evaluate({
        targetArtist: 'Adele',
        targetTitle: 'Hello',
        candidate: { name: 'Hello', artist: 'Lionel Richie', duration: 250 }
    });
    assert(!result.passed, 'no debe compensar artista incorrecto con título exacto');
    assert(result.rejectReason.startsWith('artist_mismatch'), result.rejectReason);
});

test('Bloquea títulos que sólo contienen el título corto', () => {
    const result = evaluate({
        targetArtist: 'The Beatles',
        targetTitle: 'Hello',
        candidate: { name: 'Hello Goodbye', artist: 'The Beatles', duration: 207 }
    });
    assert(!result.passed, 'Hello no debe coincidir con Hello Goodbye');
});

test('Bloquea covers y tributos aunque coincidan título y artista textual', () => {
    const result = evaluate({
        targetArtist: 'Queen',
        targetTitle: 'Bohemian Rhapsody',
        candidate: { name: 'Bohemian Rhapsody (Queen Cover)', artist: 'Tribute Band', duration: 355 }
    });
    assert(!result.passed, 'los covers son versiones prohibidas');
    assert(result.rejectReason.startsWith('forbidden_version'), result.rejectReason);
});

test('Bloquea mixes de varias canciones', () => {
    const result = evaluate({
        targetArtist: 'Corazón Serrano',
        targetTitle: 'Hasta La Raíz',
        candidate: { name: 'Corazón Serrano - Mix Hasta La Raíz / Tomando Cerveza', artist: 'Corazón Serrano', duration: 600 }
    });
    assert(!result.passed, 'un mix multi-track no debe pasar');
    assert(result.rejectReason === 'multi_song_title_detected', result.rejectReason);
});

test('Bloquea versión original cuando se pidió remix', () => {
    const result = evaluate({
        targetArtist: 'Dua Lipa',
        targetTitle: 'Levitating Remix',
        candidate: { name: 'Dua Lipa - Levitating', artist: 'Dua Lipa', duration: 203 }
    });
    assert(!result.passed, 'la intención de remix debe ser obligatoria');
    assert(result.rejectReason === 'version_mismatch:wanted_remix', result.rejectReason);
});

test('Bloquea versión de estudio cuando se pidió live', () => {
    const result = evaluate({
        targetArtist: 'Coldplay',
        targetTitle: 'Yellow Live',
        candidate: { name: 'Coldplay - Yellow', artist: 'Coldplay', duration: 269 }
    });
    assert(!result.passed, 'la intención live debe ser obligatoria');
    assert(result.rejectReason === 'version_mismatch:wanted_live', result.rejectReason);
});

test('Bloquea duración extremadamente incompatible cuando está disponible', () => {
    const result = evaluate({
        targetArtist: 'Daft Punk',
        targetTitle: 'Get Lucky',
        targetDuration: 248,
        candidate: { name: 'Daft Punk - Get Lucky', artist: 'Daft Punk', duration: 900 }
    });
    assert(!result.passed, 'una duración extrema indica álbum/mix incorrecto');
    assert(result.rejectReason.startsWith('duration_mismatch'), result.rejectReason);
});

console.log('═══════════════════════════════════════════════════════════════════════');
console.log(`📊 ${passed} pasados, ${failed} fallados`);

if (failed > 0) process.exitCode = 1;
