import assert from 'assert';
import { readFileSync } from 'fs';
import { DEFAULT_SETTINGS } from '@/core/config/settingsTypes';

const router = readFileSync('src/app/composer/ComposerDocumentRouter.ts', 'utf8');
const hostPolicy = readFileSync('src/app/composer/ComposerHostOpenPolicy.ts', 'utf8');
const view = readFileSync('src/app/composer/DocumentComposerView.ts', 'utf8');
const navigation = readFileSync('src/app/platform/navigation/AppVaultNavigationAdapter.ts', 'utf8');
const quickSearch = readFileSync('src/app/search/composeQuickSearchHost.ts', 'utf8');
const fileAtlas = readFileSync('src/app/file-atlas/composeFileAtlasHost.ts', 'utf8');
const nativeCompanion = readFileSync('src/app/composer/NativeMarkdownIntelligenceModal.tsx', 'utf8');

assert.equal(
	DEFAULT_SETTINGS.composer.defaultDocumentView,
	'markdown',
	'new installs must fail safe to Native Markdown',
);
assert.match(router, /await leaf\.view\.save\(\)/, 'same-leaf conversion must save the Markdown buffer');
assert.match(
	router,
	/preserveMarkdownBuffer !== false/,
	'explicit current-view conversion must preserve an existing Markdown edit buffer by default',
);
assert.match(
	router,
	/convertLeaf\(leaf, 'composer', \{\s*preserveMarkdownBuffer: false,\s*isCurrent,\s*\}\)/,
	'host file-open conversion must not save a Markdown view that is still entering its load lifecycle',
);
assert.match(router, /await this\.withGuard\(leaf/, 'host file-open recursion must be guarded');
assert.match(
	router,
	/await waitForHostFileOpenToSettle\(this\.app\)/,
	'host file-open conversion must wait until Obsidian finishes its Markdown open lifecycle',
);
assert.match(
	router,
	/win\.setTimeout\(\(\) => \{\s*win\.requestAnimationFrame/,
	'host settling must cross a macrotask boundary before waiting for paint frames',
);
assert.match(
	router,
	/error instanceof ComposerLeafRetentionError/,
	'only the known host leaf-retention race may trigger a conversion retry',
);
assert.match(
	router,
	/const retryLeaf = this\.resolveHostOpenedMarkdownLeaf\(filePath\)/,
	'the retry must re-resolve the current Markdown leaf instead of reusing a stale reference',
);
assert.match(
	router,
	/selectHostOpenedLeaf/,
	'host file-open conversion must resolve the settled file leaf instead of trusting activeLeaf timing',
);
assert.match(
	router,
	/hostOpenConversions\.begin\(leaf, file\.path\)/,
	'each settled host open must own a leaf-scoped conversion token',
);
assert.match(
	router,
	/\(\) => this\.hostOpenConversions\.isCurrent\(token\)/,
	'a host conversion must stop restoring once a newer file owns the leaf',
);
assert.match(
	router,
	/await this\.convertLeaf\(existing, targetView\)/,
	'reuse-existing must convert an existing file leaf when its view does not match the open policy',
);
assert.match(
	router,
	/this\.findExistingLeaf\(file\.path, undefined, targetView\)/,
	'reuse-existing must prefer an already-open leaf that already matches the target view',
);
assert.doesNotMatch(
	router,
	/const existing = this\.findExistingLeaf\(file\.path, leaf, 'composer'\)/,
	'a host-opened Markdown leaf must convert in place even when another Composer tab shows the same file',
);
assert.match(
	router,
	/hostOpenSuppressions\.consume\(file\.path\)/,
	'router-owned Markdown restores must suppress their delayed file-open event',
);
assert.match(
	hostPolicy,
	/matching\.find\(\(candidate\) => candidate\.active\)/,
	'duplicate file leaves must prefer the active matching leaf',
);
assert.match(
	router,
	/default document view conversion failed/,
	'default conversion failures must leave actionable console evidence',
);
assert.match(
	router,
	/this\.canRestoreOriginal\(leaf, filePath, options\)/,
	'a failed stale conversion must not overwrite a newer file binding during rollback',
);
assert.match(router, /verifyConversion\(leaf, target, filePath\)/, 'conversion must verify leaf and file identity');
const convertLeafStart = router.indexOf('async convertLeaf(');
const awaitedReveal = router.indexOf(
	'await this.app.workspace.revealLeaf(leaf);',
	convertLeafStart,
);
const conversionVerification = router.indexOf(
	'this.verifyConversion(leaf, target, filePath);',
	convertLeafStart,
);
assert.ok(
	awaitedReveal >= 0 && awaitedReveal < conversionVerification,
	'conversion must await reveal/load before verifying the final leaf state',
);
assert.match(router, /openIntelligenceCompanion/, 'Native Markdown must expose the shared Intelligence companion');
assert.match(view, /getSourceFilePath\(\)/, 'Composer views must expose their bound source file');
assert.match(
	view,
	/else if \(runtime\) this\.ensureController\(runtime\)/,
	'Composer must bind its controller when Obsidian calls setState after onOpen',
);
assert.match(view, /replace\(\/\\\.md\$\/i, ''\)/, 'Composer tab titles must derive from the file basename');
assert.match(navigation, /await router\.open/, 'Vault navigation must delegate exact Markdown opens');
assert.match(quickSearch, /vaultNavigation\.openVaultPath/, 'Quick Search must use the central file router');
assert.match(fileAtlas, /vaultNavigation\.openLink/, 'File Atlas must use the central file router');
assert.match(
	fileAtlas,
	/disposition: 'new-tab',\s*reason: 'file-atlas'/,
	'File Atlas must reveal an existing document leaf or create a dedicated tab for a new document',
);
assert.match(nativeCompanion, /owner\.createController/, 'Native Markdown must acquire the app-owned document runtime');
assert.doesNotMatch(
	nativeCompanion,
	/new IntelligenceRuntime/,
	'Native Markdown cannot create a second Intelligence system',
);
assert.match(nativeCompanion, /'markdown'/, 'Native runs must record their real origin surface');

console.log('composer-open-policy: passed');
