import assert from 'node:assert/strict';
import type { ComposerBlock, ComposerDocumentSnapshot } from '@/core/composer';
import {
	composerBlockForAtlasLocation,
	projectFileAtlasQuickActions,
} from '@/app/file-atlas/fileAtlasComposerActions';

function block(blockId: string, from: number, to: number): ComposerBlock {
	return {
		blockId,
		kind: 'paragraph',
		source: { revision: 'r1', from, to, semanticFingerprint: blockId },
		children: [],
		units: [],
		renderModel: { raw: '' },
	};
}

const sourceText = 'Heading\n\nParagraph with https://example.com\n\nFinal';
const snapshot: ComposerDocumentSnapshot = {
	documentId: 'fixture',
	filePath: 'fixture.md',
	revision: 'r1',
	sourceText,
	blocks: [
		block('heading', 0, 7),
		block('paragraph', 9, 43),
		block('final', 45, sourceText.length),
	],
	nativeRefs: [],
};

assert.equal(
	composerBlockForAtlasLocation(snapshot, { line: 2, from: 24, to: 43 })?.blockId,
	'paragraph',
	'a nested external-link range resolves to its owning Composer paragraph',
);
assert.equal(
	composerBlockForAtlasLocation(snapshot, { line: 0, from: 0, to: 7 })?.blockId,
	'heading',
);
assert.equal(
	composerBlockForAtlasLocation(snapshot, { line: 4 })?.blockId,
	'final',
	'line fallback remains available when Atlas has no source offsets',
);

const projectedActions = projectFileAtlasQuickActions([
	{ capabilityId: 'composer.prose.polish-block', title: '润色文本' },
	{ capabilityId: 'composer.prose.polish', title: '润色文本' },
	{ capabilityId: 'composer.prose.add-example', title: '补一个例子' },
]);
assert.deepEqual(
	projectedActions.map((action) => action.capabilityId),
	['composer.prose.polish', 'composer.prose.add-example'],
	'compatibility capabilities do not create duplicate Inspector actions',
);

assert.deepEqual(
	projectFileAtlasQuickActions([
		{ capabilityId: 'composer.prose.polish', title: ' 润色文本 ' },
		{ capabilityId: 'composer.prose.polish-block', title: '润色文本' },
	]).map((action) => action.capabilityId),
	['composer.prose.polish'],
	'visible labels are defensively deduplicated after alias projection',
);

console.log('PASS: File Atlas source ranges resolve to canonical Composer blocks');
