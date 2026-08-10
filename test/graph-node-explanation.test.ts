import assert from 'node:assert/strict';
import {
	buildGraphNodeExplanationEvidence,
	GraphNodeExplanationService,
	graphNodeExplanationKey,
	parseGraphNodeExplanation,
} from '@/service/search/community/GraphNodeExplanationService';
import { DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG } from '@/service/search/index/helper/structural/ResultGraphCommunityDefaults';

const evidenceA = buildGraphNodeExplanationEvidence({
	path: 'Notes/Graph retrieval.md',
	title: 'Graph retrieval',
	summary: 'Combines physical links with semantic search evidence.',
	signals: ['retrieval', 'graph', 'retrieval'],
	incomingLinks: 4,
	outgoingLinks: 2,
	representativeLinks: [
		{ path: 'Notes/Index.md', label: 'Index', direction: 'outgoing' },
		{ path: 'Notes/Search.md', label: 'Search', direction: 'incoming' },
	],
});
const evidenceB = buildGraphNodeExplanationEvidence({
	path: 'Notes/Graph retrieval.md',
	title: 'Graph retrieval',
	summary: 'Combines physical links with semantic search evidence.',
	signals: ['graph', 'retrieval'],
	incomingLinks: 4,
	outgoingLinks: 2,
	representativeLinks: [
		{ path: 'Notes/Search.md', label: 'Search', direction: 'incoming' },
		{ path: 'Notes/Index.md', label: 'Index', direction: 'outgoing' },
	],
});

assert.equal(evidenceA.fingerprint, evidenceB.fingerprint, 'node evidence fingerprint is order-independent');
assert.match(graphNodeExplanationKey(evidenceA.path), /^node-[a-f0-9]{24}$/);
assert.equal(
	graphNodeExplanationKey(evidenceA.path),
	graphNodeExplanationKey(evidenceA.path),
	'node persistence key is stable for the same vault path',
);
assert.equal(
	parseGraphNodeExplanation('Explanation: This note connects graph indexing with retrieval.'),
	'This note connects graph indexing with retrieval.',
);

async function runPersistenceTests(): Promise<void> {
	const unavailableService = new GraphNodeExplanationService(
		{} as never,
		{} as never,
		{ read: async () => null },
	);
	await assert.rejects(
		unavailableService.generate(evidenceA.path),
		/graph-node-evidence-unavailable/,
		'AI generation is unavailable when the canonical index has no current evidence',
	);

	const staleService = new GraphNodeExplanationService(
		{} as never,
		{
			snapshots: {
				async readSnapshot() {
					return {
						envelope: {
							schemaVersion: 1,
							outputId: 'graph.node-explanation',
							recordKey: graphNodeExplanationKey(evidenceA.path),
							updatedAt: '2026-08-10T00:00:00.000Z',
							checksum: 'test',
							payload: { ...evidenceA, fingerprint: 'old-evidence' },
						},
						recoveredFromBackup: false,
					};
				},
			} as never,
		} as never,
		{ read: async () => evidenceA },
	);
	const loaded = await staleService.load(evidenceA.path);
	assert.equal(loaded.stale, true, 'saved node explanation is stale when indexed evidence changes');

	const writtenSnapshots: Array<Record<string, unknown>> = [];
	const writtenEvents: Array<{ payload: { status: string; regenerate: boolean } }> = [];
	const promptCalls: Array<{ promptId: string; variables: Record<string, string> }> = [];
	const deltas: string[] = [];
	const service = new GraphNodeExplanationService(
		{
			async *queryStream(promptId: string, variables: Record<string, string>) {
				promptCalls.push({ promptId, variables });
				yield { type: 'text-delta', text: 'Explanation: This note anchors ' };
				yield { type: 'text-delta', text: 'graph retrieval through its links and indexed signals.' };
				yield { type: 'complete', usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 } };
			},
		} as never,
		{
			snapshots: {
				async writeSnapshot(input: Record<string, unknown>) {
					writtenSnapshots.push(input);
					return true;
				},
			},
			events: {
				async appendEvent(input: { payload: { status: string; regenerate: boolean } }) {
					writtenEvents.push(input);
					return true;
				},
			},
		} as never,
		{ read: async () => evidenceA },
		DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG.nodeExplanation,
		() => new Date('2026-08-10T01:02:03.000Z'),
		() => 'run-node-current',
	);
	const generated = await service.generate(evidenceA.path, {
		regenerate: true,
		onDelta: (text) => deltas.push(text),
	});

	assert.equal(
		generated.explanation,
		'This note anchors graph retrieval through its links and indexed signals.',
	);
	assert.equal(generated.evidence.summary, evidenceA.summary, 'the durable record keeps the evidence used by AI');
	assert.equal(writtenSnapshots.length, 1, 'a completed node explanation writes one durable snapshot');
	assert.deepEqual(
		writtenEvents.map((event) => [event.payload.status, event.payload.regenerate]),
		[['started', true], ['completed', true]],
	);
	assert.equal(deltas.length, 2, 'streaming node deltas reach the hover card before persistence completes');
	assert.equal(promptCalls.length, 1);
	assert.match(promptCalls[0].promptId, /graph-node-explanation/);
	assert.equal(promptCalls[0].variables.summary, evidenceA.summary);
	assert.match(promptCalls[0].variables.linkCounts, /4 incoming · 2 outgoing · 6 total/);
	assert.equal(writtenSnapshots[0].outputId, 'graph.node-explanation');
	assert.deepEqual(writtenSnapshots[0].pathVariables, { nodeKey: graphNodeExplanationKey(evidenceA.path) });

	console.log('graph-node-explanation: passed');
}

void runPersistenceTests().catch((error) => {
	console.error(error);
	process.exit(1);
});
