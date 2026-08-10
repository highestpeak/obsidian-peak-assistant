import assert from 'node:assert/strict';
import {
	communityFingerprint,
	inverseDocumentFrequency,
	isEligibleCommunitySignal,
	resolveCommunityAnalysisMode,
	semanticSimilarityWeight,
} from '@/service/search/index/helper/structural/communityEvidence';
import { DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG } from '@/service/search/index/helper/structural/ResultGraphCommunityDefaults';
import {
	CommunityExplanationService,
	parseCommunityExplanation,
} from '@/service/search/community/CommunityExplanationService';
import type { ResultGraphCommunitySummary } from '@/service/search/graph/resultSubgraph';

assert.ok(
	semanticSimilarityWeight(0.9, 0.2) > semanticSimilarityWeight(0.2, 0.2),
	'higher semantic similarity must remain the stronger Louvain affinity',
);
assert.equal(semanticSimilarityWeight(2, 0.2), 0.2, 'semantic similarity is clamped');

assert.ok(
	inverseDocumentFrequency(100, 2) > inverseDocumentFrequency(100, 20),
	'rare repeated signals must have more IDF weight than common signals',
);
assert.equal(isEligibleCommunitySignal({
	totalDocuments: 100,
	support: 30,
	minimumSupport: 2,
	maximumDocuments: 80,
	maximumDocumentRatio: 0.22,
}), false, 'overly common signals are suppressed');
assert.equal(isEligibleCommunitySignal({
	totalDocuments: 100,
	support: 4,
	minimumSupport: 2,
	maximumDocuments: 80,
	maximumDocumentRatio: 0.22,
}), true, 'supported discriminating signals remain eligible');

const fingerprintA = communityFingerprint({
	memberIds: ['b', 'a'],
	descriptorKeys: ['term:y', 'tag:x'],
	analysisVersion: 2,
});
const fingerprintB = communityFingerprint({
	memberIds: ['a', 'b'],
	descriptorKeys: ['tag:x', 'term:y'],
	analysisVersion: 2,
});
assert.equal(fingerprintA, fingerprintB, 'fingerprint is order-independent');
assert.notEqual(
	fingerprintA,
	communityFingerprint({ memberIds: ['a', 'c'], descriptorKeys: ['tag:x'], analysisVersion: 2 }),
	'fingerprint changes with evidence membership',
);

assert.equal(
	resolveCommunityAnalysisMode(4001, DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG),
	'bounded',
	'large vaults degrade expensive metrics instead of skipping community analysis',
);

assert.deepEqual(parseCommunityExplanation(
	'Suggested label: Graph retrieval\nExplanation: These notes share indexing links and retrieval terms.',
), {
	suggestedLabel: 'Graph retrieval',
	explanation: 'These notes share indexing links and retrieval terms.',
});

const community: ResultGraphCommunitySummary = {
	id: 'c_0',
	displayLabel: 'Community 01',
	fingerprint: 'community-current',
	memberCount: 5,
	visibleMemberIds: ['a', 'b'],
	descriptors: [],
	internalReferenceCount: 2,
	analysisVersion: 2,
	analysisMode: 'exact',
	analyzedNodeCount: 5,
	totalNodeCount: 5,
	representativeNotes: [],
};
const service = new CommunityExplanationService(
	{} as never,
	{
		snapshots: {
			async readSnapshot() {
				return {
					envelope: {
						schemaVersion: 1,
						outputId: 'graph.community-explanation',
						recordKey: 'c_0',
						updatedAt: '2026-08-10T00:00:00.000Z',
						checksum: 'test',
						payload: {
							communityId: 'c_0',
							fingerprint: 'community-old',
							analysisVersion: 1,
							explanation: 'Old evidence.',
							suggestedLabel: null,
							evidence: { visibleMembers: 2, totalMembers: 5, internalReferenceCount: 1, descriptors: [], representativeNotes: [] },
							generatedAt: '2026-08-10T00:00:00.000Z',
							runId: 'run-old',
						},
					},
					recoveredFromBackup: false,
				};
			},
		} as never,
	} as never,
);
async function runPersistenceTests(): Promise<void> {
	const loaded = await service.load(community);
	assert.equal(loaded.stale, true, 'saved explanation is stale when the current evidence fingerprint changes');

	const writtenSnapshots: unknown[] = [];
	const writtenEvents: Array<{ payload: { status: string } }> = [];
	const deltas: string[] = [];
	const generationService = new CommunityExplanationService(
		{
			async *queryStream() {
				yield { type: 'text-delta', text: 'Suggested label: Graph retrieval\n' };
				yield { type: 'text-delta', text: 'Explanation: The notes share physical links and graph tags.' };
				yield { type: 'complete', usage: { inputTokens: 12, outputTokens: 9, totalTokens: 21 } };
			},
		} as never,
		{
			snapshots: {
				async writeSnapshot(input: unknown) {
					writtenSnapshots.push(input);
					return true;
				},
			},
			events: {
				async appendEvent(input: { payload: { status: string } }) {
					writtenEvents.push(input);
					return true;
				},
			},
		} as never,
		() => new Date('2026-08-10T01:02:03.000Z'),
		() => 'run-current',
	);
	const generated = await generationService.generate(community, {
		onDelta: (text) => deltas.push(text),
	});
	assert.equal(generated.suggestedLabel, 'Graph retrieval');
	assert.equal(generated.explanation, 'The notes share physical links and graph tags.');
	assert.equal(writtenSnapshots.length, 1, 'a completed explanation writes one durable snapshot');
	assert.deepEqual(writtenEvents.map((event) => event.payload.status), ['started', 'completed']);
	assert.equal(deltas.length, 2, 'streaming deltas reach the hover card before persistence completes');
	console.log('result-graph-community: passed');
}

void runPersistenceTests().catch((error) => {
	console.error(error);
	process.exit(1);
});
