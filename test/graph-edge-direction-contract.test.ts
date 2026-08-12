import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	coalesceGraphEdges,
	resolveGraphEdgeDirectionality,
} from '../src/core/types/graph-edge';
import { projectSourcesGraphEdges } from '../src/service/tools/search-graph-inspector/source-graph-direction';

assert.equal(resolveGraphEdgeDirectionality('reference'), 'directed');
assert.equal(resolveGraphEdgeDirectionality('builds_on'), 'directed');
assert.equal(resolveGraphEdgeDirectionality('semantic'), 'undirected');
assert.equal(resolveGraphEdgeDirectionality('contrasts'), 'undirected');

const normalized = coalesceGraphEdges([
	{ from: 'a', to: 'b', kind: 'reference' },
	{ from: 'b', to: 'a', kind: 'reference' },
	{ from: 'a', to: 'b', kind: 'semantic' },
	{ from: 'b', to: 'a', kind: 'semantic' },
]);
assert.deepEqual(
	normalized.map((edge) => `${edge.kind}:${edge.directionality}`).sort(),
	['reference:bidirectional', 'semantic:undirected'],
);

const projected = projectSourcesGraphEdges(
	[
		{ fromNodeId: 'doc-a', toNodeId: 'doc-b', kind: 'reference' },
		{ fromNodeId: 'doc-b', toNodeId: 'doc-a', kind: 'reference' },
		{ fromNodeId: 'doc-a', toNodeId: 'doc-b', kind: 'semantic' },
		{ fromNodeId: 'outside', toNodeId: 'doc-a', kind: 'reference' },
	],
	new Map([
		['doc-a', 'display-a'],
		['doc-b', 'display-b'],
	]),
);
assert.deepEqual(
	projected.map((edge) => `${edge.kind}:${edge.directionality}`).sort(),
	['reference:bidirectional', 'semantic:undirected'],
);

const atlasSource = readFileSync(
	join(process.cwd(), 'src/ui/component/graph/AtlasGraphCanvasImpl.tsx'),
	'utf8',
);
assert.match(atlasSource, /edge\[directionality = "directed"\]/);
assert.match(atlasSource, /edge\[directionality = "bidirectional"\]/);
assert.match(atlasSource, /edge\[directionality = "undirected"\]/);

console.log('PASS: graph direction contract and renderer marker wiring');
