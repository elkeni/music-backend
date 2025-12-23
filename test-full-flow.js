
import { executeSearch } from './api/youtube-search.js';
import 'dotenv/config';

// Mock express items
const mockRes = {
    setHeader: () => { },
    status: (code) => ({ json: (data) => ({ code, data }) }),
    json: (data) => data
};

// Importar el handler de streams directamente para probarlo
import streamHandler from './api/youtube-streams.js';

async function testFullFlow() {
    console.log('🚀 TESTING FULL MOBILE FLOW: Search -> Stream Selection\n');

    // 1. SEARCH
    const query = 'skrillex bangarang';
    console.log(`🔎 1. Searching for: "${query}"...`);

    // Configura entorno si falta
    if (!process.env.SOURCE_API_URL) process.env.SOURCE_API_URL = 'https://appmusic-phi.vercel.app';

    try {
        const searchRes = await executeSearch(query, { targetTitle: query, targetArtist: '' }, 1);

        if (!searchRes.results.length) {
            console.error('❌ Search failed to find any results.');
            return;
        }

        const topResult = searchRes.results[0];
        console.log(`✅ Found: "${topResult.title}" (ID: ${topResult.videoId})`);

        // 2. TEST STANDARD STREAMING (WiFi Mode)
        console.log('\n📡 2. Testing WiFi Mode (High Quality)...');
        const reqWifi = {
            query: { videoId: topResult.videoId, confidence: 0.9 },
            headers: {}
        };

        const resWifi = await streamHandler(reqWifi, mockRes);
        // streamHandler returns a Promise that resolves to the result object from our mock status().json()
        const wifiData = resWifi.data;

        if (wifiData && wifiData.success) {
            console.log(`   Selected Quality: ${wifiData.qualityInfo.selectedQuality}kbps`);
            console.log(`   Policy: ${wifiData.qualityInfo.policy}`);
            console.log(`   Streams found: ${wifiData.audioStreams.length}`);
        } else {
            console.error('   ❌ Failed to get streams:', wifiData?.error);
        }

        // 3. TEST MOBILE SAVER STREAMING (Save-Data Mode)
        console.log('\n📱 3. Testing Mobile "Save-Data" Mode...');
        const reqMobile = {
            query: { videoId: topResult.videoId, confidence: 0.9 },
            headers: { 'save-data': 'on' }
        };

        const resMobile = await streamHandler(reqMobile, mockRes);
        const mobileData = resMobile.data;

        if (mobileData && mobileData.success) {
            console.log(`   Selected Quality: ${mobileData.qualityInfo.selectedQuality}kbps`);
            console.log(`   Policy: ${mobileData.qualityInfo.policy}`);
            console.log(`   Streams found: ${mobileData.audioStreams.length}`);

            if (mobileData.qualityInfo.saveDataMode) {
                console.log('   ✅ Save-Data header detected and respected!');
            }

            if (mobileData.qualityInfo.selectedQuality <= 128) {
                console.log('   ✅ Low bitrate verified for data saving.');
            } else {
                console.warn('   ⚠️ Warning: Bitrate might be too high for save-data mode.');
            }
        } else {
            console.error('   ❌ Failed to get streams:', mobileData?.error);
        }

    } catch (e) {
        console.error('💥 Error running test:', e);
    }
}

testFullFlow();
