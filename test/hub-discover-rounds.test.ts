import type { HubCandidate } from '@/service/search/index/helper/hub';
import {
	computeHubDiscoverBudgets,
	computeHubRankingScore,
	marginalCoverageGain,
	mergeCandidatesByPriority,
	singleSourceHubProvenance,
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
		stableKey: 'document:n1',
		docIncomingCnt: 0,
		docOutgoingCnt: 0,
		...singleSourceHubProvenance(kind, graphScore),
		...overrides,
	} as HubCandidate;
	return {
		...m,
		rankingScore: computeHubRankingScore(m.graphScore, m.sourceConsensusScore),
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

	assert(computeHubDiscoverBudgets(0).limitTotal === 40, 'empty vault uses min cap');
	assert(computeHubDiscoverBudgets(100).limitTotal === 40, 'small doc count stays at min');
	assert(computeHubDiscoverBudgets(1000).limitTotal === 94, `mid vault: got ${computeHubDiscoverBudgets(1000).limitTotal}`);
	assert(computeHubDiscoverBudgets(50_000).limitTotal === 200, 'large vault hits max cap');

	const smallB = computeHubDiscoverBudgets(0);
	assert(smallB.clusterSeedFetchLimit >= smallB.clusterLimit, 'cluster seed pool should cover cluster output cap');
	assert(smallB.clusterSeedFetchLimit === 58, `min-vault cluster seed fetch: got ${smallB.clusterSeedFetchLimit}`);

	const midB = computeHubDiscoverBudgets(1000);
	assert(midB.clusterSeedFetchLimit >= midB.clusterLimit, 'mid vault seed pool should cover cluster output cap');
	assert(midB.clusterSeedFetchLimit === 120, `mid vault cluster seed fetch clamps: got ${midB.clusterSeedFetchLimit}`);

	const largeB = computeHubDiscoverBudgets(50_000);
	assert(largeB.clusterSeedFetchLimit === 120, `max vault cluster seed fetch: got ${largeB.clusterSeedFetchLimit}`);

	console.log('hub-discover-rounds.test.ts: all passed');
}

runTests();
