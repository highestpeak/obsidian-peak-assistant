import assert from 'assert';
import { readFileSync } from 'fs';
import {
	composerDraftBlockRanges,
	composerDraftHiddenRanges,
	composerDraftPresentationKind,
	deleteMarkdownDraftSelection,
	formatMarkdownDraftSelection,
	indentMarkdownDraftListItems,
	insertMarkdownDraftBreak,
	projectSourceVisualParts,
} from '@/service/composer';
import { DEFAULT_COMPOSER_CONFIG } from '@/ui/view/composer/config/composerConfig';

const types = DEFAULT_COMPOSER_CONFIG.chrome.insertDraft.types;
assert.deepEqual(
	types.map((type) => type.id),
	['markdown', 'image', 'table', 'base', 'canvas', 'excalidraw'],
	'ordinary Markdown semantics collapse into one direct entry',
);
assert.equal(types[0]?.default, true);
assert.equal(types[0]?.initialValue, '');

assert.equal(composerDraftPresentationKind('# Title'), 'heading');
assert.equal(composerDraftPresentationKind('- item'), 'list');
assert.equal(composerDraftPresentationKind('- [ ] item'), 'task');
assert.equal(composerDraftPresentationKind('> quote'), 'quote');
assert.equal(composerDraftPresentationKind('> [!note]\n> body'), 'callout');
assert.equal(composerDraftPresentationKind('```ts\nconst ok = true;\n```'), 'code');
assert.equal(composerDraftPresentationKind('$$x^2$$'), 'math');
assert.equal(composerDraftPresentationKind('plain'), 'paragraph');

const mixedSource = '# Title\n\nIntro\n\n- first\n- second';
const mixedBlocks = composerDraftBlockRanges(mixedSource);
assert.deepEqual(
	mixedBlocks.map((block) => ({
		kind: block.kind,
		source: mixedSource.slice(block.from, block.to),
	})),
	[
		{ kind: 'heading', source: '# Title' },
		{ kind: 'paragraph', source: 'Intro' },
		{ kind: 'list', source: '- first\n- second' },
	],
	'each block keeps an independent visual range in a mixed Markdown draft',
);
const mixedHidden = composerDraftHiddenRanges(mixedSource).map((range) => ({
	role: range.role,
	source: mixedSource.slice(range.from, range.to),
}));
assert.deepEqual(
	mixedHidden,
	[
		{ role: 'heading', source: '# ' },
		{ role: 'list', source: '- ' },
		{ role: 'list', source: '- ' },
	],
	`list markers remain source bytes but are projected as visual bullets: ${JSON.stringify(mixedHidden)}`,
);

const list = insertMarkdownDraftBreak('- first', 7, 7);
assert.equal(list.value, '- first\n- ');
assert.equal(list.selectionStart, list.value.length);

const task = insertMarkdownDraftBreak('- [x] done', 10, 10);
assert.equal(task.value, '- [x] done\n- [ ] ');

const nested = indentMarkdownDraftListItems('- parent\n- child', 16, 16);
assert.ok(nested, 'Tab is handled inside a list item');
assert.equal(nested?.value, '- parent\n\t- child');
assert.equal(nested?.selectionStart, 17);
assert.deepEqual(
	composerDraftHiddenRanges(nested?.value ?? '').map((range) => ({
		role: range.role,
		depth: range.depth,
		source: nested?.value.slice(range.from, range.to),
	})),
	[
		{ role: 'list', depth: 0, source: '- ' },
		{ role: 'list', depth: 1, source: '\t- ' },
	],
	'nested list markers retain source indentation and expose visual depth',
);
const nestedBreak = insertMarkdownDraftBreak(
	nested?.value ?? '',
	nested?.selectionStart ?? 0,
	nested?.selectionEnd ?? 0,
);
assert.equal(nestedBreak.value, '- parent\n\t- child\n\t- ');

const outdented = indentMarkdownDraftListItems(
	nestedBreak.value,
	nestedBreak.selectionStart,
	nestedBreak.selectionEnd,
	true,
);
assert.equal(outdented?.value, '- parent\n\t- child\n- ');

const selectedItems = '- parent\n- child\n- sibling';
const multiIndent = indentMarkdownDraftListItems(
	selectedItems,
	selectedItems.indexOf('- child'),
	selectedItems.length,
);
assert.equal(multiIndent?.value, '- parent\n\t- child\n\t- sibling');
assert.equal(
	indentMarkdownDraftListItems('Paragraph', 4, 4),
	null,
	'Tab outside a list remains native focus navigation',
);
assert.deepEqual(
	indentMarkdownDraftListItems('- first', 4, 4),
	{ value: '- first', selectionStart: 4, selectionEnd: 4 },
	'first list item keeps focus but cannot indent without a parent item',
);
assert.equal(
	indentMarkdownDraftListItems('1. parent\n2. child', 18, 18)?.value,
	'1. parent\n\t2. child',
	'ordered items use the same source-safe nesting behavior',
);
assert.equal(
	indentMarkdownDraftListItems('- [ ] parent\n- [x] child', 24, 24)?.value,
	'- [ ] parent\n\t- [x] child',
	'task items preserve their checkbox marker while nesting',
);

