import assert from 'assert';
import { readFileSync } from 'fs';
import { projectSourceVisualParts } from '@/service/composer';
import { renderContentEditableProjection } from '@/ui/view/composer/chrome/contentEditableProjection';

const hostile = '<img src=x onerror="boom"> **safe**';
const parts = projectSourceVisualParts(hostile, 12, { mathMode: 'source' });
const html = renderContentEditableProjection(parts, 'unit-1');

assert.ok(html.includes('&lt;img'), 'native projection escapes source text');
assert.equal(html.includes('<img'), false, 'source text cannot create executable elements');
assert.ok(html.includes('data-unit-id="unit-1"'), 'selection identity survives unmanaged projection');
assert.equal(
	renderContentEditableProjection(projectSourceVisualParts('', 0), undefined),
	'',
	'an empty editable owns no React child or placeholder span',
);

const editable = readFileSync('src/ui/view/composer/chrome/EditableText.tsx', 'utf8');
assert.ok(
	editable.includes('dangerouslySetInnerHTML={editableProjection}'),
	'editable body projects unmanaged innerHTML instead of React-owned child fibers',
);
assert.ok(
	editable.includes('editable && Boolean(hub)'),
	'only the browser-editable branch relinquishes child ownership',
);

const draft = readFileSync('src/ui/view/composer/chrome/NewBlockDraft.tsx', 'utf8');
assert.ok(
	draft.includes('dangerouslySetInnerHTML={{ __html: projectionHtml }}'),
	'new Markdown drafts use the same single-owner DOM contract',
);
assert.equal(
	draft.includes('key={projection.version}'),
	false,
	'draft projection never unmounts React-owned descendants after native deletion',
);

console.log('composer-contenteditable-dom-ownership: passed');
