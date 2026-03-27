import { GraphEdgeType } from '@/core/po/graph.po';
import {
	bridgePenalty,
	computeLocalHubEdgeWeight,
	computeLocalHubNodeWeight,
	crossFolderPenaltySync,
	folderCohesion,
	shouldStopExpansionLocalCore,
} from '@/service/search/index/helper/hub/localGraphAssembler';

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(msg);
}

function runTests() {
	assert(folderCohesion('A/B/note.md', 'A/B') === 1, 'same folder subtree should have full cohesion');
	assert(folderCohesion('A/C/note.md', 'A/B') < 1, 'different subtree should reduce cohesion');

	const pathById = new Map<string, string>([
		['a', 'A/B/one.md'],
		['b', 'A/B/two.md'],
		['c', 'X/Y/three.md'],
	]);
	assert(crossFolderPenaltySync('A/B', pathById, 'a', 'b') === 0, 'same root should have no cross-folder penalty');
	assert(crossFolderPenaltySync('A/B', pathById, 'a', 'c') > 0, 'cross-root edge should have penalty');

	const lowBridge = bridgePenalty({ doc_incoming_cnt: 2, doc_outgoing_cnt: 3 });
	const highBridge = bridgePenalty({ doc_incoming_cnt: 12, doc_outgoing_cnt: 11 });
	assert(lowBridge === 0, 'small degree node should not be bridge-penalized');
	assert(highBridge > 0, 'high degree node should receive bridge penalty');

	const strongNode = computeLocalHubNodeWeight({
		depth: 0,
		cohesionScore: 1,
		pagerank: 0.4,
		semanticPagerank: 0.5,
		bridgePenalty: 0,
	});
	const weakNode = computeLocalHubNodeWeight({
		depth: 4,
		cohesionScore: 0.35,
		pagerank: 0,
		semanticPagerank: 0,
		bridgePenalty: 0.35,
	});
	assert(strongNode > weakNode, 'strong central node should outrank distant weak node');

	const refEdge = computeLocalHubEdgeWeight({
		baseWeight: 1,
		edgeType: GraphEdgeType.References,
		crossBoundaryPenalty: 0,
	});
	const semanticEdge = computeLocalHubEdgeWeight({
		baseWeight: 0.9,
		edgeType: GraphEdgeType.SemanticRelated,
		crossBoundaryPenalty: 0.45,
	});
	assert(refEdge.hubEdgeWeight > semanticEdge.hubEdgeWeight, 'cross-boundary semantic edge should be weaker than local reference edge');
	assert(semanticEdge.semanticSupport > 0, 'semantic edge should keep semantic support');

	assert(!shouldStopExpansionLocalCore(0, 0, 32, 0.05), 'no added nodes should not stop by novelty rule');
	assert(shouldStopExpansionLocalCore(40, 10, 32, 0.05), 'too many added nodes should stop expansion');
	assert(shouldStopExpansionLocalCore(10, 0, 32, 0.05), 'zero novelty after added nodes should stop expansion');

	console.log('hub-local-graph-weights.test.ts: all passed');
}

runTests();
