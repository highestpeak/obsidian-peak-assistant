import assert from 'node:assert/strict';
import {
	buildVisibleFolderGroups,
	visibleFolderGroupIdForDocument,
} from '../src/ui/component/graph/folderCompoundModel';

const deepChain = buildVisibleFolderGroups([
	{ path: 'A/transit/leaf/visible.md' },
]);
assert.deepEqual(
	deepChain.map((group) => group.path),
	['A/transit/leaf'],
	'pure transit folders must not create empty compound frames',
);
assert.equal(deepChain[0]?.parentId, undefined);
assert.equal(
	visibleFolderGroupIdForDocument('A/transit/leaf/visible.md'),
	'group:folder:A/transit/leaf',
);

const siblingBranches = buildVisibleFolderGroups([
	{ path: 'A/transit/left/one.md' },
	{ path: 'A/transit/right/two.md' },
]);
assert.deepEqual(
	siblingBranches.map((group) => [group.path, group.parentId]),
	[
		['A/transit/left', undefined],
		['A/transit/right', undefined],
	],
	'empty shared ancestors collapse while visible sibling groups remain',
);

const visibleParent = buildVisibleFolderGroups([
	{ path: 'A/parent.md' },
	{ path: 'A/transit/leaf/child.md' },
]);
assert.deepEqual(
	visibleParent.map((group) => [group.path, group.parentId]),
	[
		['A', undefined],
		['A/transit/leaf', 'group:folder:A'],
	],
	'a descendant group must attach to the nearest ancestor with direct visible content',
);

const filtered = buildVisibleFolderGroups([
	{ path: 'A/transit/leaf/still-visible.md' },
]);
assert.equal(
	filtered.some((group) => group.path === 'A'),
	false,
	'group visibility must be recomputed from the filtered visible document set',
);

console.log('graph folder compound model tests passed');
