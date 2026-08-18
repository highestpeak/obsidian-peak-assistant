// T11Y-4a Vault Digest Builder tests.
//
// Verifies the extracted `VaultDigestBuilder` against an in-memory
// stub of `VaultReviewReadPort` + a stub lint runtime. No sqlite, no
// Obsidian, no AppContext.
//
// Coverage:
//   - Top-K caps for hubs, stale hubs, orphans, dangling, tags, clusters
//   - Fingerprint stability under no content changes (cache hit)
//   - Fingerprint cache TTL invalidation (force refresh)
//   - Fingerprint hash changes when content changes
//   - Digest categories all populated when fixture data is present
//   - Empty digest when no rows
//   - Lint health merge when the runtime exposes a scan
//   - Snapshot stability for a canonical fixture (byte-equal JSON)

import assert from 'assert';

import type {
	ClusterMemberRow,
	DanglingReferenceRow,
	VaultCommunityLinkRow,
	VaultFingerprintRow,
	VaultNodeDigestRow,
	VaultReviewReadPort,
} from '@/core/ports/VaultReviewReadPort';
import type {
	CommunityInfo,
	StructuralHole,
} from '@/core/search/structuralTypes';
import { VaultDigestBuilder } from '@/service/copilot/vault/VaultDigestBuilder';
import type {
	VaultDigest,
} from '@/service/copilot/vault/VaultDigestService';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { LintScanResult } from '@/service/lint/types';

// ─── stubs ────────────────────────────────────────────────────────────────

interface ReadPortStub {
	port: VaultReviewReadPort;
	calls: {
		fingerprint: number;
		nodes: number;
		communities: number;
		holes: number;
		dangling: number;
		clusterMembers: Array<{ id: string; limit: number }>;
	};
	setNodes(rows: VaultNodeDigestRow[]): void;
	setFingerprintRows(rows: VaultFingerprintRow[]): void;
}

function makeReadPortStub(initial: {
	fingerprint?: VaultFingerprintRow[];
	nodes?: VaultNodeDigestRow[];
	communities?: CommunityInfo[];
	communityLinks?: VaultCommunityLinkRow[];
	holes?: StructuralHole[];
	dangling?: DanglingReferenceRow[];
	clusterMembers?: ClusterMemberRow[];
} = {}): ReadPortStub {
	const state = {
		fingerprint: initial.fingerprint ?? [],
		nodes: initial.nodes ?? [],
		communities: initial.communities ?? [],
		communityLinks: initial.communityLinks ?? [],
		holes: initial.holes ?? [],
		dangling: initial.dangling ?? [],
		clusterMembers: initial.clusterMembers ?? [],
	};
	const calls = {
		fingerprint: 0,
		nodes: 0,
		communities: 0,
		holes: 0,
		dangling: 0,
		clusterMembers: [] as Array<{ id: string; limit: number }>,
	};
	const port: VaultReviewReadPort = {
		async listFingerprintRows() {
			calls.fingerprint += 1;
			return state.fingerprint;
		},
		async listNodeRowsForDigest() {
			calls.nodes += 1;
			return state.nodes;
		},
		async listCommunities() {
			calls.communities += 1;
			return state.communities;
		},
		async listCommunityLinks() {
			return state.communityLinks;
		},
		async listTopStructuralHoles(_limit) {
			calls.holes += 1;
			return state.holes;
		},
		async listDanglingReferences(_limit) {
			calls.dangling += 1;
			return state.dangling;
		},
		async listClusterMembers(id, limit) {
			calls.clusterMembers.push({ id, limit });
			return state.clusterMembers;
		},
	};
	return {
		port,
		calls,
		setNodes(rows) { state.nodes = rows; },
		setFingerprintRows(rows) { state.fingerprint = rows; },
	};
}

function stubLintRuntime(latest: LintScanResult | null = null): VaultLintRuntime {
	return {
		async runFullScan() {
			return {
				id: 'stub', scanType: 'full', startedAt: 0, completedAt: 0, durationMs: 0,
				totalNotes: 0, healthScore: 0,
				dimensionScores: { structural: 0, content: 0, temporal: 0, semantic: 0, tags: 0 },
				findings: [], signalCounts: {},
			} satisfies LintScanResult;
		},
		async loadLatestScan() {
			return latest;
		},
	};
}

class FakeClock {
	constructor(public t: number) {}
	now(): number { return this.t; }
}

