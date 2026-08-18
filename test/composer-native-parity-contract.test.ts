import assert from 'assert';
import { readFileSync } from 'fs';
import {
	composerDocumentRenamePath,
	composerDocumentTitle,
	normalizeComposerContentWidth,
	normalizeComposerDocumentTitleDraft,
	type ComposerContentWidth,
} from '@/core/composer';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';

const nativeAffordance = readFileSync(
	'src/app/composer/NativeMarkdownComposerAffordance.tsx',
	'utf8',
);
const composerRoot = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const composerTitle = readFileSync(
	'src/ui/view/composer/chrome/ComposerDocumentTitle.tsx',
	'utf8',
);
const composerView = readFileSync('src/app/composer/DocumentComposerView.ts', 'utf8');
const undoRedoBar = readFileSync('src/ui/view/composer/chrome/UndoRedoBar.tsx', 'utf8');
const composerCss = readFileSync('src/styles/composer.css', 'utf8');
const frontmatterCss = readFileSync('src/styles/composer-fm-math.css', 'utf8');
const settingsTypes = readFileSync('src/core/config/settingsTypes.ts', 'utf8');
const settingsLoader = readFileSync('src/app/settings/PluginSettingsLoader.ts', 'utf8');

assert.equal(composerDocumentTitle('Notes/做过的事情-做成的事情.md'), '做过的事情-做成的事情');
assert.equal(composerDocumentTitle('Root.md'), 'Root');
assert.equal(composerDocumentTitle('Windows\\Path\\Plan.MD'), 'Plan');
assert.deepStrictEqual(normalizeComposerDocumentTitleDraft('  新标题.md  '), {
	ok: true,
	title: '新标题',
});
assert.deepStrictEqual(normalizeComposerDocumentTitleDraft('Folder/新标题'), {
	ok: false,
	reason: 'path-separator',
});
assert.deepStrictEqual(normalizeComposerDocumentTitleDraft('  .md  '), {
	ok: false,
	reason: 'empty',
});
assert.equal(
	composerDocumentRenamePath('Notes/旧标题.md', '新标题'),
	'Notes/新标题.md',
	'title edits preserve the current Vault folder and Markdown extension',
);

const readable: ComposerContentWidth = normalizeComposerContentWidth(undefined);
assert.equal(readable, 'readable', 'unknown values fail safe to the readable document width');
assert.equal(normalizeComposerContentWidth('wide'), 'wide');
assert.equal(normalizeComposerContentWidth('narrow'), 'readable', 'legacy or unknown labels do not widen implicitly');
assert.equal(normalizePluginSettings({}).composer.contentWidth, 'readable');
assert.equal(
	normalizePluginSettings({ composer: { contentWidth: 'wide' } }).composer.contentWidth,
	'wide',
	'workspace settings preserve an explicit wide choice',
);

assert.match(
	nativeAffordance,
	/querySelector<HTMLElement>\(\s*'\.view-header-nav-buttons'/,
	'the Native Markdown return action resolves the real Obsidian navigation group',
);
assert.match(
	nativeAffordance,
	/insertAdjacentElement\('afterend', container\)/,
	'the return action sits immediately after native Back and Forward',
);
assert.doesNotMatch(
	nativeAffordance,
	/contentEl\.appendChild\(container\)/,
	'the return action must not float over Markdown content',
);

assert.match(undoRedoBar, /contentWidth: ComposerContentWidth/);
assert.match(undoRedoBar, /pk-composer-content-width-toggle/);
assert.match(
	composerRoot,
	/<ComposerDocumentTitle[\s\S]*?filePath=\{snapshot\.filePath\}[\s\S]*?onRename=\{onRenameDocumentTitle\}/,
	'the document title receives the app-owned rename action',
);
assert.ok(
	composerRoot.indexOf('<ComposerDocumentTitle') < composerRoot.indexOf('<AddFrontmatterEntry'),
	'the native-like document title stays above Properties',
);
assert.match(composerTitle, /<Button[\s\S]*?onClick=\{onStartEditing\}/);
assert.match(composerTitle, /<input[\s\S]*?onBlur=\{onBlur\}/);
assert.match(composerTitle, /event\.key === 'Enter'/);
assert.match(composerTitle, /event\.key !== 'Escape'/);
assert.match(composerTitle, /nativeEvent\.isComposing/);
assert.match(
	composerView,
	/this\.app\.fileManager\.renameFile\(file, targetPath\)/,
	'Composer delegates title renames to Obsidian so links and workspace state stay coherent',
);
assert.match(composerRoot, /data-content-width=\{contentWidth\}/);

assert.match(settingsTypes, /contentWidth: ComposerContentWidth/);
assert.match(settingsLoader, /normalizeComposerContentWidth/);
assert.match(
	composerCss,
	/\.pk-composer-controlbar\s*\{[\s\S]*?padding:\s*8px 24px;/,
	'Composer Back and Forward use the native header left inset',
);
assert.match(
	composerCss,
	/\.pk-composer-workspace\[data-content-width='wide'\]\s*\{[\s\S]*?max-width:\s*none;/,
	'wide mode releases the readable paper max width',
);
assert.match(
	composerCss,
	/\.pk-composer-document-title\s*\{[\s\S]*?justify-content:\s*flex-start !important;[\s\S]*?font-size:\s*var\(--pkc-h1-size\) !important;[\s\S]*?font-weight:\s*var\(--pkc-h1-weight\) !important;[\s\S]*?line-height:\s*1\.25 !important;[\s\S]*?white-space:\s*normal !important;/,
	'the editable title defeats the shared Button center and small-text utilities',
);
assert.match(
	frontmatterCss,
	/--pkc-fm-panel-bg:\s*transparent;/,
	'frontmatter rests on the paper instead of a tinted card',
);
assert.match(
	composerCss,
	/\.pk-composer-block\[data-kind='frontmatter'\]:hover[\s\S]*?box-shadow:\s*none;/,
	'frontmatter never receives the full-block hover halo',
);

console.log('composer-native-parity-contract: passed');
