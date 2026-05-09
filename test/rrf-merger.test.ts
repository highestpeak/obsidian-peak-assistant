import { rrfMerge } from '../src/service/search/merger/rrf-merger';
import type { RetrieverResult } from '../src/service/search/retriever/types';
import type { RetrieverWeights } from '../src/service/search/query/query-parser';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

const weights: RetrieverWeights = { fts: 1.0, ftsStem: 0.7, vector: 0.6, meta: 0.8, fuzzy: 0.3 };

const makeResult = (path: string, score: number, source: string): RetrieverResult => ({
  path, score, source, matchType: 'exact', content: '',
});

// Doc in multiple retrievers gets higher score
const results = new Map<string, RetrieverResult[]>();
results.set('fts', [makeResult('a.md', 0.9, 'fts'), makeResult('b.md', 0.7, 'fts')]);
results.set('meta', [makeResult('a.md', 0.8, 'meta'), makeResult('c.md', 0.9, 'meta')]);

const merged = rrfMerge(results, weights);
assert(merged[0].path === 'a.md', `first = a.md (in both), got ${merged[0].path}`);
assert(merged.length === 3, `3 unique docs, got ${merged.length}`);
assert(merged[0].rrfScore > merged[1].rrfScore, 'multi-source > single-source');
assert(merged[0].sources.has('fts') && merged[0].sources.has('meta'), 'sources include both');

// Empty input
const emptyMerged = rrfMerge(new Map(), weights);
assert(emptyMerged.length === 0, 'empty → empty');

// Single retriever
const single = new Map<string, RetrieverResult[]>();
single.set('fts', [makeResult('x.md', 0.5, 'fts'), makeResult('y.md', 0.3, 'fts')]);
const singleMerged = rrfMerge(single, weights);
assert(singleMerged.length === 2, 'single retriever: 2 results');
assert(singleMerged[0].rrfScore > singleMerged[1].rrfScore, 'rank order preserved');

console.log('All rrf-merger tests passed');
