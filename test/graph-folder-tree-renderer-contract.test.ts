import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const renderer = fs.readFileSync(
	path.join(__dirname, '..', 'src/ui/component/graph/AtlasGraphCanvasImpl.tsx'),
	'utf8',
);

assert.match(renderer, /folder:\s*\{ layout: 'folder-tree',\s*folderTree: true,\s*community: false \}/);
assert.match(renderer, /layout: bundle\.folderTree \? \{ name: 'preset' \} : undefined/);
assert.match(renderer, /buildFolderTreeLayout/);
assert.match(renderer, /buildFolderTreeRelationRoutes/);
assert.match(renderer, /buildFolderTreeHubLayout/);
assert.match(renderer, /folderTreeHubLayout\?\.positionById\.get\(hub\.id\)/);
assert.match(renderer, /controlPointDistances: relationRoute/);
assert.match(renderer, /edgeDistances: relationRoute \? 'node-position' : 'intersection'/);
assert.match(renderer, /'control-point-distances': 'data\(controlPointDistances\)'/);
assert.match(renderer, /folderTreeDecoration folderTreeIcon/);
assert.match(renderer, /folderTreeCountBadge/);
assert.match(renderer, /folderTreeLinkBadge/);
assert.match(renderer, /node\.hub\.folderTreeHub/);
assert.match(renderer, /folderHierarchy\$\{segment\.kind === 'rail' \? 'Rail' : 'Branch'\}/);
assert.match(renderer, /classes: `\$\{e\.kind\}\$\{folderTree \? ' folderRelation' : ''\}\$\{opts\.community \? ' communityRelation' : ''\}/);
assert.match(renderer, /toggleFolderTreeSelection\(focusedFolderTreeNodeId, n\.id\(\)\)/);
assert.match(renderer, /folderTreeSelectionScope\(projection, selectedNodeId\)/);
assert.match(renderer, /edge\.folderRelation\.folderFocusIncoming/);
assert.match(renderer, /'target-arrow-shape': 'vee'/);
assert.match(renderer, /edge\.folderRelation\.folderFocusOutgoing/);
assert.match(renderer, /'target-arrow-shape': 'triangle'/);
assert.match(renderer, /edge\.folderRelation\.semantic/);
assert.match(renderer, /line-dash-offset/);
assert.match(renderer, /prefers-reduced-motion: reduce/);
assert.doesNotMatch(renderer, /buildVisibleFolderGroups/);
assert.doesNotMatch(renderer, /row\.depth \* 155/);
assert.doesNotMatch(renderer, /index \* 46/);

console.log('PASS: folder tree renderer contract');
