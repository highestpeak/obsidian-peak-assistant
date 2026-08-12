import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiLensToAtlasModel } from '@/ui/component/graph/adapters/aiLensToAtlasModel';
import type { LensGraphData, LensType } from '@/core/types/lens-graph';

const fixture: LensGraphData = {
	nodes: [
		{ label: 'Root', path: 'root.md', role: 'root', createdAt: 1, level: 0, communityId: 'a' },
		{ label: 'Bridge', path: 'bridge.md', role: 'bridge', createdAt: 2, level: 1, parentId: 'root.md', communityId: 'b' },
		{ label: 'Leaf', path: 'leaf.md', role: 'leaf', createdAt: 3, level: 2, parentId: 'bridge.md', communityId: 'b' },
	],
	edges: [
		{ source: 'root.md', target: 'bridge.md', kind: 'derives', relationFamily: 'causal', canonicalRelationId: 'r1' },
		{ source: 'bridge.md', target: 'leaf.md', kind: 'cross-domain', canonicalRelationId: 'r2' },
		{ source: 'root.md', target: 'leaf.md', kind: 'temporal', relationFamily: 'temporal', canonicalRelationId: 'r3' },
	],
	availableLenses: ['topology', 'thinking-tree', 'bridge', 'timeline', 'gap-analysis'],
	bridges: [{ node_path: 'bridge.md', connects: ['a', 'b'], explanation: 'connects domains' }],
	gaps: [{ id: 'g1', communityA: 'a', communityB: 'b', score: 0.8, suggestedBridges: 1, gapType: 'structural' }],
};

for (const lens of fixture.availableLenses as LensType[]) {
	const model = aiLensToAtlasModel(fixture, lens);
	assert.equal(model.nodes.length, 3, `${lens} retains stable node identity`);
	assert.ok(model.positions && Object.keys(model.positions).length === 3, `${lens} supplies deterministic Cytoscape positions`);
	assert.ok(model.edges.every((edge) => edge.relationId !== undefined), `${lens} preserves relation provenance slots`);
}

const contextual = readFileSync('src/ui/component/ai-graph/ContextualAIGraphView.tsx', 'utf8');
const searchModal = readFileSync('src/ui/view/quick-search/SearchModal.tsx', 'utf8');
assert.doesNotMatch(contextual, /MultiLensGraph/, 'contextual AI Graph uses the shared Cytoscape stack');
assert.doesNotMatch(searchModal, /MultiLensGraph/, 'artifact detail uses the shared Cytoscape stack');

console.log('ai-graph-cytoscape-parity: passed');
