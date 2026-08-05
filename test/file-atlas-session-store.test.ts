import assert from 'assert';
import { FileAtlasSessionStore } from '@/app/file-atlas/FileAtlasSessionStore';
import { parseDocumentBlocks } from '@/core/document/atlas/documentBlockParser';
import { RawBlockKind as Kind } from '@/core/document/atlas/types';
import {
	restoreSelectionId,
	selectionSnapshotForBlock,
} from '@/ui/view/file-atlas/atlasTreeModel';
import { defaultFileAtlasGraphSessionState } from '@/ui/view/file-atlas/FileAtlasSessionPort';

const store = new FileAtlasSessionStore();
const original = parseDocumentBlocks('# Alpha\n\nFirst paragraph.', 'A.md').blocks;
const paragraph = original.find((block) => block.kind === Kind.Heading)?.children?.find(
	(block) => block.kind === Kind.Paragraph,
);
assert.ok(paragraph);

const state = {
	subview: 'tree' as const,
	searchTerm: 'paragraph',
	flattened: true,
	activePreset: 'all',
	presetModified: true,
	visibleKinds: [Kind.Paragraph],
	collapsedIds: ['heading-alpha'],
	selection: selectionSnapshotForBlock(paragraph),
	treeScrollTop: 420,
	inspectorScrollTop: 64,
	graph: {
		...defaultFileAtlasGraphSessionState(),
		scope: 'two-hop' as const,
		semantic: true,
		viewport: { zoom: 1.35, pan: { x: 28, y: -16 } },
	},
};
store.writeDocument('A.md', state);
store.writeTray([{ id: 'one', title: 'One', kind: Kind.Paragraph, path: 'A.md' }]);

const restored = store.readDocument('A.md');
assert.deepEqual(restored, state, 'all per-document Atlas interaction state is retained in memory');
assert.deepEqual(store.readTray(), [{ id: 'one', title: 'One', kind: Kind.Paragraph, path: 'A.md' }]);

restored!.visibleKinds.push(Kind.Code);
restored!.graph.viewport!.pan.x = 999;
const untouched = store.readDocument('A.md')!;
assert.deepEqual(untouched.visibleKinds, [Kind.Paragraph], 'reads cannot mutate the session registry');
assert.equal(untouched.graph.viewport!.pan.x, 28);

const revised = parseDocumentBlocks('# Alpha\n\nInserted.\n\nFirst paragraph.', 'A.md').blocks;
assert.ok(
	restoreSelectionId(revised, state.selection),
	'a stable content identity restores the selected element after line numbers move',
);
assert.equal(store.readDocument('B.md'), null, 'documents have independent state snapshots');

console.log('PASS: File Atlas session state and selection restoration');
