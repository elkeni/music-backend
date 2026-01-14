

import { evaluateCandidate } from './src/music/extraction/youtube-extractor.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const YouTube = require('youtube-sr').default || require('youtube-sr');

// We will test the "Fallback" scenario largely, as that uses youtube-sr directly, 
// which is where the "different name in youtube" issue usually arises.

const TEST_SONGS = [
    { artist: "Justin Bieber", title: "Peaches" },
    { artist: "The Weeknd", title: "Blinding Lights" },
    { artist: "Adele", title: "Hello" },
    { artist: "Rauw Alejandro", title: "Todo De Ti" }, // Latin example
    { artist: "Bad Bunny", title: "Yonaguni" }
];

async function runLiveTest() {
    console.log("🚀 Running LIVE Search Verification...\n");

    for (const song of TEST_SONGS) {
        const query = `${song.artist} ${song.title}`;
        console.log(`\n🔎 Searching for: "${query}"`);

        try {
            // Simulate the search logic from instant-play.js
            const videos = await YouTube.search(query, { limit: 5, type: 'video', safeSearch: true });

            console.log(`   Found ${videos.length} candidates from YouTube.`);

            let matchFound = false;

            for (const v of videos) {
                try {
                    const candidate = {
                        name: v.title,
                        title: v.title,
                        artist: v.channel ? v.channel.name : '',
                        duration: v.duration / 1000,
                        album: '' // YouTube results often lack album
                    };

                    const targetParams = {
                        targetArtist: song.artist,
                        targetTitle: song.title,
                        targetDuration: 0,
                        targetAlbum: ''
                    };

                    const result = evaluateCandidate(candidate, targetParams);

                    const status = result.passed ? "✅ MATCH" : "❌ REJECT";
                    if (result.passed && !matchFound) matchFound = true;

                    // Log details only if interesting (Match or Near Match)
                    if (result.passed || result.scores.finalConfidence > 0.5) {
                        console.log(`   [${status}] ${candidate.title}`);
                        console.log(`       Artist: ${candidate.artist}`);
                        console.log(`       Score: ${result.scores.finalConfidence.toFixed(2)} (Id: ${result.scores.identityScore}, Art: ${result.details.identity.artistScore})`);
                        if (!result.passed) console.log(`       Reason: ${result.rejectReason}`);
                    }
                } catch (err) {
                    // Ignore malformed items
                }
            }

            if (!matchFound) console.log("   ⚠️ NO VALID MATCH FOUND for this song.");

        } catch (e) {
            console.error("   Error searching:", e.message);
        }
    }
}

runLiveTest();
