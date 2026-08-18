import assert from 'node:assert/strict';
import {
	shouldHydrateComposerBlockEditor,
	shouldUseComposerStaticBlockRow,
} from '@/ui/view/composer/virtualization';

const noPins = new Set<string>();
const focusPin = new Set(['block-b']);

assert.equal(
	shouldHydrateComposerBlockEditor(false, true, 'block-a', 'block-a', noPins),
	false,
	'clean/read-only display never mounts an editor',
);
assert.equal(
	shouldHydrateComposerBlockEditor(true, false, 'block-a', null, noPins),
	true,
	'short documents preserve the complete editing surface',
);
assert.equal(
	shouldHydrateComposerBlockEditor(true, true, 'block-a', null, noPins),
	false,
	'an inactive long-document block remains a static visual projection',
);
assert.equal(
	shouldHydrateComposerBlockEditor(true, true, 'block-a', 'block-a', noPins),
	true,
	'the explicitly activated block hydrates its editor',
);
assert.equal(
	shouldHydrateComposerBlockEditor(true, true, 'block-b', null, focusPin),
	true,
	'a hard-pinned interaction block remains fully hydrated',
);
assert.equal(
	shouldHydrateComposerBlockEditor(true, true, 'block-a', 'block-b', focusPin),
	false,
	'activation and hard pins do not hydrate unrelated viewport blocks',
);

assert.equal(
	shouldUseComposerStaticBlockRow(true, false, 'paragraph', 0, 0, false),
	true,
	'an ordinary long-document paragraph uses the low-allocation visual row',
);
assert.equal(
	shouldUseComposerStaticBlockRow(true, true, 'paragraph', 0, 0, false),
	false,
	'an active editor always upgrades to the complete Composer row',
);
assert.equal(
	shouldUseComposerStaticBlockRow(true, false, 'paragraph', 1, 0, false),
	false,
	'AI candidate state keeps its complete review surface',
);
assert.equal(
	shouldUseComposerStaticBlockRow(true, false, 'paragraph', 0, 1, false),
	false,
	'finding state keeps its complete review surface',
);
assert.equal(
	shouldUseComposerStaticBlockRow(true, false, 'paragraph', 0, 0, true),
	false,
	'invoke errors remain visible on the complete row',
);
assert.equal(
	shouldUseComposerStaticBlockRow(true, false, 'table', 0, 0, false),
	false,
	'object renderers keep their specialized complete row',
);

console.log('composer-editor-hydration-policy: 12 checks passed');
