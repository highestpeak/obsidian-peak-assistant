import assert from 'node:assert/strict';
import {
	GRAPH_WORKSPACE_MANIFESTS,
	resolveGraphWorkspaceManifest,
} from '@/ui/component/graph-workspace/GraphWorkspaceManifest';

assert.deepEqual(
	Object.keys(GRAPH_WORKSPACE_MANIFESTS).sort(),
	['ai-graph-artifact', 'ai-sources', 'composer', 'file-atlas', 'world-search'],
	'all five graph hosts are governed by the public manifest registry',
);

const worldSearch = resolveGraphWorkspaceManifest('world-search');
assert.deepEqual(worldSearch.views, ['list', 'tree', 'graph']);
assert.equal(worldSearch.scopes.length, 0, 'single-scope World Search renders no empty scope pill');
assert.deepEqual(worldSearch.physicalProjections, [
	'constellation',
	'community',
	'flow-lr',
	'flow-tb',
	'folder',
	'orbit',
]);

for (const hostId of ['file-atlas', 'ai-sources', 'composer'] as const) {
	assert.deepEqual(
		resolveGraphWorkspaceManifest(hostId).scopes,
		['one-hop', 'two-hop', 'ai'],
		`${hostId} exposes the shared graph scope contract`,
	);
}

const artifact = resolveGraphWorkspaceManifest('ai-graph-artifact');
assert.deepEqual(artifact.views, ['graph']);
assert.equal(artifact.scopes.length, 0, 'AI Graph artifact does not render a meaningless fixed-scope pill');
assert.deepEqual(artifact.aiLenses, ['topology', 'thinking-tree', 'bridge', 'timeline', 'gap-analysis']);

console.log('graph-workspace-manifest: passed');