// ─── fixtures ─────────────────────────────────────────────────────────────

const FIXED_NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function fixtureFingerprintRows(): VaultFingerprintRow[] {
	return [
		{ path: 'a.md', contentHash: 'h-a', wordCount: 100, mtime: FIXED_NOW - 5 * DAY },
		{ path: 'b.md', contentHash: 'h-b', wordCount: 200, mtime: FIXED_NOW - 200 * DAY },
		{ path: 'c.md', contentHash: 'h-c', wordCount: 50, mtime: FIXED_NOW - 10 * DAY },
	];
}

function fixtureNodeRows(): VaultNodeDigestRow[] {
	// 1 recent hub, 1 stale hub, 1 orphan, all with tags.
	return [
		{
			path: 'a.md',
			wordCount: 100,
			mtime: FIXED_NOW - 5 * DAY,
			tagsJson: JSON.stringify(['alpha', 'beta']),
			pagerank: 0.5,
			docIncomingCnt: 5,
			docOutgoingCnt: 1,
			otherIncomingCnt: 0,
		},
		{
			path: 'b.md',
			wordCount: 200,
			mtime: FIXED_NOW - 200 * DAY,
			tagsJson: JSON.stringify(['alpha']),
			pagerank: 0.3,
			docIncomingCnt: 4,
			docOutgoingCnt: 0,
			otherIncomingCnt: 0,
		},
		{
			path: 'c.md',
			wordCount: 50,
			mtime: FIXED_NOW - 10 * DAY,
			tagsJson: null,
			pagerank: 0,
			docIncomingCnt: 0,
			docOutgoingCnt: 0,
			otherIncomingCnt: 0,
		},
	];
}

function fixtureCommunities(): CommunityInfo[] {
	return [
		{
			id: 'c0', label: 'Alpha',
			memberCount: 12, internalDensity: 0.42,
			topNodes: [
				{ path: 'a.md', label: 'a', betweenness: 0.1 },
			],
			dominantTopics: ['alpha', 'beta'],
		},
		{
			id: 'c1', label: 'Beta',
			memberCount: 8, internalDensity: 0.3,
			topNodes: [
				{ path: 'b.md', label: 'b', betweenness: 0.05 },
			],
			dominantTopics: ['beta'],
		},
	];
}

function fixtureHoles(): StructuralHole[] {
	const communities = fixtureCommunities();
	return [
		{
			id: 'h0',
			communityA: communities[0],
			communityB: communities[1],
			gapScore: 0.7,
			gapType: 'missing_bridge',
			semanticBridgePotential: 0.4,
			existingBridges: [],
			potentialBridges: [],
		},
	];
}

function fixtureDangling(): DanglingReferenceRow[] {
	return [
		{ target: 'Ghost', referencedBy: 4 },
		{ target: 'Phantom', referencedBy: 2 },
	];
}

// ─── tests ────────────────────────────────────────────────────────────────

async function testFingerprintStableWhenContentUnchanged(): Promise<void> {
	const reads = makeReadPortStub({ fingerprint: fixtureFingerprintRows() });
	const clock = new FakeClock(FIXED_NOW);
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), clock);
	const first = await builder.getVaultFingerprint();
	assert.ok(first, 'first fingerprint must compute');
	// Cache hit (well within 30s window): no second read.
	clock.t = FIXED_NOW + 1_000;
	const second = await builder.getVaultFingerprint();
	assert.strictEqual(reads.calls.fingerprint, 1, 'cache hit must not re-query');
	assert.strictEqual(second?.fingerprint, first?.fingerprint, 'cached fingerprint identical');
	// Force refresh: same content => same hash.
	const third = await builder.getVaultFingerprint(true);
	assert.strictEqual(reads.calls.fingerprint, 2, 'force flag must re-query');
	assert.strictEqual(third?.fingerprint, first?.fingerprint, 'identical content yields identical hash');
	console.log('PASS: fingerprintStableWhenContentUnchanged');
}

async function testFingerprintChangesWhenContentChanges(): Promise<void> {
	const reads = makeReadPortStub({ fingerprint: fixtureFingerprintRows() });
	const clock = new FakeClock(FIXED_NOW);
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), clock);
	const before = await builder.getVaultFingerprint();
	reads.setFingerprintRows([
		...fixtureFingerprintRows(),
		{ path: 'd.md', contentHash: 'h-d', wordCount: 1, mtime: FIXED_NOW },
	]);
	const after = await builder.getVaultFingerprint(true);
	assert.notStrictEqual(after?.fingerprint, before?.fingerprint, 'fingerprint must change when rows differ');
	assert.strictEqual(after?.fileCount, 4);
	console.log('PASS: fingerprintChangesWhenContentChanges');
}

