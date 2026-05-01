import { computeChangeMagnitude, detectChanges } from '@/service/search/index/cascade/CascadeChangeDetector';
import type { PreIndexSnapshot } from '@/service/search/index/cascade/types';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(`FAIL: ${message}`);
    }
}

function approxEqual(a: number, b: number, epsilon = 0.001): boolean {
    return Math.abs(a - b) < epsilon;
}

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void): void {
    try {
        fn();
        console.log(`PASS: ${description}`);
        passed++;
    } catch (e) {
        console.log(`FAIL: ${description} — ${(e as Error).message}`);
        failed++;
    }
}

// ── computeChangeMagnitude ──────────────────────────────────────────────────

test('identical vectors → 0', () => {
    const v = [1, 0, 0];
    assert(computeChangeMagnitude(v, v) === 0, 'expected 0');
});

test('identical non-unit vectors → 0', () => {
    const a = [3, 4, 0];
    const b = [3, 4, 0];
    assert(approxEqual(computeChangeMagnitude(a, b), 0), 'expected ~0');
});

test('orthogonal vectors → ~1', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    assert(approxEqual(computeChangeMagnitude(a, b), 1), 'expected ~1');
});

test('opposite vectors → ~1 (clamped at 1)', () => {
    const a = [1, 0];
    const b = [-1, 0];
    const result = computeChangeMagnitude(a, b);
    // cosine = -1, distance = 1 - (-1) = 2, clamped to 1
    assert(result === 1, `expected 1, got ${result}`);
});

test('null old → 1', () => {
    assert(computeChangeMagnitude(null, [1, 0, 0]) === 1, 'expected 1');
});

test('null new → 1', () => {
    assert(computeChangeMagnitude([1, 0, 0], null) === 1, 'expected 1');
});

test('both null → 0', () => {
    assert(computeChangeMagnitude(null, null) === 0, 'expected 0');
});

test('different length vectors → 1', () => {
    assert(computeChangeMagnitude([1, 0], [1, 0, 0]) === 1, 'expected 1');
});

test('zero vector → 1 (denom = 0)', () => {
    assert(computeChangeMagnitude([0, 0, 0], [1, 0, 0]) === 1, 'expected 1');
});

test('similar but not identical vectors → between 0 and 1', () => {
    const a = [1, 0.1, 0];
    const b = [1, 0.0, 0];
    const result = computeChangeMagnitude(a, b);
    assert(result > 0 && result < 1, `expected (0,1), got ${result}`);
});

// ── detectChanges ───────────────────────────────────────────────────────────

const baseSnapshot: PreIndexSnapshot = {
    contentHash: 'hash-abc',
    outgoingTargetIds: ['node-1', 'node-2'],
    embeddingVector: [1, 0, 0],
};

test('no change → null', () => {
    const result = detectChanges('doc/a.md', 'node-a', baseSnapshot, 'hash-abc', ['node-1', 'node-2'], [1, 0, 0]);
    assert(result === null, 'expected null when nothing changed');
});

test('null pre-snapshot (new doc) → non-null', () => {
    const result = detectChanges('doc/new.md', 'node-new', null, 'hash-xyz', ['node-1'], [1, 0, 0]);
    assert(result !== null, 'expected non-null for new doc');
    assert(result!.contentHashChanged === true, 'contentHashChanged should be true');
    assert(result!.outgoingLinksChanged === true, 'outgoingLinksChanged should be true');
    assert(result!.embeddingChanged === true, 'embeddingChanged should be true');
    assert(result!.changeMagnitude === 1, 'changeMagnitude should be 1 (null old vec)');
});

test('content hash changed → non-null with contentHashChanged=true', () => {
    const result = detectChanges('doc/a.md', 'node-a', baseSnapshot, 'hash-NEW', ['node-1', 'node-2'], [1, 0, 0]);
    assert(result !== null, 'expected non-null');
    assert(result!.contentHashChanged === true, 'contentHashChanged should be true');
    assert(result!.outgoingLinksChanged === false, 'outgoingLinksChanged should be false');
    assert(result!.embeddingChanged === false, 'embeddingChanged should be false');
});

test('outgoing links changed (added) → non-null with outgoingLinksChanged=true', () => {
    const result = detectChanges('doc/a.md', 'node-a', baseSnapshot, 'hash-abc', ['node-1', 'node-2', 'node-3'], [1, 0, 0]);
    assert(result !== null, 'expected non-null');
    assert(result!.outgoingLinksChanged === true, 'outgoingLinksChanged should be true');
    assert(result!.contentHashChanged === false, 'contentHashChanged should be false');
});

test('outgoing links changed (removed) → non-null with outgoingLinksChanged=true', () => {
    const result = detectChanges('doc/a.md', 'node-a', baseSnapshot, 'hash-abc', ['node-1'], [1, 0, 0]);
    assert(result !== null, 'expected non-null');
    assert(result!.outgoingLinksChanged === true, 'outgoingLinksChanged should be true');
});

test('outgoing links same set different order → null (no change)', () => {
    const result = detectChanges('doc/a.md', 'node-a', baseSnapshot, 'hash-abc', ['node-2', 'node-1'], [1, 0, 0]);
    assert(result === null, 'expected null — same set, different order');
});

test('only embedding changed → non-null with embeddingChanged=true', () => {
    // orthogonal vector: huge semantic shift
    const result = detectChanges('doc/a.md', 'node-a', baseSnapshot, 'hash-abc', ['node-1', 'node-2'], [0, 1, 0]);
    assert(result !== null, 'expected non-null');
    assert(result!.embeddingChanged === true, 'embeddingChanged should be true');
    assert(result!.contentHashChanged === false, 'contentHashChanged should be false');
    assert(result!.outgoingLinksChanged === false, 'outgoingLinksChanged should be false');
    assert(approxEqual(result!.changeMagnitude, 1), `changeMagnitude expected ~1, got ${result!.changeMagnitude}`);
});

test('embedding nearly identical (within threshold) → null', () => {
    // nearly parallel vectors
    const a = [1, 0, 0];
    const b = [1, 0.0005, 0]; // tiny perturbation; cosine dist < 0.001
    const result = detectChanges('doc/a.md', 'node-a', { ...baseSnapshot, embeddingVector: a }, 'hash-abc', ['node-1', 'node-2'], b);
    assert(result === null, 'expected null — embedding change below threshold');
});

test('result carries correct docPath and docNodeId', () => {
    const result = detectChanges('notes/x.md', 'node-x', null, 'new-hash', [], null);
    assert(result !== null, 'expected non-null');
    assert(result!.docPath === 'notes/x.md', 'docPath mismatch');
    assert(result!.docNodeId === 'node-x', 'docNodeId mismatch');
});

test('result carries old/new outgoing target ids', () => {
    const result = detectChanges('doc/a.md', 'node-a', baseSnapshot, 'hash-abc', ['node-3'], [1, 0, 0]);
    assert(result !== null, 'expected non-null');
    assert(JSON.stringify(result!.oldOutgoingTargetIds) === JSON.stringify(['node-1', 'node-2']), 'old targets mismatch');
    assert(JSON.stringify(result!.newOutgoingTargetIds) === JSON.stringify(['node-3']), 'new targets mismatch');
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
