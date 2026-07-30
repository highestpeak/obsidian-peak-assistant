import assert from 'assert';
import { readFileSync } from 'fs';
import {
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
assert.ok(draft.includes('composerDraftPresentationKind(source)'));

console.log('composer-fluid-markdown-insert: passed');
