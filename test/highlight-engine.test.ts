import { HighlightEngine } from '../src/service/search/query/highlight-engine';
import { parseQuery } from '../src/service/search/query/query-parser';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

const engine = new HighlightEngine();

// Title highlight: exact match
const plan1 = parseQuery('obsidian');
const h1 = engine.highlight('My Obsidian Notes', plan1);
assert(h1.text === 'My Obsidian Notes', 'text preserved');
assert(h1.spans.length === 1, `one span, got ${h1.spans.length}`);
assert(h1.spans[0].type === 'exact', 'type exact');
assert(h1.text.slice(h1.spans[0].start, h1.spans[0].end).toLowerCase() === 'obsidian', 'covers Obsidian');

// Multiple terms
const plan2 = parseQuery('machine learning');
const h2 = engine.highlight('Machine Learning Basics', plan2);
assert(h2.spans.length === 2, `two spans, got ${h2.spans.length}`);

// Snippet with raw text display
const raw = 'The Quick Brown Fox jumps over the lazy dog. The Fox is VERY quick.';
const norm = raw.toLowerCase();
const plan3 = parseQuery('fox quick');
const h3 = engine.highlightSnippet(raw, norm, plan3);
assert(h3.text.includes('Fox') || h3.text.includes('fox'), 'snippet contains Fox');
assert(h3.spans.length >= 2, `at least 2 highlights, got ${h3.spans.length}`);

// Phrase highlight
const plan4 = parseQuery('"brown fox"');
const h4 = engine.highlightSnippet(raw, norm, plan4);
assert(h4.spans.some(s => {
  const matched = h4.text.slice(s.start, s.end).toLowerCase();
  return matched === 'brown fox';
}), 'phrase highlighted as one span');

// Empty query
const plan5 = parseQuery('');
const h5 = engine.highlight('Some Title', plan5);
assert(h5.spans.length === 0, 'empty query = no spans');

// No matches in content
const plan6 = parseQuery('xyz');
const h6 = engine.highlightSnippet('Hello world content', 'hello world content', plan6);
assert(h6.spans.length === 0, 'no matches = no spans');

console.log('All highlight-engine tests passed');