assert.deepEqual(
	formatMarkdownDraftSelection('plain', 0, 5, 'bold'),
	{
		value: '**plain**',
		selectionStart: 2,
		selectionEnd: 7,
	},
	'Cmd/Ctrl+B writes canonical Markdown instead of browser-owned rich DOM',
);
assert.deepEqual(
	formatMarkdownDraftSelection('say ', 4, 4, 'italic'),
	{
		value: 'say **',
		selectionStart: 5,
		selectionEnd: 5,
	},
	'a collapsed italic shortcut inserts a source pair and leaves the caret inside',
);
assert.deepEqual(
	formatMarkdownDraftSelection('under', 0, 5, 'underline'),
	{
		value: '<span style="text-decoration-line: underline">under</span>',
		selectionStart: 46,
		selectionEnd: 51,
	},
	'underline uses the canonical HTML style syntax supported by Obsidian Markdown',
);
assert.equal(
	formatMarkdownDraftSelection('**bold**', 2, 6, 'underline')?.value,
	'<span style="font-weight: 700; text-decoration-line: underline">bold</span>',
	'adding an HTML-backed mark canonicalizes the whole overlapping style stack',
);
assert.deepEqual(
	formatMarkdownDraftSelection('*italic*', 1, 7, 'italic'),
	{ value: 'italic', selectionStart: 0, selectionEnd: 6 },
	'repeating italic over its complete visible run toggles the source wrapper off',
);
const canonicalUnderline = '<span style="text-decoration-line: underline">under</span>';
assert.deepEqual(
	formatMarkdownDraftSelection(
		canonicalUnderline,
		canonicalUnderline.lastIndexOf('under'),
		canonicalUnderline.indexOf('</span>'),
		'underline',
	),
	{ value: 'under', selectionStart: 0, selectionEnd: 5 },
	'repeating underline removes only the canonical underline wrapper',
);
assert.equal(
	formatMarkdownDraftSelection('```ts\ncode\n```', 7, 11, 'bold'),
	null,
	'format shortcuts stay disabled inside code blocks',
);

const inlineProjection = projectSourceVisualParts(
	'**bold** *italic* <u>under</u>',
	0,
	{ mathMode: 'source' },
);
assert.ok(
	inlineProjection.some(
		(part) => part.kind === 'run' && part.text === 'bold' && part.style.bold,
	),
	'Markdown drafts visibly project bold source',
);
assert.ok(
	inlineProjection.some(
		(part) => part.kind === 'run' && part.text === 'italic' && part.style.italic,
	),
	'Markdown drafts visibly project italic source',
);
assert.ok(
	inlineProjection.some(
		(part) => part.kind === 'run' && part.text === 'under' && part.style.underline,
	),
	'Markdown drafts visibly project underline source',
);

const exitList = insertMarkdownDraftBreak('- first\n- ', 10, 10);
assert.equal(exitList.value, '- first\n\n');
assert.equal(exitList.selectionStart, exitList.value.length);

const paragraph = insertMarkdownDraftBreak('First', 5, 5);
assert.equal(paragraph.value, 'First\n\n');

const softBreak = insertMarkdownDraftBreak('First', 5, 5, true);
assert.equal(softBreak.value, 'First\n');

for (const formattedBreak of [
	{ source: '**bold**', caret: 6, expected: '**bold**\n\n' },
	{ source: '*italic*', caret: 7, expected: '*italic*\n\n' },
	{
		source: '<span style="text-decoration-line: underline">under</span>',
		caret: '<span style="text-decoration-line: underline">under</span>'.indexOf('</span>'),
		expected: '<span style="text-decoration-line: underline">under</span>\n\n',
	},
]) {
	const edit = insertMarkdownDraftBreak(
		formattedBreak.source,
		formattedBreak.caret,
		formattedBreak.caret,
	);
	assert.equal(edit.value, formattedBreak.expected, 'Enter exits the adjacent inline closing stack');
	assert.equal(edit.selectionStart, formattedBreak.expected.length);
}

const formattedNestedList = '- parent\n\t- **child**';
const nestedFormattedBreak = insertMarkdownDraftBreak(
	formattedNestedList,
	formattedNestedList.indexOf('**', formattedNestedList.indexOf('child') + 'child'.length),
	formattedNestedList.indexOf('**', formattedNestedList.indexOf('child') + 'child'.length),
);
assert.equal(
	nestedFormattedBreak.value,
	'- parent\n\t- **child**\n\t- ',
	'list continuation happens after the closing inline delimiter',
);

assert.deepEqual(
	deleteMarkdownDraftSelection('**bold**', 2, 6),
	{ value: '', selectionStart: 0, selectionEnd: 0 },
	'deleting selected formatted text removes the empty Markdown wrapper',
);
const underlined = '<span style="text-decoration-line: underline">under</span>';
assert.deepEqual(
	deleteMarkdownDraftSelection(
		underlined,
		underlined.lastIndexOf('under'),
		underlined.indexOf('</span>'),
	),
	{ value: '', selectionStart: 0, selectionEnd: 0 },
	'deleting selected formatted text removes the empty canonical HTML wrapper',
);

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
assert.ok(
	root.includes("panel: 'insert-draft'") &&
		root.includes("initialTypeId: 'markdown'"),
	'primary insert click opens the Markdown draft directly',
);

const draft = readFileSync('src/ui/view/composer/chrome/NewBlockDraft.tsx', 'utf8');
const sharedEditor = readFileSync(
	'src/ui/view/composer/chrome/MarkdownSourceEditor.tsx',
	'utf8',
);
assert.ok(draft.includes('<MarkdownSourceEditor'));
assert.equal(
	draft.includes('contentEditable'),
	false,
	'the draft no longer owns an independent contenteditable lifecycle',
);
assert.ok(sharedEditor.includes('insertMarkdownDraftBreak'));
assert.ok(sharedEditor.includes('keyboardCommandGuard'));
assert.ok(sharedEditor.includes('onCompositionStart'));

console.log('composer-fluid-markdown-insert: passed');
