import assert from 'assert';
import {
	makeDroppedSlotSummary,
	makeMessageWindowSummary,
	makeDroppedBlockSummary,
} from '@/core/context/compactSummary';
import { refetchCompactAnchor, type RefetchAnchorPorts } from '@/service/context/refetchAnchor';

function testDroppedSlotSummaryShape() {
	const s = makeDroppedSlotSummary('recent-messages', 850, 'last 40 turns');
	assert.strictEqual(s.origin, 'recent-messages');
	assert.strictEqual(s.level, 4);
	assert.deepStrictEqual(s.anchors, [{ kind: 'slot', ref: 'recent-messages' }]);
	assert.ok(s.summary.includes('850'), 'summary mentions prior token count');
	assert.ok(s.lostDetail.includes('last 40 turns'), 'lost detail includes descriptor');
	console.log('[compact-summary] dropped slot: PASS');
}

function testMessageWindowSummaryShape() {
	const s = makeMessageWindowSummary(12, 'msg-a', 'msg-z');
	assert.strictEqual(s.level, 3);
	assert.strictEqual(s.anchors.length, 2);
	assert.strictEqual(s.anchors[0].kind, 'message');
	assert.strictEqual(s.anchors[0].ref, 'msg-a');
	assert.strictEqual(s.anchors[1].ref, 'msg-z');
	assert.ok(s.summary.includes('12'), 'summary mentions dropped count');
	console.log('[compact-summary] message window: PASS');
}

function testMessageWindowSummaryHandlesMissingRefs() {
	const s = makeMessageWindowSummary(5, undefined, undefined);
	assert.strictEqual(s.anchors.length, 0, 'no anchors when both refs missing');
	console.log('[compact-summary] message window missing refs: PASS');
}

function testDroppedBlockSummaryShape() {
	const s = makeDroppedBlockSummary('block-42', 300);
	assert.strictEqual(s.origin, 'block-42');
	assert.strictEqual(s.anchors[0].kind, 'block');
	console.log('[compact-summary] dropped block: PASS');
}

async function testRefetchWithNoPortReportsError() {
	const s = makeDroppedSlotSummary('convSummary', 500);
	const result = await refetchCompactAnchor(s.anchors[0], {});
	assert.strictEqual(result.text, null);
	assert.ok(result.error?.includes('no port registered'), 'clear error when port missing');
	console.log('[compact-summary] refetch without port: PASS');
}

async function testRefetchDispatchesByKind() {
	const ports: RefetchAnchorPorts = {
		getMessage: async (id) => `<message ${id}>`,
		readFile: async (p) => `<file ${p}>`,
		getResource: async (r) => `<resource ${r}>`,
		getChunk: async (c) => `<chunk ${c}>`,
		rebuildSlot: async (s) => `<slot ${s}>`,
		rehydrateBlock: async (b) => `<block ${b}>`,
	};

	const cases = [
		{ anchor: { kind: 'message', ref: 'm1' } as const, expect: '<message m1>' },
		{ anchor: { kind: 'file', ref: 'notes/a.md' } as const, expect: '<file notes/a.md>' },
		{ anchor: { kind: 'resource', ref: 'r1' } as const, expect: '<resource r1>' },
		{ anchor: { kind: 'chunk', ref: 'c1' } as const, expect: '<chunk c1>' },
		{ anchor: { kind: 'slot', ref: 's1' } as const, expect: '<slot s1>' },
		{ anchor: { kind: 'block', ref: 'b1' } as const, expect: '<block b1>' },
	];

	for (const c of cases) {
		const result = await refetchCompactAnchor(c.anchor, ports);
		assert.strictEqual(result.text, c.expect, `dispatch for kind ${c.anchor.kind}`);
		assert.strictEqual(result.error, undefined);
	}
	console.log('[compact-summary] refetch dispatch by kind: PASS');
}

async function testRefetchSurfacesPortThrows() {
	const ports: RefetchAnchorPorts = {
		readFile: async () => {
			throw new Error('vault offline');
		},
	};
	const result = await refetchCompactAnchor({ kind: 'file', ref: 'x.md' }, ports);
	assert.strictEqual(result.text, null);
	assert.strictEqual(result.error, 'vault offline');
	console.log('[compact-summary] refetch surfaces port throw: PASS');
}

async function testRefetchReportsRefNotFound() {
	const ports: RefetchAnchorPorts = { readFile: async () => null };
	const result = await refetchCompactAnchor({ kind: 'file', ref: 'missing.md' }, ports);
	assert.strictEqual(result.text, null);
	assert.ok(result.error?.includes('not found'), 'clear error on null return');
	console.log('[compact-summary] refetch ref not found: PASS');
}

(async () => {
	testDroppedSlotSummaryShape();
	testMessageWindowSummaryShape();
	testMessageWindowSummaryHandlesMissingRefs();
	testDroppedBlockSummaryShape();
	await testRefetchWithNoPortReportsError();
	await testRefetchDispatchesByKind();
	await testRefetchSurfacesPortThrows();
	await testRefetchReportsRefNotFound();
})();
