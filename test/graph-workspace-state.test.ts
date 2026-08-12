import assert from 'node:assert/strict';
import {
	createGraphWorkspaceState,
	graphWorkspaceTransition,
} from '@/ui/component/graph-workspace/GraphWorkspaceState';

const initial = createGraphWorkspaceState({
	view: 'list',
	scope: 'two-hop',
	physicalProjection: 'community',
	aiLens: 'bridge',
});

const graph = graphWorkspaceTransition(initial, { type: 'view', view: 'graph' });
assert.equal(graph.view, 'graph');
assert.equal(graph.scopeControlsVisible, true, 'scope grows only after Graph becomes active');
assert.equal(graph.viewLabelsCompact, true, 'List/Tree/Graph compress to icons in graph mode');

const ai = graphWorkspaceTransition(graph, { type: 'scope', scope: 'ai' });
assert.equal(ai.scope, 'ai');
assert.equal(ai.projectionKind, 'ai');
assert.equal(ai.aiLens, 'bridge', 'AI lens selection survives physical/AI switching');

const physical = graphWorkspaceTransition(ai, { type: 'scope', scope: 'one-hop' });
assert.equal(physical.physicalProjection, 'community', 'physical projection survives AI Graph switching');

const list = graphWorkspaceTransition(physical, { type: 'view', view: 'list' });
assert.equal(list.scopeControlsVisible, false);
assert.equal(list.viewLabelsCompact, false);

console.log('graph-workspace-state: passed');
