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
const listPrefix = '- ';
const listPrefixHidden = composerDraftHiddenRanges(listPrefix);
const listPrefixHtml = renderContentEditableProjection(
	projectSourceVisualParts(listPrefix, 0, {
		hiddenRanges: listPrefixHidden,
		mathMode: 'source',
	}),
	undefined,
	listPrefixHidden,
	composerDraftBlockRanges(listPrefix),
);
assert.ok(
	listPrefixHtml.includes('class="pk-composer-source-anchor"') &&
		listPrefixHtml.includes('data-src-text-from="2"'),
	'a structural-only prefix keeps an editable source anchor after its hidden token',
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
const sharedEditor = readFileSync(
	'src/ui/view/composer/chrome/MarkdownSourceEditor.tsx',
	'utf8',
);
assert.ok(
	editable.includes('<MarkdownSourceEditor'),
	'existing Markdown leaves use the shared production editor',
);
assert.ok(
	editable.includes('editable && Boolean(hub)'),
	'only the browser-editable branch relinquishes child ownership',
);
assert.ok(
	sharedEditor.includes('dangerouslySetInnerHTML={{ __html: projectionHtml }}'),
	'the shared editor owns the only browser-editable unmanaged subtree',
);

const draft = readFileSync('src/ui/view/composer/chrome/NewBlockDraft.tsx', 'utf8');
assert.ok(
	draft.includes('<MarkdownSourceEditor'),
	'new Markdown drafts use the same production editor component',
);
assert.equal(
	draft.includes('key={projection.version}'),
	false,
	'draft projection never unmounts React-owned descendants after native deletion',
);
assert.ok(
	sharedEditor.includes('composerDraftBlockRanges(renderState.text)'),
	'shared editor computes independent visual ranges for mixed Markdown blocks',
);
assert.ok(
	sharedEditor.includes("event.key === 'Tab'") &&
		sharedEditor.includes('indentMarkdownDraftListItems'),
	'Tab and Shift+Tab are owned by the Markdown draft while focus is in a list',
);
assert.ok(
		sharedEditor.includes("key === 'b'") &&
		sharedEditor.includes("key === 'i'") &&
		sharedEditor.includes("key === 'u'") &&
		sharedEditor.includes("inputType === 'formatBold'") &&
		sharedEditor.includes("inputType === 'formatItalic'") &&
		sharedEditor.includes("inputType === 'formatUnderline'") &&
		sharedEditor.includes('formatMarkdownDraftSelection'),
	'keyboard and beforeinput formatting are serialized through Markdown source instead of native rich DOM',
);
assert.ok(
	sharedEditor.includes("win.addEventListener('keydown', capture, true)") &&
		sharedEditor.includes('event.stopImmediatePropagation()'),
	'focused formatting shortcuts capture before Obsidian host keymaps',
);

console.log('composer-contenteditable-dom-ownership: passed');
