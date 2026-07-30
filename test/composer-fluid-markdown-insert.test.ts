import assert from 'assert';
import { readFileSync } from 'fs';
import {
	composerDraftBlockRanges,
	composerDraftHiddenRanges,
	composerDraftPresentationKind,
	insertMarkdownDraftBreak,
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
