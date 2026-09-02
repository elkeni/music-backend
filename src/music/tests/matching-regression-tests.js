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

test('Acepta colaborador acreditado en el título aunque Saavn sólo informe el principal', () => {
    const result = evaluate({
        targetArtist: 'Joji, Clams Casino',
        targetTitle: "CAN'T GET OVER YOU (feat. Clams Casino)",
        candidate: {
            name: "CAN'T GET OVER YOU (feat. Clams Casino)",
            artist: 'Joji',
            duration: 207
        }
    });
    assert(result.passed, result.rejectReason);
    assert(result.details.identity.metrics.artistCredits.componentPassed, 'debe validar el crédito compuesto');
});

test('Bloquea un colaborador diferente aunque coincidan principal y título base', () => {
    const identity = evaluatePrimaryIdentity(
        { name: "CAN'T GET OVER YOU (feat. Thundercat)", artist: 'Joji' },
        'Joji, Clams Casino',
        "CAN'T GET OVER YOU (feat. Clams Casino)"
    );
    assert(!identity.passed, JSON.stringify(identity));
    assert(!identity.metrics.artistCredits.componentPassed, 'no debe inventar el colaborador solicitado');
});

test('Acepta feat secundario informado sólo en el nombre de la canción', () => {
    const result = evaluate({
        targetArtist: 'Roddy Ricch, Gunna',
        targetTitle: 'Start Wit Me (feat. Gunna)',
        candidate: { name: 'Start Wit Me (feat. Gunna)', artist: 'Roddy Ricch', duration: 158 }
    });
    assert(result.passed, result.rejectReason);
});

test('Limpia crédito with del título cuando ya fue validado como artista', () => {
    const result = evaluate({
        targetArtist: 'The Weeknd, Kendrick Lamar',
        targetTitle: 'Pray For Me (with Kendrick Lamar)',
        candidate: { name: 'Pray For Me', artist: 'The Weeknd, Kendrick Lamar', duration: 211 }
    });
    assert(result.passed, result.rejectReason);
    assert(result.details.identity.titleScore === 1, 'with no debe formar parte de la identidad del título');
});

test('Extrae un feat sin paréntesis del nombre completo de YouTube', () => {
    const result = evaluate({
        targetArtist: 'A$AP Rocky, Skepta',
        targetTitle: 'Praise The Lord (Da Shine) (feat. Skepta)',
        candidate: {
            name: 'A$AP Rocky - Praise The Lord (Da Shine) (Lyrics) ft. Skepta',
            artist: 'A$AP Rocky - Topic',
            duration: 205
        }
    });
    assert(result.passed, result.rejectReason);
    assert(result.details.identity.metrics.artistCredits.componentPassed, 'Skepta debe extraerse del sufijo ft.');
});

test('Tolera crédito secundario omitido si principal y título son exactos y no hay contradicción', () => {
    const identity = evaluatePrimaryIdentity(
        { name: 'Tony', artist: 'Larry Nozero - Topic' },
        'Larry Nozero, Dennis Tini',
        'Tony'
    );
    assert(identity.passed, JSON.stringify(identity));
    assert(identity.metrics.artistCredits.implicitCollaboratorsPassed, 'debe reconocer metadata secundaria omitida');
});

test('Tolera un feat omitido por el catálogo si no existe un crédito contradictorio', () => {
    const identity = evaluatePrimaryIdentity(
        { name: "CAN'T GET OVER YOU", artist: 'Joji' },
        'Joji, Clams Casino',
        "CAN'T GET OVER YOU (feat. Clams Casino)"
    );
    assert(identity.passed, JSON.stringify(identity));
    assert(identity.metrics.artistCredits.implicitCollaboratorsPassed, 'ausencia de crédito no debe ser contradicción');
});

test('Valida todos los artistas de una colaboración múltiple sin depender del orden', () => {
    const result = evaluate({
        targetArtist: 'Skrillex, Fatman Scoop, Kill The Noise, Michael Angelakos',
        targetTitle: 'Recess (with Kill The Noise, Fatman Scoop, and Michael Angelakos)',
        candidate: {
            name: 'Recess (with Kill The Noise, Fatman Scoop, and Michael Angelakos)',
            artist: 'Skrillex',
            duration: 237
        }
    });
    assert(result.passed, result.rejectReason);
});

