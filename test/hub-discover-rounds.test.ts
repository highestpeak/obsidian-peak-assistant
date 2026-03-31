import type { MobiusNodeFolderHubDiscoveryRow } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import type { HubCandidate } from '@/service/search/index/helper/hub';
import {
	compressNestedFolderHubDiscoveryRows,
	computeDocumentHubRepresentativeCandidateLimit,
	computeHubDiscoverBudgets,
	computeHubRankingScore,
	folderHubAdjustedGraphScore,
	folderHubStructuralBroadnessPenalty,
	marginalCoverageGain,
	mergeCandidatesByPriority,
	selectFolderHubDiscoveryRowsWithTopRootQuota,
} from '@/service/search/index/helper/hub/hubDiscover';

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(msg);
}

/** Test helper: single-source provenance; `overrides` may replace any field (e.g. merged hub rows). */
function candidate(overrides: Partial<HubCandidate>): HubCandidate {
	const graphScore = overrides.graphScore ?? 0.5;
	const kind = overrides.sourceKind ?? 'document';
	const m: HubCandidate = {
		nodeId: 'n1',
		path: 'A/test.md',
		label: 'test',
		role: 'authority',
		graphScore,
		stableKey: 'document:A/test.md',
		docIncomingCnt: 0,
		docOutgoingCnt: 0,
		sourceKind: kind,
		sourceKinds: [kind],
		sourceEvidence: [{ kind, graphScore }],
		sourceConsensusScore: 0,
		rankingScore: computeHubRankingScore(graphScore, 0),
		...overrides,
	} as HubCandidate;
	return {
		...m,
		rankingScore: computeHubRankingScore(m.graphScore, m.sourceConsensusScore),
	};
}

function folderHubDiscoveryRow(p: {
	path: string;
	hub_graph_score: number;
	tag_doc_count?: number;
	hub_cohesion_effective_score?: number;
	doc_incoming_cnt?: number;
	doc_outgoing_cnt?: number;
}): MobiusNodeFolderHubDiscoveryRow {
	const gs = p.hub_graph_score;
	return {
		node_id: `id-${p.path}`,
		path: p.path,
		label: p.path.split('/').pop() ?? '',
		tag_doc_count: p.tag_doc_count ?? 10,
		pagerank: 0.001,
		semantic_pagerank: 0.001,
		folder_cohesion_score: 0.2,
		doc_incoming_cnt: p.doc_incoming_cnt ?? 5,
		doc_outgoing_cnt: p.doc_outgoing_cnt ?? 5,
		other_incoming_cnt: 0,
		other_outgoing_cnt: 0,
		hub_physical_authority_score: 0.1,
		hub_organizational_score: 0.5,
		hub_semantic_centrality_score: 0.1,
		hub_cohesion_effective_score: p.hub_cohesion_effective_score ?? 0.15,
		hub_graph_score: gs,
	};
}

