import assert from 'node:assert/strict';
import { buildFolderTreeEdgeTrafficNorm } from '../src/ui/component/graph/folderTreeEdgeEmphasis';

const traffic = buildFolderTreeEdgeTrafficNorm([
	{ id: 'into-a', from: 'a', to: 'sink', directionality: 'directed' },
	{ id: 'into-b', from: 'b', to: 'sink', directionality: 'directed' },
	{ id: 'into-c', from: 'c', to: 'sink', directionality: 'directed' },
	{ id: 'out-x', from: 'source', to: 'x', directionality: 'directed' },
	{ id: 'out-y', from: 'source', to: 'y', directionality: 'directed' },
	{ id: 'out-z', from: 'source', to: 'z', directionality: 'directed' },
	{ id: 'quiet', from: 'quiet-source', to: 'quiet-target', directionality: 'directed' },
	{ id: 'undirected-a', from: 'mesh', to: 'mesh-a', directionality: 'undirected' },
	{ id: 'undirected-b', from: 'mesh', to: 'mesh-b', directionality: 'undirected' },
], 3);

assert.equal(traffic.get('into-a'), 1, 'a high-indegree target strengthens each incoming edge');
assert.equal(traffic.get('out-x'), 1, 'a high-outdegree source strengthens each outgoing edge');
assert.equal(traffic.get('quiet'), 1 / 3, 'a low-traffic relation stays at the light end of the gradient');
assert.equal(traffic.get('undirected-a'), 2 / 3, 'undirected relations use endpoint incident degree');

console.log('PASS: folder tree edge emphasis follows visible directional traffic');
