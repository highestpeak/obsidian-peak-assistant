// HubCurationExecutor dispatch coverage: create/keep/merge/retire + user-owned merge conflict.

import assert from 'assert';
import { HubCurationExecutor } from '@/service/agents/hub-curation-helper/HubCurationExecutor';
import type { HubCurationPlanRow } from '@/core/storage/sqlite/repositories/HubCurationPlanRepo';

async function main() {
	await testCreateAndKeepDispatchToMaterializer();
	await testMergeRetiresSourcesWithoutArchivingAndMaterializes();
	await testMergeBlockedByUserOwnedSource();
	await testRetireKeepsMarkdown();
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
	const retiredPaths: string[] = [];
	const retiredIds: string[] = [];
	return {
		retiredPaths,
		retiredIds,
		async run(opts: any) {
			runs.push({ decisionId: opts.decision.nodeId, status: 'virtualized' });
			return {
				status: 'virtualized',
				hubPath: opts.decision.hubPath,
				coverage: 0.8,
				draftIterations: 1,
				gapsRemaining: [],
			};
		},
		async retire(decision: any) { retiredIds.push(decision.nodeId); },
		async retireByPath(path: string) { retiredPaths.push(path); },
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

async function testMergeRetiresSourcesWithoutArchivingAndMaterializes() {
	const runs: Array<{ decisionId: string; status: string }> = [];
	const archived: string[] = [];
	const materializer = makeStubMaterializer(runs);
	const executor = new HubCurationExecutor({
		materializationAgent: materializer,
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
	assert.deepStrictEqual(materializer.retiredPaths.sort(), ['src-a.md', 'src-b.md']);
	assert.deepStrictEqual(archived, [], 'legacy Markdown is never moved by background merge');
	assert.strictEqual(runs.length, 1);
	assert.strictEqual(result.decisions[0].outcome, 'merged');
	console.log('  ✓ merge retires source manifests without moving Markdown');
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

async function testRetireKeepsMarkdown() {
	const archived: string[] = [];
	const materializer = makeStubMaterializer([]);
	const executor = new HubCurationExecutor({
		materializationAgent: materializer,
		planRepo: makeStubPlanRepo(),
		mobiusNodeRepo: makeStubMobiusRepo(),
		vaultWritePort: { async readPeakUserOwned() { return false; } } as any,
		archivePort: { async archive(p: string) { archived.push(p); return `_archive/hub/${p}`; } } as any,
	});
	const plan = makePlan([
		{ nodeId: 'gone', hubPath: 'ghost.md', action: 'retire', scope: { communityIds: [], memberNodeIds: [] }, reason: 'r' },
	]);
	const result = await executor.execute(plan);
	assert.deepStrictEqual(materializer.retiredIds, ['gone']);
	assert.deepStrictEqual(archived, []);
	assert.strictEqual(result.decisions[0].outcome, 'retired');
	console.log('  ✓ retire updates manifest/projection without moving Markdown');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