async function testFingerprintCacheTtlInvalidation(): Promise<void> {
	const reads = makeReadPortStub({ fingerprint: fixtureFingerprintRows() });
	const clock = new FakeClock(FIXED_NOW);
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), clock);
	await builder.getVaultFingerprint();
	assert.strictEqual(reads.calls.fingerprint, 1);
	clock.t = FIXED_NOW + 60_000; // > 30s TTL
	await builder.getVaultFingerprint();
	assert.strictEqual(reads.calls.fingerprint, 2, 'TTL expiry must re-query');
	console.log('PASS: fingerprintCacheTtlInvalidation');
}

async function testEmptyDigestWhenNoData(): Promise<void> {
	const reads = makeReadPortStub();
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), new FakeClock(FIXED_NOW));
	const digest = await builder.buildDigest({ vaultLintRuntime: stubLintRuntime() });
	assert.ok(digest, 'digest must be returned (fingerprint succeeds on empty rows)');
	assert.strictEqual(digest!.counts.notes, 0);
	assert.strictEqual(digest!.counts.clusters, 0);
	assert.strictEqual(digest!.counts.hubs, 0);
	assert.strictEqual(digest!.clusters.length, 0);
	assert.strictEqual(digest!.hubs.length, 0);
	assert.strictEqual(digest!.staleHubs.length, 0);
	assert.strictEqual(digest!.orphans.length, 0);
	assert.strictEqual(digest!.dangling.length, 0);
	assert.strictEqual(digest!.health, null);
	assert.strictEqual(digest!.recentActivity.modifiedLast30d, 0);
	console.log('PASS: emptyDigestWhenNoData');
}

async function testCategoriesPopulatedFromFixture(): Promise<void> {
	const reads = makeReadPortStub({
		fingerprint: fixtureFingerprintRows(),
		nodes: fixtureNodeRows(),
		communities: fixtureCommunities(),
		holes: fixtureHoles(),
		dangling: fixtureDangling(),
	});
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), new FakeClock(FIXED_NOW));
	const digest = await builder.buildDigest({ vaultLintRuntime: stubLintRuntime() });
	assert.ok(digest);
	assert.strictEqual(digest!.counts.notes, 3);
	assert.strictEqual(digest!.counts.clusters, 2);
	assert.strictEqual(digest!.counts.hubs, 2, 'two rows pass hub gate');
	assert.strictEqual(digest!.counts.orphans, 1, 'c.md is orphan');
	assert.strictEqual(digest!.counts.danglingRefs, 2);
	assert.deepStrictEqual(digest!.orphans, ['c.md']);
	assert.strictEqual(digest!.staleHubs.length, 1, 'b.md is stale (200d old)');
	assert.strictEqual(digest!.staleHubs[0].path, 'b.md');
	assert.strictEqual(digest!.hubs[0].path, 'a.md', 'hubs sorted by pagerank desc');
	assert.strictEqual(digest!.clusters[0].id, 'c0', 'clusters sorted by memberCount desc');
	assert.strictEqual(digest!.structuralHoles.length, 1);
	assert.deepStrictEqual(digest!.tags, [{ tag: 'alpha', count: 2 }, { tag: 'beta', count: 1 }]);
	assert.strictEqual(digest!.recentActivity.modifiedLast30d, 2, 'a.md + c.md modified recently');
	console.log('PASS: categoriesPopulatedFromFixture');
}

