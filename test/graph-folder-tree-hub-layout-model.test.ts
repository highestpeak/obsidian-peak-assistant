import assert from 'node:assert/strict';
import { buildVisibleFolderTree } from '../src/ui/component/graph/folderTreeModel';
import { buildFolderTreeLayout } from '../src/ui/component/graph/folderTreeLayoutModel';
import {
	buildFolderTreeHubLayout,
	FOLDER_TREE_HUB_LAYOUT_DEFAULTS,
} from '../src/ui/component/graph/folderTreeHubLayoutModel';

const projection = buildVisibleFolderTree([
	{ id: 'a', path: 'kb/a.md' },
	{ id: 'b', path: 'kb/b.md' },
	{ id: 'c', path: 'kb/c.md' },
]);
const tree = buildFolderTreeLayout(projection, {
	labelById: new Map([
		['a', 'A'],
		['b', 'B'],
		['c', 'C'],
	]),
	linkCountByDocumentId: new Map(),
});
const a = tree.rowById.get('a');
const b = tree.rowById.get('b');
const c = tree.rowById.get('c');
assert.ok(a && b && c);

const single = buildFolderTreeHubLayout(tree, {
	hubs: [{ id: 'hub-1' }],
	constituentEdges: [
		{ sourceId: 'hub-1', targetId: 'a' },
		{ sourceId: 'hub-1', targetId: 'c' },
	],
	relationRouteXs: [540],
});
const singlePosition = single.positionById.get('hub-1');
assert.ok(singlePosition);
assert.equal(singlePosition.y, (a.centerY + c.centerY) / 2);
assert.ok(
	single.columnLeft >= 540 + FOLDER_TREE_HUB_LAYOUT_DEFAULTS.columnGap,
	'the Hub column clears the relationship routing gutter',
);
assert.ok(
	single.columnLeft > Math.max(...tree.rows.map((row) => row.right)),
	'the Hub column stays to the right of every tree row',
);

const multiple = buildFolderTreeHubLayout(tree, {
	hubs: [{ id: 'hub-1' }, { id: 'hub-2' }],
	constituentEdges: [
		{ sourceId: 'hub-1', targetId: 'a' },
		{ sourceId: 'hub-1', targetId: 'c' },
		{ sourceId: 'hub-2', targetId: 'b' },
	],
	relationRouteXs: [540],
});
const first = multiple.positionById.get('hub-1');
const second = multiple.positionById.get('hub-2');
assert.ok(first && second);
assert.ok(
	Math.abs(first.y - second.y) >= (
		FOLDER_TREE_HUB_LAYOUT_DEFAULTS.nodeHeight
		+ FOLDER_TREE_HUB_LAYOUT_DEFAULTS.verticalGap
	),
	'nearby Hubs are separated without returning to the tree tail',
);
assert.ok(
	Math.max(first.y, second.y) <= c.bottom,
	'the Hub column remains aligned with the visible tree when space is available',
);

console.log('PASS: folder tree Hubs use the right-side whitespace and align to constituents');
