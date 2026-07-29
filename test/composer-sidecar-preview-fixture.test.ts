import assert from 'assert';
import { formatCopilotContextLabel } from '@/ui/view/composer/sidecar/CopilotView';
import { DEFAULT_SIDECAR_CONFIG } from '@/ui/view/composer/sidecar/sidecarConfig';
import { resolveSidecarPreviewFixture } from '@/ui/view/composer/sidecar/previewFixture';

const focus = {
	anchorId: 'heading-0-qa',
	documentId: 'Peak Composer Visual Parity QA.md',
};

const fixture = resolveSidecarPreviewFixture(
	'/vault/Peak Composer Visual Parity QA.md',
	DEFAULT_SIDECAR_CONFIG,
	focus,
);
assert.ok(fixture, 'the canonical visual QA note receives an explicit preview fixture');
assert.equal(fixture?.related.items.length, 3);
assert.equal(fixture?.thoughts.length, 2);
assert.equal(fixture?.related.focus.anchorId, focus.anchorId);
assert.ok(
	fixture?.related.items.every((item) => item.path.endsWith('.md')),
	'preview materials point at real Vault Markdown paths',
);
assert.ok(
	Object.values(fixture?.related.reasonBySourceId ?? {}).every(Boolean),
	'every preview material explains why it is related',
);

const ordinary = resolveSidecarPreviewFixture(
	'/vault/ordinary-note.md',
	DEFAULT_SIDECAR_CONFIG,
	{ anchorId: 'paragraph-1', documentId: 'ordinary-note.md' },
);
assert.equal(ordinary, null, 'ordinary documents never receive fixture data');

assert.equal(
	formatCopilotContextLabel('---\ncreated: 2023-10-15\n# 正文标题\n下一行', '当前正文'),
	'正文标题',
	'prompt context skips frontmatter and strips Markdown heading syntax',
);
assert.equal(
	formatCopilotContextLabel('- [ ] 补充一句清晰的下一步', '当前正文'),
	'补充一句清晰的下一步',
	'prompt context strips task-list syntax',
);

console.log('composer-sidecar-preview-fixture: passed');