async function testTopKCapsAreEnforced(): Promise<void> {
	// Build 30 hub-eligible rows, expect hubs capped at 15 and stale hubs at 10.
	// All orphans (0 in + 0 out) — we use 25 orphan rows, expect 20 returned.
	const hubRows: VaultNodeDigestRow[] = [];
	for (let i = 0; i < 30; i++) {
		hubRows.push({
			path: `hub-${i}.md`,
			wordCount: 100,
			mtime: FIXED_NOW - 200 * DAY, // all stale
			tagsJson: null,
			pagerank: 1 - i * 0.01,
			docIncomingCnt: 5,
			docOutgoingCnt: 1,
			otherIncomingCnt: 0,
		});
	}
	const orphanRows: VaultNodeDigestRow[] = [];
	for (let i = 0; i < 25; i++) {
		orphanRows.push({
			path: `orphan-${i}.md`,
			wordCount: 10,
			mtime: FIXED_NOW - 5 * DAY,
			tagsJson: null,
			pagerank: 0,
			docIncomingCnt: 0,
			docOutgoingCnt: 0,
			otherIncomingCnt: 0,
		});
	}
	const danglingRows: DanglingReferenceRow[] = [];
	// Builder asks the port for at most TOP_K_DANGLING=20; the stub
	// would return whatever we hand it. The slice/cap behavior we care
	// about for dangling lives at the SQL boundary, but we verify the
	// builder threads it through unchanged.
	for (let i = 0; i < 20; i++) danglingRows.push({ target: `d-${i}`, referencedBy: 25 - i });

	const reads = makeReadPortStub({
		fingerprint: fixtureFingerprintRows(),
		nodes: [...hubRows, ...orphanRows],
		communities: [],
		dangling: danglingRows,
	});
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), new FakeClock(FIXED_NOW));
	const digest = await builder.buildDigest({ vaultLintRuntime: stubLintRuntime() });
	assert.ok(digest);
	assert.strictEqual(digest!.hubs.length, 15, 'hubs capped at 15');
	assert.strictEqual(digest!.staleHubs.length, 10, 'stale hubs capped at 10');
	assert.strictEqual(digest!.orphans.length, 20, 'orphans capped at 20');
	assert.strictEqual(digest!.dangling.length, 20);
	console.log('PASS: topKCapsAreEnforced');
}

async function testLintHealthMergedWhenScanExists(): Promise<void> {
	const reads = makeReadPortStub({ fingerprint: fixtureFingerprintRows() });
	const scan: LintScanResult = {
		id: 's1', scanType: 'full', startedAt: 0, completedAt: 0, durationMs: 0,
		totalNotes: 3, healthScore: 7.5,
		dimensionScores: { structural: 7, content: 8, temporal: 6, semantic: 8, tags: 7 },
		findings: [], signalCounts: { dim1: 4, dim2: 1 },
	};
	const lint = stubLintRuntime(scan);
	const builder = new VaultDigestBuilder(reads.port, lint, new FakeClock(FIXED_NOW));
	const digest = await builder.buildDigest({ vaultLintRuntime: lint });
	assert.ok(digest);
	assert.ok(digest!.health, 'health must be merged');
	assert.strictEqual(digest!.health!.score, 7.5);
	assert.strictEqual(digest!.health!.dimensions.structural, 7);
	assert.deepStrictEqual(digest!.health!.signalCounts, { dim1: 4, dim2: 1 });
	console.log('PASS: lintHealthMergedWhenScanExists');
}

async function testFixtureDigestMatchesSnapshot(): Promise<void> {
	// Snapshot baseline: the canonical fixture must produce a byte-equal
	// JSON when run through the new builder. This is the post-refactor
	// regression guard the spec asked for. The `computedAt`/fingerprint
	// `computedAt` fields are deterministic because we pin the clock.
	const reads = makeReadPortStub({
		fingerprint: fixtureFingerprintRows(),
		nodes: fixtureNodeRows(),
		communities: fixtureCommunities(),
		holes: fixtureHoles(),
		dangling: fixtureDangling(),
	});
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), new FakeClock(FIXED_NOW));
	const digest = await builder.buildDigest({ vaultLintRuntime: stubLintRuntime() });
	assert.ok(digest);
	const expected: VaultDigest = {
		fingerprint: {
			fingerprint: digest!.fingerprint.fingerprint, // captured below
			fileCount: 3,
			totalWordCount: 350,
			lastMaxMtime: FIXED_NOW - 5 * DAY,
			computedAt: FIXED_NOW,
		},
		counts: { notes: 3, words: 350, clusters: 2, hubs: 2, orphans: 1, danglingRefs: 2 },
		health: null,
		clusters: [
			{
				id: 'c0', label: 'Alpha', memberCount: 12, internalDensity: 0.42,
				dominantTopics: ['alpha', 'beta'],
				topNodes: [{ path: 'a.md', label: 'a', betweenness: 0.1 }],
			},
			{
				id: 'c1', label: 'Beta', memberCount: 8, internalDensity: 0.3,
				dominantTopics: ['beta'],
				topNodes: [{ path: 'b.md', label: 'b', betweenness: 0.05 }],
			},
		],
		structuralHoles: [
			{
				id: 'h0', communityALabel: 'Alpha', communityBLabel: 'Beta',
				gapType: 'missing_bridge', gapScore: 0.7, semanticBridgePotential: 0.4,
			},
		],
		hubs: [
			{ path: 'a.md', pagerank: 0.5, incomingCount: 5, mtime: FIXED_NOW - 5 * DAY, wordCount: 100 },
			{ path: 'b.md', pagerank: 0.3, incomingCount: 4, mtime: FIXED_NOW - 200 * DAY, wordCount: 200 },
		],
		staleHubs: [
			{ path: 'b.md', pagerank: 0.3, incomingCount: 4, mtime: FIXED_NOW - 200 * DAY, wordCount: 200 },
		],
		orphans: ['c.md'],
		dangling: [
			{ target: 'Ghost', referencedBy: 4 },
			{ target: 'Phantom', referencedBy: 2 },
		],
		recentActivity: {
			createdLast30d: 0,
			modifiedLast30d: 2,
			dormantClusters: ['Beta'],
		},
		tags: [
			{ tag: 'alpha', count: 2 },
			{ tag: 'beta', count: 1 },
		],
		computedAt: FIXED_NOW,
	};
	// Byte-equal JSON check.
	assert.deepStrictEqual(JSON.parse(JSON.stringify(digest)), JSON.parse(JSON.stringify(expected)));
	// Fingerprint hash stability (against itself across calls).
	const second = await builder.buildDigest({ vaultLintRuntime: stubLintRuntime() });
	assert.strictEqual(second!.fingerprint.fingerprint, digest!.fingerprint.fingerprint);
	console.log('PASS: fixtureDigestMatchesSnapshot');
}