function runTests() {
	const gain = marginalCoverageGain(new Set(['a', 'b', 'c']), new Set(['b']));
	assert(Math.abs(gain - 2 / 3) < 1e-6, `expected gain 2/3, got ${gain}`);

	const merged = mergeCandidatesByPriority([
		candidate({ stableKey: 'same', sourceKind: 'cluster', graphScore: 0.2, nodeId: 'cluster-1' }),
		candidate({ stableKey: 'same', sourceKind: 'folder', graphScore: 0.4, nodeId: 'folder-1', path: 'A' }),
		candidate({ stableKey: 'other', sourceKind: 'document', graphScore: 0.8, nodeId: 'doc-2' }),
	]);
	assert(merged.length === 2, `expected 2 merged candidates, got ${merged.length}`);
	const sameMerged = merged.find((x) => x.stableKey === 'same');
	assert(!!sameMerged, 'expected merged row for stableKey same');
	assert(sameMerged!.sourceKind === 'folder', 'folder should win as primary source on same stableKey');
	assert(
		sameMerged!.sourceKinds.includes('folder') && sameMerged!.sourceKinds.includes('cluster'),
		'provenance should union folder + cluster',
	);
	assert(
		Math.abs(sameMerged!.sourceConsensusScore - 0.04) < 1e-6,
		`expected consensus 0.04 for two sources, got ${sameMerged!.sourceConsensusScore}`,
	);
	const sortedByRank = [...merged].sort((a, b) => b.rankingScore - a.rankingScore);
	assert(merged[0]?.stableKey === sortedByRank[0]?.stableKey, 'merged output should stay sorted by ranking score desc');
	assert(merged[0]?.stableKey === 'other', 'highest ranking should be other');

	// Nested folder compression: later parent replaces multiple sibling children (scores tuned so parent wins).
	const nested1 = compressNestedFolderHubDiscoveryRows([
		folderHubDiscoveryRow({ path: 'vault/a/b', hub_graph_score: 0.86, tag_doc_count: 5 }),
		folderHubDiscoveryRow({ path: 'vault/a/c', hub_graph_score: 0.84, tag_doc_count: 5 }),
		folderHubDiscoveryRow({ path: 'vault/a', hub_graph_score: 0.85, tag_doc_count: 50 }),
	]);
	assert(nested1.length === 1 && nested1[0]!.path === 'vault/a', 'parent should replace sibling children');

	// Strong child + parent still has residual docs / structure → keep both (not child-only).
	const nested2 = compressNestedFolderHubDiscoveryRows([
		folderHubDiscoveryRow({ path: 'vault/x', hub_graph_score: 0.4, tag_doc_count: 40 }),
		folderHubDiscoveryRow({ path: 'vault/x/y', hub_graph_score: 0.5, tag_doc_count: 30 }),
	]);
	assert(nested2.length === 2, `expected parent + child kept, got ${nested2.length}`);
	const nested2Paths = new Set(nested2.map((r) => r.path));
	assert(nested2Paths.has('vault/x') && nested2Paths.has('vault/x/y'), 'structural parent coexists with strong child');

	// Hollow parent (tiny residual, no siblings in pool) + dominant child → child_only removes parent.
	const nested3 = compressNestedFolderHubDiscoveryRows([
		folderHubDiscoveryRow({ path: 'vault/shell', hub_graph_score: 0.35, tag_doc_count: 12 }),
		folderHubDiscoveryRow({ path: 'vault/shell/leaf', hub_graph_score: 0.45, tag_doc_count: 11 }),
	]);
	assert(
		nested3.length === 1 && nested3[0]!.path === 'vault/shell/leaf',
		'hollow parent should drop for dominant child only in shell case',
	);

	assert(computeHubDiscoverBudgets(0).limitTotal === 40, 'empty vault uses min cap');
	assert(computeHubDiscoverBudgets(100).limitTotal === 50, 'sqrt-scaled limit above min');
	assert(computeHubDiscoverBudgets(1000).limitTotal === 158, `mid vault: got ${computeHubDiscoverBudgets(1000).limitTotal}`);
	assert(computeHubDiscoverBudgets(50_000).limitTotal === 320, 'large vault hits max cap');

	const smallB = computeHubDiscoverBudgets(0);
	assert(smallB.clusterSeedFetchLimit >= smallB.clusterLimit, 'cluster seed pool should cover cluster output cap');
	assert(smallB.clusterSeedFetchLimit === 58, `min-vault cluster seed fetch: got ${smallB.clusterSeedFetchLimit}`);

	const midB = computeHubDiscoverBudgets(1000);
	assert(midB.clusterSeedFetchLimit >= midB.clusterLimit, 'mid vault seed pool should cover cluster output cap');
	assert(midB.clusterSeedFetchLimit === 120, `mid vault cluster seed fetch clamps: got ${midB.clusterSeedFetchLimit}`);

	const largeB = computeHubDiscoverBudgets(50_000);
	assert(largeB.clusterSeedFetchLimit === 120, `max vault cluster seed fetch: got ${largeB.clusterSeedFetchLimit}`);

	// Structural broad-folder penalty (stats only): heavy + low cohesion penalizes more than small + cohesive.
	const broad = folderHubDiscoveryRow({
		path: 'kb-root/dump',
		hub_graph_score: 0.85,
		tag_doc_count: 200,
		hub_cohesion_effective_score: 0.04,
	});
	const tight = folderHubDiscoveryRow({
		path: 'kb-root/tight',
		hub_graph_score: 0.85,
		tag_doc_count: 12,
		hub_cohesion_effective_score: 0.18,
	});
	const pb = folderHubStructuralBroadnessPenalty(broad);
	const pt = folderHubStructuralBroadnessPenalty(tight);
	assert(pb > pt + 0.01, `expected broad penalty > tight, got ${pb} vs ${pt}`);
	assert(
		folderHubAdjustedGraphScore(tight) > folderHubAdjustedGraphScore(broad),
		'adjusted score should prefer tight folder at same hub_graph_score',
	);

	// Top-root quota: cap per first path segment, then backfill by score.
	const qRows = [
		folderHubDiscoveryRow({ path: 'root-a/a1', hub_graph_score: 0.92 }),
		folderHubDiscoveryRow({ path: 'root-a/a2', hub_graph_score: 0.91 }),
		folderHubDiscoveryRow({ path: 'root-a/a3', hub_graph_score: 0.9 }),
		folderHubDiscoveryRow({ path: 'root-b/b1', hub_graph_score: 0.5 }),
	];
	const qPick = selectFolderHubDiscoveryRowsWithTopRootQuota(qRows, 3);
	assert(qPick.length === 3, `quota pick size: got ${qPick.length}`);
	const paths = new Set(qPick.map((r) => r.path));
	assert(paths.has('root-b/b1'), 'quota should allow a second root before exhausting limit');
	assert(!paths.has('root-a/a3'), 'third slot under same root should defer to other root when capped');

	// Representative document pool cap: tied to final document slot budget, not raw SQL fetch size.
	assert(
		computeDocumentHubRepresentativeCandidateLimit(576, 320) === 125,
		'large-vault thinning cap should match maxDocSlots-derived target (DOCUMENT_HUB_REPRESENTATIVE_POOL_CAP)',
	);
	assert(
		computeDocumentHubRepresentativeCandidateLimit(72, 40) === 36,
		'small-vault thinning cap should clamp fetch to representative target',
	);

	console.log('hub-discover-rounds.test.ts: all passed');
}

runTests();
