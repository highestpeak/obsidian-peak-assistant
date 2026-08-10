import assert from 'node:assert/strict';
import { buildVisibleFolderTree } from '../src/ui/component/graph/folderTreeModel';
import {
	buildFolderTreeLayout,
	FOLDER_TREE_LAYOUT_DEFAULTS,
} from '../src/ui/component/graph/folderTreeLayoutModel';

const projection = buildVisibleFolderTree([
	{ id: 'one', path: 'kb1/work/one.md' },
	{ id: 'two', path: 'kb1/work/deep/two.md' },
	{ id: 'three', path: 'kb2/three.md' },
]);
const layout = buildFolderTreeLayout(projection, {
	labelById: new Map([
		['one', 'One'],
		['two', 'A deliberately long document title that must clamp'],
		['three', 'Three'],
	]),
	linkCountByDocumentId: new Map([
		['one', 1],
		['two', 12],
		['three', 0],
	]),
});

const kb1 = layout.rowById.get('group:folder:kb1');
const work = layout.rowById.get('group:folder:kb1/work');
const deep = layout.rowById.get('group:folder:kb1/work/deep');
const two = layout.rowById.get('two');
const kb2 = layout.rowById.get('group:folder:kb2');
assert.ok(kb1 && work && deep && two && kb2);

assert.equal(work.left - kb1.left, FOLDER_TREE_LAYOUT_DEFAULTS.levelIndent);
assert.equal(deep.left - work.left, FOLDER_TREE_LAYOUT_DEFAULTS.levelIndent);
assert.equal(two.left - deep.left, FOLDER_TREE_LAYOUT_DEFAULTS.levelIndent);
assert.equal(work.top - kb1.top, FOLDER_TREE_LAYOUT_DEFAULTS.rowStep);
assert.equal(
	kb2.top - layout.rows[layout.rows.indexOf(kb2) - 1].top,
	FOLDER_TREE_LAYOUT_DEFAULTS.rowStep + FOLDER_TREE_LAYOUT_DEFAULTS.rootSectionGap,
	'new vault roots receive only one compact section gap',
);
assert.equal(two.width, FOLDER_TREE_LAYOUT_DEFAULTS.fileMaxWidth);
assert.equal(two.right, two.left + two.width);
assert.equal(two.bottom, two.top + two.height);
assert.ok(two.badgeWidth > layout.rowById.get('one')!.badgeWidth);

const workRail = layout.railPoints.filter((point) => point.parentId === work.id);
assert.equal(workRail[0]?.x, deep.left - FOLDER_TREE_LAYOUT_DEFAULTS.railOffset);
assert.equal(workRail[0]?.kind, 'start');
assert.deepEqual(
	layout.railSegments
		.filter((segment) => segment.parentId === work.id)
		.map((segment) => segment.kind),
	['rail', 'branch', 'rail', 'branch'],
	'each folder uses one shared vertical rail with short child branches',
);

console.log('PASS: compact folder tree layout and shared rails');
