import assert from 'assert';
import { existsSync, readFileSync } from 'fs';
import { applyOperations } from '@/core/composer';
import {
	buildIndentListItemOps,
	buildInsertListItemOps,
	createListItemPatchMaterializer,
	insertValidatedListItem,
	parseComposerDocument,
} from '@/service/composer';

const source = '- notion\n- google docs\n- rome search';
const definition = {
	resultKind: 'list-item-patch',
	rendererId: 'composer.renderer.list-item-patch',
	writebackAdapterId: 'composer.writeback.list-item-patch',
} as never;
const snapshot = {
	documentId: 'doc-1',
	revision: 'rev-1',
	target: { kind: 'block', blockId: 'list-0-abcd1234' },
	targetSource: source,
} as never;

const envelope = createListItemPatchMaterializer().materialize({
	definition,
	snapshot,
	text: JSON.stringify({ insertionIndex: 3, itemMarkdown: '- obsidian' }),
	placement: { kind: 'list-gap', insertionIndex: 1 },
});
const payload = envelope.payload as {
	insertionIndex: number;
	itemMarkdown: string;
	replacementText: string;
};

assert.equal(payload.insertionIndex, 1, 'explicit user anchor overrides the model-selected list gap');
assert.equal(
	payload.replacementText,
	'- notion\n- obsidian\n- google docs\n- rome search',
	'accepted patch writes at the explicit semantic gap',
);
assert.equal(
	insertValidatedListItem(source, 2, '- obsidian'),
	'- notion\n- google docs\n- obsidian\n- rome search',
	'validated insertion still supports every middle gap',
);

const directSource = '- Alpha\n- Beta';
const directSnapshot = parseComposerDocument(directSource, { filePath: 'direct-list.md' });
const directBlock = directSnapshot.blocks[0];
const listInsert = directBlock
	? buildInsertListItemOps(directSnapshot, directBlock.blockId, 1, 'list')
	: null;
assert.ok(listInsert, 'direct insertion produces a transaction for a real list gap');
const directListResult = applyOperations(directSource, listInsert?.operations ?? []);
assert.equal(
	directListResult,
	'- Alpha\n- \n- Beta',
	'direct insertion adds an editable list item without invoking AI',
);
assert.equal(
	parseComposerDocument(directListResult, { filePath: 'direct-list.md' }).blocks[0]?.units.length,
	3,
	'the empty inserted row reparses as an addressable list item',
);
const taskInsert = directBlock
	? buildInsertListItemOps(directSnapshot, directBlock.blockId, 1, 'task')
	: null;
assert.equal(
	applyOperations(directSource, taskInsert?.operations ?? []),
	'- Alpha\n- [ ] \n- Beta',
	'the same gap can explicitly insert a task item',
);
const endInsert = directBlock
	? buildInsertListItemOps(directSnapshot, directBlock.blockId, 2, 'list')
	: null;
const directEndResult = applyOperations(directSource, endInsert?.operations ?? []);
assert.equal(directEndResult, '- Alpha\n- Beta\n- ');
assert.equal(
	parseComposerDocument(directEndResult, { filePath: 'direct-list.md' }).blocks[0]?.units.length,
	3,
	'an empty final row also survives reparse for focus restoration',
);

const childUnit = directBlock?.units.find(
	(unit) => unit.unitKind === 'list-item' && directSource.slice(unit.from, unit.to).includes('Beta'),
);
const indentChild = directBlock && childUnit
	? buildIndentListItemOps(directSnapshot, directBlock.blockId, childUnit.unitId, false)
	: null;
assert.ok(indentChild?.handled, 'Tab is owned by a valid persisted list item');
assert.equal(
	applyOperations(directSource, indentChild?.operations ?? []),
	'- Alpha\n\t- Beta',
	'persisted list indentation changes the structural marker, not the text leaf',
);
const nestedSnapshot = parseComposerDocument('- Alpha\n\t- Beta', { filePath: 'direct-list.md' });
const nestedBlock = nestedSnapshot.blocks[0];
const nestedChild = nestedBlock?.units.find((unit) => Boolean(unit.parentUnitId));
const outdentChild = nestedBlock && nestedChild
	? buildIndentListItemOps(nestedSnapshot, nestedBlock.blockId, nestedChild.unitId, true)
	: null;
assert.equal(
	applyOperations(nestedSnapshot.sourceText, outdentChild?.operations ?? []),
	'- Alpha\n- Beta',
	'Shift+Tab promotes a persisted nested item by one source indentation level',
);
const firstUnit = directBlock?.units.find((unit) => unit.unitKind === 'list-item');
const indentFirst = directBlock && firstUnit
	? buildIndentListItemOps(directSnapshot, directBlock.blockId, firstUnit.unitId, false)
	: null;
assert.deepEqual(
	indentFirst,
	{ handled: true, operations: [] },
	'the first item retains focus when it cannot be nested',
);

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const editable = readFileSync(
	'src/ui/view/composer/chrome/EditableText.tsx',
	'utf8',
);
assert.equal(
	existsSync('src/ui/view/composer/chrome/ListItemInsertGap.tsx'),
	false,
	'the pointer-relative list-gap surface is retired',
);
assert.equal(root.includes('<ListItemInsertGap'), false, 'list rendering exposes no hover insertion gap');
assert.ok(root.includes('buildInsertListItemOps'), 'direct insertion goes through Composer transactions');
assert.ok(root.includes('data-unit-id={unit.unitId}'), 'each list item is exposed as an addressable UI unit');
assert.ok(
	root.includes('await chrome.flushAll();') &&
		root.indexOf('await chrome.flushAll();') < root.indexOf('chrome.runtime.session?.snapshot'),
	'Enter flushes native text before resolving the current transaction snapshot',
);
assert.ok(
	root.includes('matchBlocks(snapshot.blocks, currentSnapshot.blocks)'),
	'Enter rematches the edited list block after the flush changes its block id',
);
assert.ok(
	root.includes("onInsertParagraph={") &&
		root.includes("checkbox ? 'task' : 'list'"),
	'Enter inserts a same-kind sibling after the active list or task item',
);
assert.ok(
	editable.includes('onInsertParagraph?: () => void | Promise<void>') &&
		editable.includes('onIndentListItem?:'),
	'the editable leaf routes structural Enter through its object owner',
);

const css = readFileSync('src/styles/composer.css', 'utf8');
assert.match(
	css,
	/\.pk-composer-block\[data-kind='list'\]:hover[\s\S]*?box-shadow:\s*none/,
	'list container hover must not draw one giant selected-block halo',
);
assert.match(
	css,
	/\.pk-composer-list__row:hover[\s\S]*?var\(--pkc-block-hover-bg\)/,
	'list items own the hover feedback',
);
assert.equal(css.includes('pk-composer-list__gap'), false, 'retired list-gap CSS leaves no hidden hit area');

console.log('composer-list-insertion-anchor: passed');