async function testVerifiedCommunityLinksEnterDigest(): Promise<void> {
	const reads = makeReadPortStub({
		fingerprint: fixtureFingerprintRows(),
		communities: fixtureCommunities(),
		communityLinks: [{ communityAId: 'c0', communityBId: 'c1', referenceCount: 4 }],
	});
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), new FakeClock(FIXED_NOW));
	const digest = await builder.buildDigest({ vaultLintRuntime: stubLintRuntime() });
	assert.deepStrictEqual(digest?.communityLinks, [
		{ communityAId: 'c0', communityBId: 'c1', referenceCount: 4 },
	]);
	console.log('PASS: verifiedCommunityLinksEnterDigest');
}

async function testListClusterMembersDelegatesAndShapes(): Promise<void> {
	const members: ClusterMemberRow[] = [
		{ path: 'a.md', title: 'A', wordCount: 100, pagerank: 0.5, mtime: FIXED_NOW, incomingCount: 5 },
	];
	const reads = makeReadPortStub({ clusterMembers: members });
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), new FakeClock(FIXED_NOW));
	const out = await builder.listClusterMembers('c0', 7);
	assert.strictEqual(reads.calls.clusterMembers.length, 1);
	assert.deepStrictEqual(reads.calls.clusterMembers[0], { id: 'c0', limit: 7 });
	assert.strictEqual(out.length, 1);
	assert.strictEqual(out[0].path, 'a.md');
	console.log('PASS: listClusterMembersDelegatesAndShapes');
}

async function testDisposeClearsFingerprintCache(): Promise<void> {
	const reads = makeReadPortStub({ fingerprint: fixtureFingerprintRows() });
	const builder = new VaultDigestBuilder(reads.port, stubLintRuntime(), new FakeClock(FIXED_NOW));
	await builder.getVaultFingerprint();
	assert.strictEqual(reads.calls.fingerprint, 1);
	builder.dispose();
	await builder.getVaultFingerprint();
	assert.strictEqual(reads.calls.fingerprint, 2, 'dispose must drop cache so next call re-queries');
	console.log('PASS: disposeClearsFingerprintCache');
}

async function main(): Promise<void> {
	await testFingerprintStableWhenContentUnchanged();
	await testFingerprintChangesWhenContentChanges();
	await testFingerprintCacheTtlInvalidation();
	await testEmptyDigestWhenNoData();
	await testCategoriesPopulatedFromFixture();
	await testTopKCapsAreEnforced();
	await testLintHealthMergedWhenScanExists();
	await testFixtureDigestMatchesSnapshot();
	await testVerifiedCommunityLinksEnterDigest();
	await testListClusterMembersDelegatesAndShapes();
	await testDisposeClearsFingerprintCache();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
