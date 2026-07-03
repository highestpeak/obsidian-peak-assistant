// HubCurationExecutor dispatch coverage: create/keep/merge/retire + user-owned merge conflict.

import assert from 'assert';
import { HubCurationExecutor } from '@/service/agents/hub-curation-helper/HubCurationExecutor';
import type { HubCurationPlanRow } from '@/core/storage/sqlite/repositories/HubCurationPlanRepo';

async function main() {
	await testCreateAndKeepDispatchToMaterializer();
	await testMergeArchivesSourcesAndMaterializes();
	await testMergeBlockedByUserOwnedSource();
	await testRetireArchives();
	console.log('hub-curation-executor: ok');
}

function makePlan(decisions: any[]): HubCurationPlanRow {
	return {
		planId: 'p1',
		curatedAt: 1,
		trigger: 'manual',
		coveragePct: 0.5,
		confidence: 0.7,
		iterations: 1,
		totalHubs: decisions.length,
		decisions,
		worldSummary: null,
		executorStatus: 'pending',
		executorError: null,
	};
}

function makeStubMaterializer(runs: Array<{ decisionId: string; status: string }>): any {
	return {
		async run(opts: any) {
			runs.push({ decisionId: opts.decision.nodeId, status: 'written' });
			return {
				status: 'written',
				hubPath: opts.decision.hubPath,
				coverage: 0.8,
				draftIterations: 1,
				gapsRemaining: [],
			};
		},
	};
}

function makeStubPlanRepo() {
	const state: Record<string, string> = {};
	return {
		state,
		async updateExecutorStatus(id: string, status: string, err?: string) { state[id] = `${status}${err ? ':' + err : ''}`; },
		listRecent: async () => [],
		getById: async () => null,
		insert: async () => {},
		pruneOlderThan: async () => {},
		clearAll: async () => {},
	} as any;
}

function makeStubMobiusRepo(): any {
	return {
		async getDocumentNodeSignals() { return null; },
	};
}

async function testCreateAndKeepDispatchToMaterializer() {
	const runs: Array<{ decisionId: string; status: string }> = [];
	const archived: string[] = [];
	const executor = new HubCurationExecutor({
		materializationAgent: makeStubMaterializer(runs),
		planRepo: makeStubPlanRepo(),
		mobiusNodeRepo: makeStubMobiusRepo(),
		vaultWritePort: { async readPeakUserOwned() { return false; } } as any,
		archivePort: { async archive(p: string) { archived.push(p); return p; } } as any,
	});

	const plan = makePlan([
		{ nodeId: 'n1', hubPath: 'h1.md', action: 'create', scope: { communityIds: [], memberNodeIds: [] }, reason: 'r' },
		{ nodeId: 'n2', hubPath: 'h2.md', action: 'keep', scope: { communityIds: [], memberNodeIds: [] }, reason: 'r' },
	]);
	const result = await executor.execute(plan);
	assert.strictEqual(runs.length, 2);
	assert.strictEqual(result.completedCount, 2);
	assert.strictEqual(archived.length, 0);
	console.log('  ✓ create + keep both call materializer');
}

async function testMergeArchivesSourcesAndMaterializes() {
	const runs: Array<{ decisionId: string; status: string }> = [];
	const archived: string[] = [];
	const executor = new HubCurationExecutor({
		materializationAgent: makeStubMaterializer(runs),
		planRepo: makeStubPlanRepo(),
		mobiusNodeRepo: makeStubMobiusRepo(),
		vaultWritePort: { async readPeakUserOwned() { return false; } } as any,
		archivePort: { async archive(p: string) { archived.push(p); return p; } } as any,
	});

	const plan = makePlan([
		{
			nodeId: 'survivor',
			hubPath: 'merged.md',
			action: 'merge',
			scope: { communityIds: [], memberNodeIds: [] },
			reason: 'combine',
			mergeSourceHubs: ['src-a.md', 'src-b.md'],
		},
	]);
	const result = await executor.execute(plan);
	assert.deepStrictEqual(archived.sort(), ['src-a.md', 'src-b.md']);
	assert.strictEqual(runs.length, 1);
	assert.strictEqual(result.decisions[0].outcome, 'merged');
	console.log('  ✓ merge archives sources then materializes survivor');
}

async function testMergeBlockedByUserOwnedSource() {
	const runs: Array<{ decisionId: string; status: string }> = [];
	const archived: string[] = [];
	const executor = new HubCurationExecutor({
		materializationAgent: makeStubMaterializer(runs),
		planRepo: makeStubPlanRepo(),
		mobiusNodeRepo: makeStubMobiusRepo(),
		vaultWritePort: {
			async readPeakUserOwned(p: string) { return p === 'src-a.md'; },
		} as any,
		archivePort: { async archive(p: string) { archived.push(p); return p; } } as any,
	});

	const plan = makePlan([
		{
			nodeId: 'survivor',
			hubPath: 'merged.md',
			action: 'merge',
			scope: { communityIds: [], memberNodeIds: [] },
			reason: 'combine',
			mergeSourceHubs: ['src-a.md', 'src-b.md'],
		},
	]);
	const result = await executor.execute(plan);
	assert.strictEqual(result.decisions[0].outcome, 'merge-blocked');
	assert.strictEqual(runs.length, 0, 'no materializer call when merge blocked');
	assert.strictEqual(archived.length, 0, 'no archive when merge blocked');
	console.log('  ✓ user-owned merge source blocks the whole merge');
}

async function testRetireArchives() {
	const archived: string[] = [];
	const executor = new HubCurationExecutor({
		materializationAgent: makeStubMaterializer([]),
		planRepo: makeStubPlanRepo(),
		mobiusNodeRepo: makeStubMobiusRepo(),
		vaultWritePort: { async readPeakUserOwned() { return false; } } as any,
		archivePort: { async archive(p: string) { archived.push(p); return `_archive/hub/${p}`; } } as any,
	});
	const plan = makePlan([
		{ nodeId: 'gone', hubPath: 'ghost.md', action: 'retire', scope: { communityIds: [], memberNodeIds: [] }, reason: 'r' },
	]);
	const result = await executor.execute(plan);
	assert.deepStrictEqual(archived, ['ghost.md']);
	assert.strictEqual(result.decisions[0].outcome, 'archived');
	console.log('  ✓ retire archives without materializer');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
