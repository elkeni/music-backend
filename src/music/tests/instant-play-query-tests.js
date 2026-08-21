import instantPlayHandler, { buildMetadataSearchQueries, buildSearchQueries } from '../../../api/instant-play.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const dumbai = buildSearchQueries('CA7RIEL & Paco Amoroso', 'DUMBAI');
assert(dumbai.includes('CA7RIEL Paco Amoroso DUMBAI'), `Variante DUMBAI ausente: ${dumbai.join(' | ')}`);

const betosHorns = buildSearchQueries('Fred again..', 'Beto’s Horns (fred remix)');
assert(betosHorns.includes('Fred again Betos Horns'), `Variante Beto's Horns ausente: ${betosHorns.join(' | ')}`);

const quiereme = buildSearchQueries('Latin Mafia', 'Quiereme');
assert(quiereme.includes('Quiereme'), `Variante solo título ausente: ${quiereme.join(' | ')}`);

const howItFeels = buildSearchQueries('Barry Can’t Swim', 'How It Feels');
assert(howItFeels.includes('How It Feels Barry Swim'), `Variante sin contracción ausente: ${howItFeels.join(' | ')}`);

const enrichedBonita = buildMetadataSearchQueries({
    artist: 'Latin Mafia',
    album: '9 months & 50 hours',
    contributors: [{ name: 'Latin Mafia' }, { name: 'Fred again..' }]
}, 'Latin Mafia', 'Bonita');
assert(enrichedBonita.includes('Bonita Fred again..'), `Variante con colaborador ausente: ${enrichedBonita.join(' | ')}`);

const responseHeaders = {};
let responseStatus = 0;
await instantPlayHandler({ method: 'GET', query: {} }, {
    setHeader(name, value) { responseHeaders[name.toLowerCase()] = value; },
    status(value) { responseStatus = value; return this; },
    json() { return this; },
    end() { return this; }
});
assert(responseStatus === 400, `Estado esperado 400, recibido ${responseStatus}`);
assert(responseHeaders['cache-control'] === 'no-store', `Un error no debe cachearse: ${responseHeaders['cache-control']}`);

console.log('✅ Query segura DUMBAI:', dumbai.join(' | '));
console.log("✅ Query segura Beto's Horns:", betosHorns.join(' | '));
console.log('✅ Query segura Quiereme:', quiereme.join(' | '));
console.log('✅ Query segura How It Feels:', howItFeels.join(' | '));
console.log('✅ Enriquecimiento Bonita:', enrichedBonita.join(' | '));
console.log('✅ Errores instant-play sin caché pública');
