import assert from 'assert';
import { readFileSync } from 'fs';
import {
	composerDraftBlockRanges,
	composerDraftHiddenRanges,
	projectSourceVisualParts,
} from '@/service/composer';
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

const mixed = '# Title\n\nParagraph\n\n- first\n- second';
const mixedHidden = composerDraftHiddenRanges(mixed);
const mixedHtml = renderContentEditableProjection(
	projectSourceVisualParts(mixed, 0, {
		hiddenRanges: mixedHidden,
		mathMode: 'source',
	}),
	undefined,
	mixedHidden,
	composerDraftBlockRanges(mixed),
);
assert.ok(
	mixedHtml.includes('data-markdown-block-kind="heading"') &&
		mixedHtml.includes('data-markdown-block-kind="paragraph"') &&
		mixedHtml.includes('data-markdown-block-kind="list"'),
	'mixed Markdown is wrapped by block range instead of inheriting the first block kind',
);
assert.equal(
	(mixedHtml.match(/data-structural-token="list"/g) ?? []).length,
	2,
	'each list item owns one visual marker while retaining its source token',
);
assert.equal(
	mixedHtml.replace(/<[^>]+>/g, ''),
	mixed,
	'block wrappers keep the mixed Markdown source byte-identical in textContent order',
);
const composerCss = readFileSync('src/styles/composer.css', 'utf8');
assert.ok(
	composerCss.includes('.pk-composer-source-token[data-structural-token]') &&
		composerCss.includes('opacity: 1;'),
	'structural pseudo markers override the hidden source token opacity',
);
assert.ok(
	composerCss.includes('--pk-composer-list-depth'),
	'nested list markers project source indentation into visible offset',
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
assert.ok(
	draft.includes('composerDraftBlockRanges(projection.text)'),
	'draft projection computes independent visual ranges for mixed Markdown blocks',
);
assert.ok(
	draft.includes("event.key === 'Tab'") &&
		draft.includes('indentMarkdownDraftListItems'),
	'Tab and Shift+Tab are owned by the Markdown draft while focus is in a list',
);
assert.ok(
	draft.includes("key === 'b'") &&
		draft.includes("key === 'i'") &&
		draft.includes("key === 'u'") &&
		draft.includes("native.inputType === 'formatBold'") &&
		draft.includes("native.inputType === 'formatItalic'") &&
		draft.includes("native.inputType === 'formatUnderline'") &&
		draft.includes('formatMarkdownDraftSelection'),
	'keyboard and beforeinput formatting are serialized through Markdown source instead of native rich DOM',
);

console.log('composer-contenteditable-dom-ownership: passed');
