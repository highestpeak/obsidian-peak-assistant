import assert from 'node:assert/strict';
import { shouldHydrateComposerBlockEditor } from '@/ui/view/composer/virtualization';

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

console.log('composer-editor-hydration-policy: 6 checks passed');
