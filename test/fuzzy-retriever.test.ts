import { buildTitleTokenCache, findFuzzyTerms } from '../src/service/search/retriever/fuzzy-retriever';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

const titles = [
  { title: 'Machine Learning Basics' },
  { title: 'Deep Learning Tutorial' },
  { title: 'Obsidian Plugin Development' },
  { title: 'Search Algorithm Design' },
];
const cache = buildTitleTokenCache(titles);
assert(cache.includes('machine'), 'cache has machine');
assert(cache.includes('obsidian'), 'cache has obsidian');
assert(new Set(cache).size === cache.length, 'unique tokens');

const corrections = findFuzzyTerms(['machien'], cache);
assert(corrections.length === 1, `1 correction, got ${corrections.length}`);
assert(corrections[0].original === 'machien', 'original = machien');
assert(corrections[0].corrected === 'machine', `corrected = machine, got ${corrections[0].corrected}`);

const noCorrections = findFuzzyTerms(['machine'], cache);
assert(noCorrections.length === 0, 'exact match = no corrections');

const unrelated = findFuzzyTerms(['xyzabc'], cache);
assert(unrelated.length === 0, 'unrelated = no match');

console.log('All fuzzy-retriever tests passed');
