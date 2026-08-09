import assert from 'node:assert/strict';
import {
	buildVisibleFolderTree,
	folderTreeSelectionScope,
	toggleFolderTreeSelection,
} from '../src/ui/component/graph/folderTreeModel';

const projection = buildVisibleFolderTree([
	{ id: 'root-doc', path: 'Root.md' },
	{ id: 'one', path: 'kb1/D-26/one.md' },
	{ id: 'two', path: 'kb1/E-diary/2025/two.md' },
	{ id: 'three', path: 'kb1/E-diary/2026/three.md' },
	{ id: 'four', path: 'kb2/Requirements/four.md' },
]);

assert.deepEqual(
	projection.folders.map((folder) => [folder.path, folder.parentId, folder.documentIds.length]),
	[
		['kb1', undefined, 3],
		['kb2', undefined, 1],
		['kb1/D-26', 'group:folder:kb1', 1],
		['kb1/E-diary', 'group:folder:kb1', 2],
		['kb2/Requirements', 'group:folder:kb2', 1],
		['kb1/E-diary/2025', 'group:folder:kb1/E-diary', 1],
		['kb1/E-diary/2026', 'group:folder:kb1/E-diary', 1],
	],
	'folder tree keeps every visible ancestor and counts all descendant documents',
);

assert.deepEqual(
	projection.rows.map((row) => `${row.kind}:${row.depth}:${row.id}`),
	[
		'folder:0:group:folder:kb1',
		'folder:1:group:folder:kb1/D-26',
		'document:2:one',
		'folder:1:group:folder:kb1/E-diary',
		'folder:2:group:folder:kb1/E-diary/2025',
		'document:3:two',
		'folder:2:group:folder:kb1/E-diary/2026',
		'document:3:three',
		'folder:0:group:folder:kb2',
		'folder:1:group:folder:kb2/Requirements',
		'document:2:four',
		'document:0:root-doc',
	],
	'rows follow one stable top-to-bottom directory tree order',
);

assert.equal(projection.documentFolderIdById.get('two'), 'group:folder:kb1/E-diary/2025');
assert.equal(projection.documentFolderIdById.get('root-doc'), undefined);

const fileScope = folderTreeSelectionScope(projection, 'two');
assert.deepEqual([...fileScope.documentIds], ['two']);
assert.deepEqual([...fileScope.folderIds], []);

const folderScope = folderTreeSelectionScope(projection, 'group:folder:kb1/E-diary');
assert.deepEqual([...folderScope.documentIds].sort(), ['three', 'two']);
assert.deepEqual(
	[...folderScope.folderIds].sort(),
	[
		'group:folder:kb1/E-diary',
		'group:folder:kb1/E-diary/2025',
		'group:folder:kb1/E-diary/2026',
	],
);

assert.equal(toggleFolderTreeSelection(null, 'two'), 'two');
assert.equal(toggleFolderTreeSelection('two', 'two'), null);
assert.equal(toggleFolderTreeSelection('two', 'group:folder:kb1'), 'group:folder:kb1');

console.log('PASS: folder tree projection and selection scope');
