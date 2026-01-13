
import { evaluateCandidate } from './src/music/extraction/youtube-extractor.js';

const testCases = [
    {
        desc: "EXACT: Fred again.. x CA7RIEL x Paco Amoroso - Beto's Horns",
        params: {
            targetArtist: "Fred again..",
            targetTitle: "Beto's Horns",
        },
        candidate: {
            name: "Fred again.. x CA7RIEL x Paco Amoroso - Beto's Horns",
            artist: "Fred again..",
            duration: 180
        }
    },
    {
        desc: "REMIX: Fred again.. - Beto's Horns (fred remix) [Should PASS with base identity]",
        params: {
            targetArtist: "Fred again..",
            targetTitle: "Beto's Horns",
        },
        candidate: {
            name: "Fred again.. x CA7RIEL x Paco Amoroso - Beto's Horns (fred remix)",
            artist: "Fred again..",
            duration: 180
        }
    },
    {
        desc: "COMPLEX ARTIST: Search with full artist string",
        params: {
            targetArtist: "Fred again.., CA7RIEL, Paco Amoroso",
            targetTitle: "Beto's Horns",
        },
        candidate: {
            name: "Fred again.. x CA7RIEL x Paco Amoroso - Beto's Horns",
            artist: "Fred again..",
            duration: 180
        }
    },
    {
        desc: "TYPO/VARIATION: Betos Horn (Missing apos/s) [Should PASS with adaptive]",
        params: {
            targetArtist: "Fred again..",
            targetTitle: "Beto's Horns",
        },
        candidate: {
            name: "Fred again.. - Betos Horn",
            artist: "Fred again..",
            duration: 180
        }
    },
    {
        desc: "LIVE: Fred again.. - Beto's Horns (Live) [Should FAIL]",
        params: {
            targetArtist: "Fred again..",
            targetTitle: "Beto's Horns",
        },
        candidate: {
            name: "Fred again.. - Beto's Horns (Live at Boiler Room)",
            artist: "Fred again..",
            duration: 180
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
