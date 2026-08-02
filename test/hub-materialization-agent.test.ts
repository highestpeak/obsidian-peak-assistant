// HubMaterializationAgent end-to-end (with mocked LLM + vault ports).
// Verifies: user-owned skip short-circuits; happy-path writes to vaultWritePort;
// empty-scope returns 'failed' with no-members-in-scope.

import assert from 'assert';
import { HubMaterializationAgent } from '@/service/agents/HubMaterializationAgent';
import type { HubCurationDecision } from '@/core/schemas/agents/hubCuration';
import type { HubDraft, HubCritique } from '@/core/schemas/agents/hubMaterialization';
import type { HubMaterializationPrepContext } from '@/service/agents/hub-materialization-helper/types';

async function main() {
	await testHappyPath();
	await testVirtualFirstPath();
	await testUserOwnedSkips();
	await testEmptyScopeFails();
	console.log('hub-materialization-agent: ok');
}

const draft: HubDraft = {
	title: 'Concept Hub',
	summary: 'This is the summary.',
	coreConceptSection: 'core',
	structureSection: 'structure',
	evolutionSection: 'evolution',
	openQuestionsSection: 'open',
	entryPointsSection: 'entry',
	referencedMemberIds: ['n1', 'n2'],
};

const critique: HubCritique = {
	retryDraft: false,
	gaps: [],
	overallCoverage: 0.85,
};

function makeAIStub(): any {
	return {
		async queryStructured(promptId: string): Promise<any> {
			if (String(promptId).includes('materialization-draft')) return draft;
			if (String(promptId).includes('materialization-critique')) return critique;
			throw new Error(`unexpected promptId ${promptId}`);
		},
	};
}

function makeTmStub(): any {
	return {
		async render() { return '--- rendered markdown ---'; },
	};
}

function makePrep(overrides: Partial<HubMaterializationPrepContext> = {}): HubMaterializationPrepContext {
	return {
		hubNodeId: 'hub-n',
		hubPath: 'AI Hub/target.md',
		planId: 'plan-1',
		vaultName: 'TV',
		curatorReason: 'test',
		members: [
			{ nodeId: 'n1', path: 'A.md', title: 'A', pagerank: 0.9, betweenness: 0.5, excerpt: '', tags: [], role: 'core' },
			{ nodeId: 'n2', path: 'B.md', title: 'B', pagerank: 0.5, betweenness: 0.2, excerpt: '', tags: [], role: 'fringe' },
		],
		aggregatedTags: [],
		aggregatedSemanticKeywords: [],
		existingUserContent: '',
		isUserOwned: false,
		budget: { maxCritiqueIterations: 2 },
		...overrides,
	};
}

async function testHappyPath() {
	const written: Array<{ path: string; markdown: string }> = [];
	const agent = new HubMaterializationAgent({
		aiServiceManager: makeAIStub(),
		templateManager: makeTmStub(),
		mobiusNodeRepo: {} as any,
		vaultReader: {} as any,
		vaultWritePort: {
			async read() { return null; },
			async readPeakUserOwned() { return false; },
			async extractUserPreservedContent() { return ''; },
			async writeHubDoc(path: string, markdown: string) { written.push({ path, markdown }); },
		} as any,
	});

	const decision: HubCurationDecision = {
		nodeId: 'hub-n',
		hubPath: 'AI Hub/target.md',
		action: 'keep',
		scope: { communityIds: [], memberNodeIds: ['n1', 'n2'] },
		reason: 'test',
	};

	const result = await agent.run({
		decision,
		planId: 'plan-1',
		trigger: 'manual',
		materializeMarkdown: true,
		prepOverride: makePrep(),
	});

	assert.strictEqual(result.status, 'written');
	assert.strictEqual(result.hubPath, 'AI Hub/target.md');
	assert.strictEqual(result.coverage, 0.85);
	assert.strictEqual(written.length, 1);
	assert.strictEqual(written[0].path, 'AI Hub/target.md');
	console.log('  ✓ happy path writes to vault with critique coverage');
}

async function testVirtualFirstPath() {
	const written: Array<{ path: string; markdown: string }> = [];
	const agent = new HubMaterializationAgent({
		aiServiceManager: makeAIStub(),
		templateManager: makeTmStub(),
		mobiusNodeRepo: {} as any,
		vaultReader: {} as any,
		vaultWritePort: {
			async read() { return null; },
			async readPeakUserOwned() { return false; },
			async extractUserPreservedContent() { return ''; },
			async writeHubDoc(path: string, markdown: string) { written.push({ path, markdown }); },
		} as any,
	});
	const result = await agent.run({
		decision: {
			nodeId: 'hub-n',
			hubPath: 'Hub-Summaries/target.md',
			action: 'keep',
			scope: { communityIds: [], memberNodeIds: ['n1', 'n2'] },
			reason: 'test',
		},
		planId: 'plan-1',
		trigger: 'scheduled',
		prepOverride: makePrep(),
	});
	assert.strictEqual(result.status, 'virtualized');
	assert.strictEqual(written.length, 0);
	console.log('  ✓ scheduled path updates the virtual record without Markdown');
}

async function testUserOwnedSkips() {
	const written: Array<{ path: string }> = [];
	const agent = new HubMaterializationAgent({
		aiServiceManager: makeAIStub(),
		templateManager: makeTmStub(),
		mobiusNodeRepo: {} as any,
		vaultReader: {} as any,
		vaultWritePort: {
			async read() { return null; },
			async readPeakUserOwned() { return true; },
			async extractUserPreservedContent() { return ''; },
			async writeHubDoc(path: string) { written.push({ path }); },
		} as any,
	});

	const decision: HubCurationDecision = {
		nodeId: 'hub-n',
		hubPath: 'AI Hub/user-owned.md',
		action: 'keep',
		scope: { communityIds: [], memberNodeIds: ['n1'] },
		reason: 'test',
	};

	const result = await agent.run({
		decision,
		planId: 'plan-1',
		trigger: 'manual',
		materializeMarkdown: true,
		prepOverride: makePrep({ isUserOwned: true, hubPath: 'AI Hub/user-owned.md' }),
	});

	assert.strictEqual(result.status, 'skipped-user-owned');
	assert.strictEqual(written.length, 0);
	console.log('  ✓ user-owned skip short-circuits');
}

async function testEmptyScopeFails() {
	const agent = new HubMaterializationAgent({
		aiServiceManager: makeAIStub(),
		templateManager: makeTmStub(),
		mobiusNodeRepo: {} as any,
		vaultReader: {} as any,
		vaultWritePort: {
			async read() { return null; },
			async readPeakUserOwned() { return false; },
			async extractUserPreservedContent() { return ''; },
			async writeHubDoc() { /* no */ },
		} as any,
	});

	const decision: HubCurationDecision = {
		nodeId: 'hub-n',
		hubPath: 'AI Hub/empty.md',
		action: 'keep',
		scope: { communityIds: [], memberNodeIds: [] },
		reason: 'test',
	};

	const result = await agent.run({
		decision,
		planId: 'plan-1',
		trigger: 'manual',
		prepOverride: makePrep({ members: [] }),
	});

	assert.strictEqual(result.status, 'failed');
	assert.strictEqual(result.error, 'no-members-in-scope');
	console.log('  ✓ empty scope fails with no-members-in-scope');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
