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
	!root.includes('disclosureClearance') &&
	!root.includes('setCollectionActionAnchorTop(Math.max('),
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
	/\.pk-composer-collection-handle-zone\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*var\(--pk-composer-collection-anchor-top\);[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;/,
	'the collection handle zone must follow the measured unit with a fixed 30px hit target',
);
assert.match(
	css,
	/\.pk-composer-block\[data-unitized='true'\]\s*>\s*\.pk-composer-rail\s*\{[\s\S]*?left:\s*-54px;[\s\S]*?padding-top:\s*0;/,
	'unitized blocks must place disclosure in the outer structural-rail lane',
);
assert.match(
	css,
	/\.pk-composer-block\[data-unitized='true'\]\s*>\s*\.pk-composer-collection-handle-zone\s*\{[\s\S]*?left:\s*-22px;/,
	'the active-unit six-dot handle must use the inner lane instead of covering disclosure',
);
assert.match(
	css,
	/\.pk-composer-block\[data-unitized='true'\]\s*>\s*\.pk-composer-collection-handle-zone::before\s*\{[\s\S]*?inset:\s*-3px -2px -3px -4px;/,
	'the inner rail lane must stop its transparent pointer bridge at the text edge',
);
assert.match(
	css,
	/\.pk-composer-block\[data-unitized='true'\][\s\S]*?\.pk-composer-collection-handle__label\s*\{[\s\S]*?right:\s*calc\(100% \+ 39px\);/,
	'the six-dot label must clear the adjacent outer-lane disclosure',
);
assert.match(
	css,
	/@media \(max-width: 720px\)[\s\S]*?\.peak-composer-root \.pk-composer-shell\s*\{[\s\S]*?padding-left:\s*50px;/,
	'the narrow paper must retain enough left-side room for both unitized rail lanes',
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
