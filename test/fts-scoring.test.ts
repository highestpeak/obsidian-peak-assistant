import assert from 'assert';
import { normalizeBm25Scores, applyChunkDecay } from '@/service/search/retriever/fts-retriever';

function approx(a: number, b: number, epsilon = 1e-9): void {
	assert.ok(Math.abs(a - b) < epsilon, `expected ${a} ≈ ${b}`);
}

function testNormalizeBm25EmptyReturnsEmpty() {
	assert.deepStrictEqual(normalizeBm25Scores([]), []);
	console.log('[fts-scoring] normalize empty: PASS');
}

function testNormalizeBm25SingleValueSaturatesToOne() {
	assert.deepStrictEqual(normalizeBm25Scores([-3.5]), [1.0], 'single-value → 1.0 by fiat');
	console.log('[fts-scoring] normalize single value: PASS');
}

function testNormalizeBm25SqliteConventionMostNegativeIsBest() {
	// SQLite's BM25 is more-negative = better match. Worked example: three docs
	// with BM25 -5 (best), -3, -1 (worst). Expected normalized: 1.0, 0.5, 0.0.
	const normalized = normalizeBm25Scores([-5, -3, -1]);
	approx(normalized[0], 1.0);
	approx(normalized[1], 0.5);
	approx(normalized[2], 0.0);
	console.log('[fts-scoring] normalize BM25 range: PASS');
}

function testNormalizeBm25AllEqualCollapseToOne() {
	assert.deepStrictEqual(normalizeBm25Scores([-2, -2, -2]), [1.0, 1.0, 1.0]);
	console.log('[fts-scoring] normalize BM25 no range: PASS');
}

function testChunkDecayEmpty() {
	assert.deepStrictEqual(applyChunkDecay([]), []);
	console.log('[fts-scoring] chunk decay empty: PASS');
}

function testChunkDecayWorkedExample() {
	// Worked example: doc "a.md" has three chunks scored [0.9, 0.5, 0.2].
	// After decay 0.5: 0.9 + 0.5*0.5 + 0.2*0.25 = 0.9 + 0.25 + 0.05 = 1.20.
	// doc "b.md" has one chunk scored 0.8 → stays 0.8.
	// a.md should rank first.
	const merged = applyChunkDecay([
		{ path: 'a.md', score: 0.5, content: 'chunk-2' },
		{ path: 'a.md', score: 0.9, content: 'chunk-1' },
		{ path: 'a.md', score: 0.2, content: 'chunk-3' },
		{ path: 'b.md', score: 0.8, content: 'chunk-b' },
	]);
	assert.strictEqual(merged.length, 2, 'grouped by path');
	assert.strictEqual(merged[0].path, 'a.md', 'a.md ranks first');
	approx(merged[0].score, 1.2);
	assert.strictEqual(merged[0].content, 'chunk-1', 'best chunk content preserved');
	assert.strictEqual(merged[1].path, 'b.md');
	approx(merged[1].score, 0.8);
	console.log('[fts-scoring] chunk decay worked example: PASS');
}

function testChunkDecayHigherDecayKeepsMoreTail() {
	// Same shape but decay=0.9: 0.9 + 0.5*0.9 + 0.2*0.81 = 0.9 + 0.45 + 0.162 = 1.512.
	const merged = applyChunkDecay(
		[
			{ path: 'a.md', score: 0.5, content: 'c2' },
			{ path: 'a.md', score: 0.9, content: 'c1' },
			{ path: 'a.md', score: 0.2, content: 'c3' },
		],
		0.9,
	);
	approx(merged[0].score, 0.9 + 0.5 * 0.9 + 0.2 * Math.pow(0.9, 2));
	console.log('[fts-scoring] chunk decay parameterized: PASS');
}

testNormalizeBm25EmptyReturnsEmpty();
testNormalizeBm25SingleValueSaturatesToOne();
testNormalizeBm25SqliteConventionMostNegativeIsBest();
testNormalizeBm25AllEqualCollapseToOne();
testChunkDecayEmpty();
testChunkDecayWorkedExample();
testChunkDecayHigherDecayKeepsMoreTail();
