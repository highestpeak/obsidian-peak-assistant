import assert from 'node:assert/strict';
import { buildActiveGraphTopology } from '@/ui/component/graph/activeGraphTopology';

const nodeIds = ['linked', 'semantic-a', 'semantic-b', 'singleton'];
const edges = [
	{ from: 'linked', to: 'semantic-a', kind: 'reference' as const, directionality: 'directed' as const },
	{ from: 'semantic-a', to: 'semantic-b', kind: 'semantic' as const, directionality: 'undirected' as const, weight: 0.87 },
];

const structuralOnly = buildActiveGraphTopology(nodeIds, edges, false);
assert.deepEqual(
	[...structuralOnly.isolatedNodeIds].sort(),
	['semantic-b', 'singleton'],
	'hidden semantic edges do not fabricate active connectivity',
);

const withSemantic = buildActiveGraphTopology(nodeIds, edges, true);
assert.deepEqual(
	[...withSemantic.isolatedNodeIds],
	['singleton'],
	'a semantic-only node joins the calculated graph when Semantic edges is enabled',
);
assert.deepEqual(
	[...withSemantic.semanticOnlyNodeIds],
	['semantic-b'],
	'semantic-only connectivity remains distinguishable from a true singleton',
);
assert.equal(withSemantic.activeDegreeById.get('semantic-a'), 2);
assert.equal(withSemantic.semanticDegreeById.get('semantic-b'), 1);

console.log('result-graph-active-topology: passed');
