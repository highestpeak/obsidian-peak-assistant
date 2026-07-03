// HubCuratorAgent prep budget formula + memory merge behavior.

import assert from 'assert';
import { computeCuratorBudget } from '@/service/agents/hub-curation-helper/hubCurationPrep';
import {
	buildInitialHubCurationMemory,
	mergeSubmitIntoMemory,
} from '@/service/agents/hub-curation-helper/hubCurationMemory';
import type { HubCurationSubmit } from '@/core/schemas/agents/hubCuration';

async function main() {
	testBudgetFormula();
	testMemoryMerge();
	testMemoryMergeOverridesSameNode();
	console.log('hub-curation-prep: ok');
}

function testBudgetFormula() {
	// n=0 → sqrt(0)*1.5 = 0 → clamp min 12; log2(12) ≈ 3.58 → ceil=4; clamp[1,4]=4
	const b0 = computeCuratorBudget(0);
	assert.strictEqual(b0.candidateLimit, 12);
	assert.strictEqual(b0.maxIterations, 4);

	// n=300 → sqrt(300)*1.5 ≈ 26 → 26; log2(26)≈4.7→5→clamp 4
	const b300 = computeCuratorBudget(300);
	assert.strictEqual(b300.candidateLimit, 26);
	assert.strictEqual(b300.maxIterations, 4);

	// n=3000 → sqrt(3000)*1.5 ≈ 83 → clamp 60; log2(60)≈5.9→6→clamp 4
	const b3000 = computeCuratorBudget(3000);
	assert.strictEqual(b3000.candidateLimit, 60);
	assert.strictEqual(b3000.maxIterations, 4);

	console.log('  ✓ budget formula clamps candidate and iterations');
}

function makeSubmit(overrides: Partial<HubCurationSubmit> = {}): HubCurationSubmit {
	return {
		hubs: [],
		coverage: { totalMembers: 100, coveredMembers: 60, uncoveredHighValue: [] },
		confidence: 0.7,
		should_stop: false,
		...overrides,
	};
}

function testMemoryMerge() {
	const empty = buildInitialHubCurationMemory();
	assert.strictEqual(empty.decisions.length, 0);
	assert.strictEqual(empty.iterations, 0);
	assert.strictEqual(empty.coveragePct, 0);

	const submit = makeSubmit({
		hubs: [
			{ nodeId: 'n1', hubPath: 'p1', action: 'create', scope: { communityIds: [], memberNodeIds: [] }, reason: 'r1' },
			{ nodeId: 'n2', hubPath: 'p2', action: 'keep', scope: { communityIds: [], memberNodeIds: [] }, reason: 'r2' },
		],
	});
	const merged = mergeSubmitIntoMemory(empty, submit);
	assert.strictEqual(merged.decisions.length, 2);
	assert.strictEqual(merged.iterations, 1);
	assert.strictEqual(merged.coveragePct, 0.6);
	assert.strictEqual(merged.confidence, 0.7);
	console.log('  ✓ initial merge sets counts + decisions');
}

function testMemoryMergeOverridesSameNode() {
	let mem = buildInitialHubCurationMemory();
	mem = mergeSubmitIntoMemory(mem, makeSubmit({
		hubs: [
			{ nodeId: 'n1', hubPath: 'p1', action: 'create', scope: { communityIds: [], memberNodeIds: [] }, reason: 'first' },
		],
	}));
	assert.strictEqual(mem.decisions[0].reason, 'first');
	assert.strictEqual(mem.decisions[0].action, 'create');

	mem = mergeSubmitIntoMemory(mem, makeSubmit({
		hubs: [
			{ nodeId: 'n1', hubPath: 'p1', action: 'retire', scope: { communityIds: [], memberNodeIds: [] }, reason: 'revised' },
			{ nodeId: 'n2', hubPath: 'p2', action: 'create', scope: { communityIds: [], memberNodeIds: [] }, reason: 'added' },
		],
	}));
	assert.strictEqual(mem.decisions.length, 2, 'n1 replaced not duplicated');
	const n1 = mem.decisions.find((d) => d.nodeId === 'n1')!;
	assert.strictEqual(n1.action, 'retire');
	assert.strictEqual(n1.reason, 'revised');
	assert.strictEqual(mem.iterations, 2);
	console.log('  ✓ same-node submits override prior');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
