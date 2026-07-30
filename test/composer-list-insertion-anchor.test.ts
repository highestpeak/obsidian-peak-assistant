import assert from 'assert';
import { readFileSync } from 'fs';
import { applyOperations } from '@/core/composer';
import {
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

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const gap = readFileSync(
	'src/ui/view/composer/chrome/ListItemInsertGap.tsx',
	'utf8',
);
assert.ok(root.includes('<ListItemInsertGap'), 'each top-level list gap uses the shared insertion grammar');
assert.ok(root.includes('buildInsertListItemOps'), 'direct insertion goes through Composer transactions');
assert.ok(root.includes("kind: 'list-gap'"), 'gap invocation carries typed placement instead of prompt-only hints');
assert.ok(root.includes('data-unit-id={unit.unitId}'), 'each list item is exposed as an addressable UI unit');
assert.ok(
	gap.includes('onPointerEnter={acquire}'),
	'the list gap captures the pointer position once on entry',
);
assert.equal(
	gap.includes('onPointerMove='),
	false,
	'the list plus does not drift with continuous pointer movement',
);
assert.ok(
	gap.includes('anchorCaptured.current = true'),
	'repeated synthetic pointer-enter events cannot overwrite the acquired list anchor',
);
assert.ok(
	gap.includes('onPointerEnter={scheduleOpen}'),
	'hovering the stable plus opens the direct insertion menu',
);
assert.ok(
	gap.includes("onClick={() => insert('list')}") &&
		gap.includes("onClick={() => insert('task')}"),
	'list and task insertion are direct first-class choices',
);
assert.ok(
	gap.includes("onClick={() => setMode('ai')}"),
	'the descriptive AI input requires an explicit Sparkles choice',
);
assert.ok(
	gap.includes("mode === 'ai'"),
	'the AI prompt is not the default hover surface',
);
assert.ok(
	gap.includes('setSuppressed(true)'),
	'completed insertion suppresses re-open until the pointer leaves that gap',
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
assert.match(
	css,
	/\.pk-composer-list__gap-trigger\s*\{[\s\S]*?left:\s*clamp\(/,
	'list-item plus uses the same captured pointer-relative horizontal anchor',
);
assert.match(
	css,
	/\.pk-composer-list__gap-trigger\s*\{[\s\S]*?margin:\s*-10px 0 0 -10px !important;[\s\S]*?transform:\s*none !important;/,
	'the list plus cannot jump when the Obsidian hover reset changes transform',
);

console.log('composer-list-insertion-anchor: passed');
