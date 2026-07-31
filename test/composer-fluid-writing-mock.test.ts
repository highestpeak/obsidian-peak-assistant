import assert from 'assert';
import { readFileSync } from 'fs';

const mock = readFileSync(
	'docs/gstack/peak-composer-fluid-writing-2026-07-30/index.html',
	'utf8',
);

assert.ok(
	mock.includes('function projectMarkdownSource('),
	'interaction mock projects source instead of exposing raw Markdown markers',
);
assert.ok(
	mock.includes('data-markdown-block-kind'),
	'interaction mock styles each Markdown block independently',
);
assert.ok(
	mock.includes('data-structural-token="list"'),
	'list source marker is replaced by a visual bullet',
);
assert.ok(
	mock.includes('.markdown-token[data-structural-token]') &&
		mock.includes('opacity: 1;'),
	'visual marker is not hidden by the source token opacity',
);
assert.ok(
	mock.includes('function restoreSourceSelection('),
	'projection restores the caret by source offset after replacing DOM',
);
assert.ok(
	mock.includes("event.key === 'Tab'") &&
		mock.includes('function indentMarkdownListItems('),
	'interaction mock keeps Tab inside list editing and supports Shift+Tab',
);
assert.ok(
	mock.includes('--list-depth'),
	'interaction mock exposes visible indentation for nested list markers',
);
assert.ok(
	mock.includes('function projectInlineMarkdown(') &&
		mock.includes('data-inline-mark="bold"') &&
		mock.includes('data-inline-mark="italic"') &&
		mock.includes('data-inline-mark="underline"'),
	'interaction mock live-projects bold, italic and underline source',
);
assert.ok(
	mock.includes("key === 'b'") &&
		mock.includes("key === 'i'") &&
		mock.includes("key === 'u'") &&
		mock.includes('function formatMarkdownInlineSelection('),
	'interaction mock owns source-safe bold, italic and underline shortcuts',
);
assert.ok(
	mock.includes('selection.setBaseAndExtent(') &&
		mock.includes('direction: selection.direction'),
	'projection restores the full source selection, including its direction',
);
assert.equal(
	mock.includes('projectMarkdownSource(markdownSource, edit.selectionEnd)'),
	false,
	'formatting never collapses a selected range to its trailing caret',
);
assert.ok(
	mock.includes('function deleteMarkdownSelection(') &&
		mock.includes("inputType.startsWith('delete')"),
	'selection deletion is serialized through Markdown source and removes empty mark shells',
);
assert.ok(
	mock.includes('keyboardFormatGuard') &&
		mock.includes('consumeKeyboardFormatGuard'),
	'keydown and beforeinput share one formatting command owner',
);
assert.ok(
	mock.includes("editor.addEventListener('compositionstart'") &&
		mock.includes("editor.addEventListener('compositionend'") &&
		mock.includes('editorComposing'),
	'IME composition owns the native DOM until compositionend',
);
assert.ok(
	mock.includes('function recordMarkdownHistory(') &&
		mock.includes('function stepMarkdownHistory(') &&
		mock.includes("key === 'z'") &&
		mock.includes("key === 'y'"),
	'manual Markdown history replaces the native undo stack lost during projection',
);
assert.ok(
	mock.includes('function exitInlineMarkdownBeforeBreak('),
	'paragraph insertion exits closing inline delimiters before writing line breaks',
);
assert.equal(
	mock.includes('.markdown-editor[data-kind="heading"]'),
	false,
	'mixed drafts never style the whole editor from only the first block',
);

console.log('composer-fluid-writing-mock: passed');
