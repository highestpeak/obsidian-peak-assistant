import { normalizeBm25Scores, applyChunkDecay } from '../src/service/search/retriever/fts-retriever';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

// BM25 batch normalization: most negative → 1.0, least negative → 0.0
const scores = normalizeBm25Scores([-25, -10, -5, -1]);
assert(Math.abs(scores[0] - 1.0) < 0.01, `best bm25 ~1.0, got ${scores[0]}`);
assert(Math.abs(scores[3] - 0.0) < 0.01, `worst bm25 ~0.0, got ${scores[3]}`);
assert(scores[1] > scores[2], `bm25 -10 > -5`);

// Single result: should get 1.0
const single = normalizeBm25Scores([-5]);
assert(single[0] === 1.0, `single bm25 = 1.0, got ${single[0]}`);

// Empty: no crash
const empty = normalizeBm25Scores([]);
assert(empty.length === 0, 'empty bm25');

// Chunk decay test
type ChunkHit = { path: string; score: number; content: string };
const chunks: ChunkHit[] = [
  { path: 'a.md', score: 0.9, content: 'c1' },
  { path: 'a.md', score: 0.7, content: 'c2' },
  { path: 'a.md', score: 0.5, content: 'c3' },
  { path: 'b.md', score: 0.8, content: 'c4' },
];
const decayed = applyChunkDecay(chunks, 0.5);
assert(decayed.length === 2, `dedup to 2, got ${decayed.length}`);
assert(decayed[0].path === 'a.md', `first = a.md`);
// a.md: 0.9*1 + 0.7*0.5 + 0.5*0.25 = 1.375
assert(Math.abs(decayed[0].score - 1.375) < 0.01, `a.md score = ${decayed[0].score}`);
assert(decayed[0].content === 'c1', 'keep best chunk content');
assert(Math.abs(decayed[1].score - 0.8) < 0.01, `b.md score = ${decayed[1].score}`);

// Single chunk per doc: no decay
const single2 = applyChunkDecay([{ path: 'x.md', score: 0.5, content: 'c' }], 0.5);
assert(single2.length === 1 && Math.abs(single2[0].score - 0.5) < 0.01, 'single chunk no decay');

console.log('All fts-retriever tests passed');
