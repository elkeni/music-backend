
import { evaluateCandidate } from './src/music/extraction/youtube-extractor.js';

const testCases = [
    // CASO 1: Grupo 5 - Motor y Motivo (Clásico de Cumbia)
    // Desafío: Metadata de YouTube a menudo tiene "Video Oficial" o "En Vivo" (aunque sea la única versión popular)
    {
        desc: "Grupo 5 - Motor y Motivo (Video Oficial)",
        params: {
            targetArtist: "Grupo 5",
            targetTitle: "Motor y Motivo",
        },
        candidate: {
            name: "Grupo 5 - Motor y Motivo (Video Oficial)",
            artist: "Grupo 5",
            duration: 245
        }
    },
    // CASO 2: Agua Marina (Complejo: Título largo con ubicación común en Perú)
    {
        desc: "Agua Marina - Tu Traición (En Vivo) [Should PASS with Peru Exception]",
        params: {
            targetArtist: "Agua Marina",
            targetTitle: "Tu Traición",
        },
        candidate: {
            name: "Agua Marina - Tu Traición (Concierto en Vivo)",
            artist: "Agua Marina",
            duration: 300
        }
    },
    // CASO 3: Daniela Darcourt (Salsa - Identidad exacta)
    {
        desc: "Daniela Darcourt - Señor Mentira",
        params: {
            targetArtist: "Daniela Darcourt",
            targetTitle: "Señor Mentira",
        },
        candidate: {
            name: "Daniela Darcourt - Señor Mentira (Salsa Version)",
            artist: "Daniela Darcourt",
            duration: 280
        }
    },
    // CASO 4: Armonía 10 (Separadores raros comunes en uploads peruanos)
    {
        desc: "Armonía 10 - La Duda (Formato cumbia)",
        params: {
            targetArtist: "Armonía 10",
            targetTitle: "La Duda",
        },
        // A veces suben como "ARMONIA 10 - LA DUDA | AUDIO OFICIAL"
        candidate: {
            name: "ARMONIA 10 - LA DUDA | AUDIO OFICIAL 2024",
            artist: "Armonía 10",
            duration: 210
        }
    },
    // CASO 5: Corazón Serrano (Mixes - Debería ser rechazado)
    {
        desc: "Corazón Serrano - Mix (Rechazo esperado)",
        params: {
            targetArtist: "Corazón Serrano",
            targetTitle: "Hasta La Raíz",
        },
        candidate: {
            name: "Corazón Serrano - Mix Hasta La Raíz / Tomando Cerveza",
            artist: "Corazón Serrano",
            duration: 600
        }
    }
];

console.log("════════════════════════════════════════════════════════");
console.log("🧪 TESTING EXTRACTOR LOGIC (ADAPTIVE + BASE IDENTITY)");
console.log("════════════════════════════════════════════════════════");

testCases.forEach(tc => {
    console.log(`\n🔍 CASE: ${tc.desc}`);
    const result = evaluateCandidate(tc.candidate, tc.params);

    if (result.passed) {
        console.log(`✅ PASSED | Confidence: ${result.scores.finalConfidence.toFixed(2)}`);
    } else {
        console.log(`❌ REJECTED | Reason: ${result.rejectReason}`);
        // Log full result if rejected to see what happened
        // console.log(JSON.stringify(result, null, 2));
    }

    if (result.details?.identity) {
        console.log(`   Scores -> Identity: ${result.scores.identityScore.toFixed(2)} | Title: ${result.details.identity.titleScore.toFixed(2)} | Artist: ${result.details.identity.artistScore.toFixed(2)}`);
        console.log(`   Match Types -> Title: ${result.details.identity.titleMatch} | Artist: ${result.details.identity.artistMatch}`);
    } else {
        console.log(`   ⚠️ NO DETAILS (Likely Trash or Forbidden version)`);
    }
});
console.log("\n════════════════════════════════════════════════════════");