test('Ignora el sufijo editorial de soundtrack y conserva los artistas', () => {
    const identity = evaluatePrimaryIdentity(
        { name: 'Turn Up The Sunshine', artist: 'Diana Ross, Tame Impala' },
        'Diana Ross, Tame Impala',
        "Turn Up The Sunshine - From 'Minions: The Rise of Gru' Soundtrack"
    );
    assert(identity.passed, JSON.stringify(identity));
    assert(identity.titleScore === 1, 'el nombre editorial del soundtrack debe ignorarse');
});

test('Infiere artista del título si falta metadata', () => {
    const result = evaluate({
        targetArtist: 'Adele',
        targetTitle: 'Hello',
        candidate: { name: 'Adele - Hello (Official Video)', artist: '', duration: 295 }
    });
    assert(result.passed, result.rejectReason);
});

test('Infiere artista con colaborador y descarta sufijo de aniversario', () => {
    const result = evaluate({
        targetArtist: 'La Bella Luz',
        targetTitle: 'En Vida',
        candidate: {
            name: 'La Bella Luz Ft. Kevin Pedraza - En Vida - 29 Años',
            artist: 'Canal de respaldo',
            duration: 240
        }
    });
    assert(result.passed, result.rejectReason);
    assert(result.details.identity.titleScore === 1, 'el sufijo 29 Años no pertenece al título');
    assert(result.details.identity.artistScore === 1, 'el colaborador no debe ocultar al artista principal');
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

test('Bloquea live cuando se pidió la canción original', () => {
    const result = evaluate({
        targetArtist: 'Coldplay',
        targetTitle: 'Yellow',
        candidate: { name: 'Coldplay - Yellow (Live)', artist: 'Coldplay', duration: 269 }
    });
    assert(!result.passed, 'un live no debe sustituir silenciosamente al master original');
    assert(result.rejectReason === 'version_mismatch:wanted_original_got_live', result.rejectReason);
});

test('Bloquea remix cuando se pidió la canción original', () => {
    const result = evaluate({
        targetArtist: 'Dua Lipa',
        targetTitle: 'Levitating',
        candidate: { name: 'Dua Lipa - Levitating (DaBaby Remix)', artist: 'Dua Lipa', duration: 203 }
    });
    assert(!result.passed, 'un remix no debe sustituir silenciosamente a la original');
    assert(result.rejectReason === 'version_mismatch:wanted_original_got_remix', result.rejectReason);
});

test('Acepta acústica sólo cuando fue solicitada', () => {
    const accepted = evaluate({
        targetArtist: 'Foo Fighters',
        targetTitle: 'Everlong Acoustic Version',
        candidate: { name: 'Foo Fighters - Everlong (Acoustic)', artist: 'Foo Fighters', duration: 250 }
    });
    assert(accepted.passed, accepted.rejectReason);
    assert(accepted.details.identity.titleScore === 1, 'el descriptor acústico debe separarse de la identidad');

    const rejected = evaluate({
        targetArtist: 'Foo Fighters',
        targetTitle: 'Everlong Acoustic',
        candidate: { name: 'Foo Fighters - Everlong', artist: 'Foo Fighters', duration: 250 }
    });
    assert(!rejected.passed, 'la original no debe sustituir a la acústica solicitada');
    assert(rejected.rejectReason === 'version_mismatch:wanted_acoustic', rejected.rejectReason);
});

test('Acepta instrumental solicitado y lo bloquea para la original', () => {
    const requested = evaluate({
        targetArtist: 'The xx',
        targetTitle: 'Intro Instrumental',
        candidate: { name: 'The xx - Intro (Instrumental)', artist: 'The xx', duration: 130 }
    });
    assert(requested.passed, requested.rejectReason);

    const original = evaluate({
        targetArtist: 'The xx',
        targetTitle: 'Intro',
        candidate: { name: 'The xx - Intro (Instrumental)', artist: 'The xx', duration: 130 }
    });
    assert(!original.passed, 'instrumental no debe reemplazar a la versión original');
});

test('Distingue remixes nombrados de la misma canción', () => {
    const correct = evaluate({
        targetArtist: 'Fred again..',
        targetTitle: 'Beto’s Horns (fred remix)',
        candidate: { name: 'Fred again.. - Beto’s Horns (Fred Remix)', artist: 'Fred again..', duration: 210 }
    });
    assert(correct.passed, correct.rejectReason);

    const wrong = evaluate({
        targetArtist: 'Fred again..',
        targetTitle: 'Beto’s Horns (fred remix)',
        candidate: { name: 'Fred again.. - Beto’s Horns (Club Remix)', artist: 'Fred again..', duration: 210 }
    });
    assert(!wrong.passed, 'un remix nombrado diferente debe rechazarse');
    assert(wrong.rejectReason === 'version_mismatch:remix_identity', wrong.rejectReason);
});

test('Distingue el año de un remaster cuando ambos lo especifican', () => {
    const result = evaluate({
        targetArtist: 'Queen',
        targetTitle: 'Somebody To Love (2011 Remaster)',
        candidate: { name: 'Queen - Somebody To Love (2024 Remastered)', artist: 'Queen', duration: 296 }
    });
    assert(!result.passed, 'años de remaster distintos representan masters distintos');
    assert(result.rejectReason === 'version_mismatch:remaster_year', result.rejectReason);
});

test('Normaliza guion y paréntesis equivalentes en un remaster solicitado', () => {
    const result = evaluate({
        targetArtist: 'Michael Jackson',
        targetTitle: 'Speed Demon - 2012 Remaster',
        candidate: { name: 'Speed Demon (2012 Remaster)', artist: 'Michael Jackson', duration: 254 }
    });
    assert(result.passed, result.rejectReason);
    assert(result.details.identity.titleScore === 1, 'el año del remaster no debe quedar huérfano en identidad');
});

test('Usa master oficial como fallback controlado cuando el catálogo omite el remaster', () => {
    const candidate = {
        name: 'Fat Bottomed Girls',
        artist: 'Queen',
        album: 'Jazz (Deluxe Edition)',
        duration: 255
    };
    const params = {
        targetArtist: 'Queen',
        targetTitle: 'Fat Bottomed Girls - Single Version / Remastered 2011',
        targetDuration: 0,
        targetAlbum: ''
    };

    const strict = evaluateCandidate(candidate, params);
    assert(!strict.passed, 'la primera pasada debe seguir exigiendo el remaster exacto');

    const fallback = evaluateCandidate(candidate, { ...params, allowOfficialVersionFallback: true });
    assert(fallback.passed, fallback.rejectReason);
    assert(fallback.scores.versionScore === 0.68, 'el fallback debe perder frente a una edición exacta');
    assert(fallback.details.identity.titleScore === 1, 'Single Version debe separarse de la identidad base');
});

test('El fallback oficial nunca sustituye un remix solicitado', () => {
    const result = evaluateCandidate(
        { name: 'Levitating', artist: 'Dua Lipa', duration: 203 },
        {
            targetArtist: 'Dua Lipa',
            targetTitle: 'Levitating Remix',
            targetDuration: 0,
            targetAlbum: '',
            allowOfficialVersionFallback: true
        }
    );
    assert(!result.passed, 'un master original no debe sustituir un remix');
});

test('Original prefiere master exacto sobre fallback oficial', () => {
    const original = evaluate({
        targetArtist: 'a-ha',
        targetTitle: 'Take On Me',
        candidate: { name: 'a-ha - Take On Me', artist: 'a-ha', duration: 225 }
    });
    const remaster = evaluate({
        targetArtist: 'a-ha',
        targetTitle: 'Take On Me',
        candidate: { name: 'a-ha - Take On Me (2015 Remaster)', artist: 'a-ha', duration: 225 }
    });
    assert(original.passed && remaster.passed, 'el remaster oficial debe conservar recall como fallback');
    assert(original.scores.finalConfidence > remaster.scores.finalConfidence, 'el master original debe quedar primero');
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
