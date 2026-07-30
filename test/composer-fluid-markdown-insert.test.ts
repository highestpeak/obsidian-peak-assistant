import assert from 'assert';
import { readFileSync } from 'fs';
import {
	composerDraftBlockRanges,
	composerDraftHiddenRanges,
	composerDraftPresentationKind,
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

const root = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
assert.ok(
	root.includes("panel: 'insert-draft'") &&
		root.includes("initialTypeId: 'markdown'"),
	'primary insert click opens the Markdown draft directly',
);

const draft = readFileSync('src/ui/view/composer/chrome/NewBlockDraft.tsx', 'utf8');
assert.ok(draft.includes('insertMarkdownDraftBreak'));
assert.ok(draft.includes('event.metaKey || event.ctrlKey'));
assert.ok(draft.includes('composerDraftBlockRanges(projection.text)'));

console.log('composer-fluid-markdown-insert: passed');
