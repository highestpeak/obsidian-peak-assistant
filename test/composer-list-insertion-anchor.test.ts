import assert from 'assert';
import { readFileSync } from 'fs';
import {
	createListItemPatchMaterializer,
	insertValidatedListItem,
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

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
assert.ok(root.includes('pk-composer-list__gap-anchor'), 'each top-level list gap has a visible interaction anchor');
assert.ok(root.includes("kind: 'list-gap'"), 'gap invocation carries typed placement instead of prompt-only hints');
assert.ok(root.includes('data-unit-id={unit.unitId}'), 'each list item is exposed as an addressable UI unit');
assert.ok(root.includes('onPointerMove={trackListGapPointer}'), 'list-item plus follows the pointer horizontally');
assert.ok(
	root.includes('onPointerEnter={() => openListGap(index)}'),
	'hovering the list-item plus opens its existing typed gap form',
);
assert.equal(
	root.includes('onClick={() => setActiveGapIndex(index)}'),
	false,
	'list-item gap no longer requires a click to open',
);
assert.ok(
	root.includes('suppressedGapIndex'),
	'closing the hover-opened form suppresses re-open until the pointer leaves that gap',
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
	'list-item plus uses the same pointer-relative horizontal anchor',
);

console.log('composer-list-insertion-anchor: passed');
