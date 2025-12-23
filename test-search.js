
// test-search.js
import { executeSearch } from './api/youtube-search.js';
import 'dotenv/config';

// Mock de process.env si falla
if (!process.env.SOURCE_API_URL) {
    process.env.SOURCE_API_URL = 'https://appmusic-phi.vercel.app';
}

async function test() {
    console.log('🧪 TESTING SEARCH LOGIC (Post-Merge Validation)\n');

    const queries = [
        { q: 'Fred again.. -leavemealone', label: 'Specific Track' },
        { q: 'lofi hip hop', label: 'Generic Search' },
        { q: 'skrillex bangarang', label: 'Classic Hit' }
    ];

    for (const { q, label } of queries) {
        console.log(`\n🔎 Testing: "${q}" [${label}]`);
        const start = Date.now();

        try {
            const params = {
                targetTitle: q,
                targetArtist: '',
                targetDuration: 0
            };

            const result = await executeSearch(q, params, 5);
            const time = Date.now() - start;

            console.log(`✅ Success in ${time}ms`);
            console.log(`   Results: ${result.results.length}`);
            if (result.results.length > 0) {
                console.log(`   Top Result: ${result.results[0].title} (${result.results[0].source})`);
                console.log(`   Confidence: ${result.results[0].scores.finalConfidence}`);
            } else {
                console.warn('   ⚠️ No results found');
                if (result.stats?.rejected > 0) {
                    console.log(`   Rejected candidates: ${result.stats.rejected}`);
                }
            }
        } catch (e) {
            console.error(`❌ Failed: ${e.message}`);
        }
    }
}

test();
