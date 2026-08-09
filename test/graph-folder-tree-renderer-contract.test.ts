import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const renderer = fs.readFileSync(
	path.join(__dirname, '..', 'src/ui/component/graph/AtlasGraphCanvasImpl.tsx'),
	'utf8',
);

assert.match(renderer, /folder:\s*\{ layout: 'folder-tree',\s*folderTree: true \}/);
assert.match(renderer, /layout: bundle\.folderTree \? \{ name: 'preset' \} : undefined/);
assert.match(renderer, /classes: 'hierarchy folderHierarchy'/);
assert.match(renderer, /classes: `\$\{e\.kind\}\$\{folderTree \? ' folderRelation' : ''\}`/);
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

console.log('PASS: folder tree renderer contract');
