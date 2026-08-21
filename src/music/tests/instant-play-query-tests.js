import { buildSearchQueries } from '../../../api/instant-play.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const dumbai = buildSearchQueries('CA7RIEL & Paco Amoroso', 'DUMBAI');
assert(dumbai.includes('CA7RIEL Paco Amoroso DUMBAI'), `Variante DUMBAI ausente: ${dumbai.join(' | ')}`);

const betosHorns = buildSearchQueries('Fred again..', 'Beto’s Horns (fred remix)');
assert(betosHorns.includes('Fred again Betos Horns'), `Variante Beto's Horns ausente: ${betosHorns.join(' | ')}`);

console.log('✅ Query segura DUMBAI:', dumbai.join(' | '));
console.log("✅ Query segura Beto's Horns:", betosHorns.join(' | '));

