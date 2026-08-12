import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const renderer = fs.readFileSync(
	path.join(__dirname, '..', 'src/ui/component/graph/AtlasGraphCanvasImpl.tsx'),
	'utf8',
);

assert.match(renderer, /folder:\s*\{ layout: 'folder-tree',\s*folderTree: true,\s*community: false \}/);
assert.match(renderer, /layout: bundle\.folderTree \|\| explicitPositions \? \{ name: 'preset' \} : undefined/);
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
assert.match(renderer, /selectGraphNode\(n\.id\(\), modKey\)/);
assert.match(renderer, /multiSelectedEdge/);
assert.match(renderer, /function applyFolderTreeHover\(/);
assert.match(renderer, /folderTreeSelectionScope\(projection, hoveredNodeId\)/);
assert.match(renderer, /applyFolderTreeHover\(cy, folderProjection, n\.id\(\)\)/);
assert.match(renderer, /applyFolderTreeHover\(cy, folderProjection, null\)/);
assert.match(renderer, /node\.folderTreeNode\.folderHoverAnchor/);
assert.match(renderer, /node\.folderTreeNode\.folderHoverConnected/);
assert.match(renderer, /edge\.folderRelation\.folderHoverMuted/);
assert.match(renderer, /edge\.folderRelation\.folderHoverIncoming/);
assert.match(renderer, /'target-arrow-shape': 'vee'/);
assert.match(renderer, /edge\.folderRelation\.folderHoverOutgoing/);
assert.match(renderer, /'target-arrow-shape': 'triangle'/);
assert.match(renderer, /const relationAnchorIds = new Set/);
assert.match(renderer, /relationAnchorIds\.add\(hoveredNodeId\)/);
assert.match(renderer, /folderTrafficNorm/);
assert.match(renderer, /width: 'data\(folderRestingWidth\)'/);
assert.match(renderer, /opacity: 'data\(folderRestingOpacity\)'/);
assert.match(renderer, /width: 'data\(folderHoverWidth\)'/);
assert.match(renderer, /requestAnimationFrame\(clearHoverState\)/);
assert.match(renderer, /edge\.folderRelation\.semantic/);
assert.match(renderer, /line-dash-offset/);
assert.match(renderer, /prefers-reduced-motion: reduce/);
assert.doesNotMatch(renderer, /buildVisibleFolderGroups/);
assert.doesNotMatch(renderer, /folderHoverHidden|folderHoverDimmed/);
assert.doesNotMatch(renderer, /edge\.folderRelation\.folderHoverMuted[^\n]*opacity:\s*0(?:\D|$)/);
assert.doesNotMatch(renderer, /row\.depth \* 155/);
assert.doesNotMatch(renderer, /index \* 46/);

console.log('PASS: folder tree renderer contract');
