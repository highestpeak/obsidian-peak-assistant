import assert from 'assert';
import { readFileSync } from 'fs';

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const rail = readFileSync('src/ui/view/composer/chrome/BlockRail.tsx', 'utf8');
const actionRow = readFileSync('src/ui/view/composer/chrome/BlockActionRow.tsx', 'utf8');
const css = readFileSync('src/styles/composer.css', 'utf8');
const config = readFileSync('src/ui/view/composer/config/composerConfig.ts', 'utf8');
const configJson = JSON.parse(readFileSync('templates/config/composer.json', 'utf8'));

assert.ok(
	root.includes('const collectionFollowsUnit = unitized;') &&
	root.includes('collectionActionAnchor') &&
	root.includes('collectionActionAnchorTop'),
	'list items and paragraph lines must share one viewport-local collection anchor separate from unit AI targets',
);
assert.ok(
	root.includes('<CollectionActionHandle') &&
	root.includes('data-collection-anchor-unit') &&
	root.includes("'--pk-composer-collection-anchor-top'") &&
	root.includes('React.useState<ComposerUnitActionAnchor | null>(null)') &&
	!root.includes('firstCollectionActionAnchor(block, snapshot)'),
	'the single collection handle must be projected beside the current visible item',
);
assert.ok(
	root.includes('(rowRect.height - 30) / 2') &&
	!root.includes('disclosureClearance'),
	'the handle must follow the active unit center instead of being clamped to the block-top disclosure',
);
assert.ok(
	root.includes('data-unit-collection-action-for') &&
	root.includes('data-collection-placement') &&
	root.includes('{!collectionFollowsUnit ? blockActionRow : null}'),
	'list collection actions must render in the active unit slot instead of at the block tail',
);
assert.ok(
	root.includes('collectionActionPinned') &&
	root.includes('closestVisibleCollectionAnchor') &&
	root.includes('blockDragThresholdPx'),
	'click pinning, scroll re-anchoring, and drag intent must remain explicit behaviors',
);

assert.ok(
	rail.includes('export function CollectionActionHandle') &&
	rail.includes('pk-composer-collection-handle-zone') &&
	rail.includes('aria-pressed={pinned}') &&
	rail.includes('data-collection-handle="true"'),
	'the collection trigger must expose one accessible pressed state inside a single enlarged interaction zone',
);
assert.ok(
	actionRow.includes('scopeLabel?: string') &&
	actionRow.includes('data-scope-kind={scopeKind}') &&
	actionRow.includes('pk-block-action-row__scope'),
	'item and whole-list rows must label their scope inside the unchanged BlockActionRow',
);

assert.match(
	css,
	/\.pk-composer-collection-handle-zone\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*var\(--pk-composer-collection-anchor-top\);[\s\S]*?left:\s*-43px;[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;/,
	'the collection handle zone must reuse the original rail x-coordinate while following the measured unit',
);
assert.match(
	css,
	/\.pk-composer-collection-handle-zone::before\s*\{[\s\S]*?inset:\s*-3px -13px -3px -6px;/,
	'the rail control must have a transparent pointer bridge that reaches the block edge without changing visible geometry',
);
assert.equal(
	css.includes('.pk-composer-block[data-collection-anchor-unit]:hover > .pk-composer-collection-handle'),
	false,
	'block hover alone must never reveal a stale first-item handle',
);
assert.match(
	css,
	/\.pk-composer-unit-action-slot\[data-unit-collection-action-for\][\s\S]*?margin-top:[\s\S]*?\.pk-block-action-row__scope\[data-scope-kind='collection'\]/,
	'the in-flow collection row must reserve local space and carry a distinct collection scope chip',
);
assert.match(
	css,
	/\.pk-composer-block\[data-collection-action-active\]::before\s*\{[\s\S]*?background:\s*var\(--pk-accent\)/,
	'a visible left rail must communicate whole-list scope even when the list edges are off-screen',
);

for (const key of [
	'collectionHandle',
	'collectionScope',
	'unitScope',
	'paragraphHandle',
	'paragraphScope',
	'lineScope',
]) {
	assert.ok(
		key in configJson.chrome.actions && config.includes(`${key}: string;`),
		`Composer action copy must configure ${key}`,
	);
}
assert.equal(configJson.chrome.blockDragThresholdPx, 6);

console.log('composer-long-list-action-anchor: passed');
