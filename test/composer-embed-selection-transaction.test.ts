import assert from 'assert';
import { readFileSync } from 'fs';

const adapter = readFileSync('src/app/composer/ObsidianComposerEmbedAnchorAdapter.ts', 'utf8');
const view = readFileSync('src/ui/view/composer/blocks/embed/EmbedBlockView.tsx', 'utf8');
const renderer = readFileSync('src/app/composer/ObsidianComposerNativeEmbedRenderer.ts', 'utf8');

assert.match(
	adapter,
	/current !== after/,
	'anchor rollback must fail closed if the target note changed after the first write',
);
assert.match(
	view,
	/await mutation\.rollback\(\)/,
	'target anchor changes must be compensated when the parent Composer commit fails',
);
assert.match(
	view,
	/await port\.releaseSelection/,
	'returning to the full preview must release Composer-owned target anchors',
);
assert.doesNotMatch(
	renderer,
	/host\.replaceChildren\(/,
	'the Obsidian renderer must never replace React-owned host children',
);
assert.match(
	renderer,
	/host\.ownerDocument\.createElement/,
	'Obsidian Markdown must render into its own imperative child mount',
);

console.log('composer-embed-selection-transaction: passed');
