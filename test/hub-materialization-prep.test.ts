// HubMaterializationAgent prep formulas + user-owned skip + user-preserved read.
// Covers: core/fringe split at ⌈√N⌉ clamped to [3, 12], tag aggregation limit,
// isUserOwned flag propagation.

import assert from 'assert';
import {
	coreCountFor,
	prepareHubMaterializationContext,
} from '@/service/agents/hub-materialization-helper/hubMaterializationPrep';
import type { HubMaterializationVaultReaderPort } from '@/service/agents/hub-materialization-helper/types';
import type { VaultHubDocWritePort } from '@/core/ports/HubGenerationPorts';

async function main() {
	testCoreCountFormula();
	await testPrepClassifiesCoreVsFringe();
	await testPrepPropagatesUserOwned();
	await testPrepReturnsEmptyMembersOnEmptyScope();
	console.log('hub-materialization-prep: ok');
}

function testCoreCountFormula() {
	assert.strictEqual(coreCountFor(0), 0, 'zero members → 0 core');
	assert.strictEqual(coreCountFor(1), 3, 'small members clamped to min 3');
	assert.strictEqual(coreCountFor(9), 3, 'ceil(sqrt(9))=3 within min');
	assert.strictEqual(coreCountFor(16), 4, 'sqrt(16)=4');
	assert.strictEqual(coreCountFor(100), 10, 'sqrt(100)=10');
	assert.strictEqual(coreCountFor(200), 12, 'clamp max 12');
	console.log('  ✓ coreCountFor formula');
}

const fakeMobiusNodeRepo = {
	async getDocumentNodeSignals(nodeId: string) {
		const table: Record<string, {
			node_id: string;
			path: string;
			label: string;
			pagerank: number;
			betweenness_centrality: number;
			community_id: string;
		}> = {
			'n1': { node_id: 'n1', path: 'A.md', label: 'A', pagerank: 0.9, betweenness_centrality: 0.5, community_id: 'c1' },
			'n2': { node_id: 'n2', path: 'B.md', label: 'B', pagerank: 0.7, betweenness_centrality: 0.3, community_id: 'c1' },
			'n3': { node_id: 'n3', path: 'C.md', label: 'C', pagerank: 0.5, betweenness_centrality: 0.2, community_id: 'c1' },
			'n4': { node_id: 'n4', path: 'D.md', label: 'D', pagerank: 0.3, betweenness_centrality: 0.1, community_id: 'c1' },
			'n5': { node_id: 'n5', path: 'E.md', label: 'E', pagerank: 0.1, betweenness_centrality: 0.05, community_id: 'c1' },
		};
		return table[nodeId] ?? null;
	},
} as any;

const stubReader: HubMaterializationVaultReaderPort = {
	async readTitle(p) { return `Title-${p}`; },
	async readExcerpt(p) { return `Excerpt of ${p}`; },
	async readTags(p) { return p === 'A.md' ? ['shared', 'a-tag'] : p === 'B.md' ? ['shared', 'b-tag'] : ['shared']; },
};

function makeWritePort(overrides: Partial<VaultHubDocWritePort> = {}): VaultHubDocWritePort {
	return {
		async read() { return null; },
		async readPeakUserOwned() { return false; },
		async extractUserPreservedContent() { return ''; },
		async writeHubDoc() { /* no-op */ },
		...overrides,
	} as VaultHubDocWritePort;
}

async function testPrepClassifiesCoreVsFringe() {
	const prep = await prepareHubMaterializationContext({
		decision: {
			nodeId: 'n1',
			hubPath: 'AI Hub/c1.md',
			action: 'keep',
			scope: { communityIds: ['c1'], memberNodeIds: ['n1', 'n2', 'n3', 'n4', 'n5'] },
			reason: 'test',
		},
		planId: 'plan-1',
		vaultName: 'TestVault',
		budget: { maxCritiqueIterations: 2 },
		deps: {
			mobiusNodeRepo: fakeMobiusNodeRepo,
			vaultReader: stubReader,
			vaultWritePort: makeWritePort(),
		},
	});
	assert.strictEqual(prep.members.length, 5);
	// coreCountFor(5) → ceil(sqrt(5)) = 3, clamped-min 3
	const core = prep.members.filter((m) => m.role === 'core');
	assert.strictEqual(core.length, 3);
	// core[0] should be n1 (highest pagerank+betweenness)
	assert.strictEqual(core[0].nodeId, 'n1');
	assert.strictEqual(prep.aggregatedTags[0].tag, 'shared');
	assert.strictEqual(prep.aggregatedTags[0].count, 5);
	assert.strictEqual(prep.isUserOwned, false);
	console.log('  ✓ classifies core/fringe + aggregates tags');
}

async function testPrepPropagatesUserOwned() {
	const prep = await prepareHubMaterializationContext({
		decision: {
			nodeId: 'n1',
			hubPath: 'AI Hub/c1.md',
			action: 'keep',
			scope: { communityIds: ['c1'], memberNodeIds: ['n1'] },
			reason: 'test',
		},
		planId: 'plan-1',
		vaultName: 'TestVault',
		budget: { maxCritiqueIterations: 2 },
		deps: {
			mobiusNodeRepo: fakeMobiusNodeRepo,
			vaultReader: stubReader,
			vaultWritePort: makeWritePort({
				async readPeakUserOwned() { return true; },
				async extractUserPreservedContent() { return '## User notes\nkept here'; },
			}),
		},
	});
	assert.strictEqual(prep.isUserOwned, true);
	assert.ok(prep.existingUserContent.includes('User notes'));
	console.log('  ✓ propagates peak_user_owned + preserves user content');
}

async function testPrepReturnsEmptyMembersOnEmptyScope() {
	const prep = await prepareHubMaterializationContext({
		decision: {
			nodeId: 'n1',
			hubPath: 'AI Hub/c1.md',
			action: 'keep',
			scope: { communityIds: [], memberNodeIds: [] },
			reason: 'test',
		},
		planId: 'plan-1',
		vaultName: 'TestVault',
		budget: { maxCritiqueIterations: 1 },
		deps: {
			mobiusNodeRepo: fakeMobiusNodeRepo,
			vaultReader: stubReader,
			vaultWritePort: makeWritePort(),
		},
	});
	assert.strictEqual(prep.members.length, 0);
	assert.strictEqual(prep.aggregatedTags.length, 0);
	console.log('  ✓ empty scope → empty members');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
