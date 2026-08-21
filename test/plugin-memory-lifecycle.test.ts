import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('main.ts', 'utf8');
const entry = readFileSync('entry.ts', 'utf8');
const atlasHost = readFileSync('src/app/file-atlas/composeFileAtlasHost.ts', 'utf8');
const atlasSurface = readFileSync('src/ui/view/file-atlas/FileAtlasHost.tsx', 'utf8');
const inspector = readFileSync('src/ui/view/file-atlas/components/AtlasInspector.tsx', 'utf8');
const streamdown = readFileSync('src/ui/component/mine/StreamdownIsolated.tsx', 'utf8');
const mermaidLoader = readFileSync('src/ui/mermaid/importMermaidModule.ts', 'utf8');
const composerMermaid = readFileSync('src/ui/view/composer/blocks/mermaid/MermaidBlockView.tsx', 'utf8');
const composerView = readFileSync('src/app/composer/DocumentComposerView.ts', 'utf8');
const reactRenderer = readFileSync('src/ui/react/ReactRenderer.tsx', 'utf8');
const hoverMenus = readFileSync('src/ui/component/mine/hover-menu-manager.tsx', 'utf8');
const unloadStart = main.indexOf('onunload(): void');
const unloadEnd = main.indexOf('\n\t/**\n\t * Persists current plugin settings', unloadStart);
const unloadBody = main.slice(unloadStart, unloadEnd);

assert.doesNotMatch(main, /peak-startup-mem|_peakMemMark|console\.log\s*=\s*_wrap/);
assert.match(main, /onunload\(\): void/);
assert.doesNotMatch(unloadBody, /\bawait\b/);
assert.match(main, /clearPortalHostsForUnload\(\)/);
assert.match(main, /IndexService\.cancelIndexing\(\)[\s\S]*searchUpdateQueue\?\.dispose\(\)/);

assert.match(entry, /private disposed = false/);
assert.match(entry, /if \(this\.disposed\) return/);
assert.match(entry, /this\.disposed = true/);
assert.match(entry, /claimPeakShellLoadKind\([\s\S]*globalThis,[\s\S]*workspace\.layoutReady/);
assert.match(entry, /loadKind === 'hot-reload'/);
assert.match(entry, /await this\.boot\(\)/);
assert.match(entry, /startup RSS gate skipped/);
assert.match(entry, /const impl = this\.impl;\s*this\.impl = null;\s*if \(impl\) this\.removeChild\(impl\)/);

assert.match(main, /clearHoverMenusForUnload\(\)/);
assert.match(main, /await import\('@\/core\/providers\/vercel\/provider-factory'\);\s*if \(this\.unloading\) return;/);
assert.match(main, /await import\('@\/app\/platform\/ObsidianFetchAdapter'\);\s*if \(this\.unloading\) return;/);
assert.match(hoverMenus, /export function clearHoverMenusForUnload\(\): void/);
assert.doesNotMatch(hoverMenus, /(?:window as any)\.(?:closeAllMenusExcept|registerMenu|unregisterMenu)/);

assert.match(atlasHost, /createTransientController/);
assert.match(atlasHost, /\{ capabilities: true \}/);
assert.match(atlasHost, /\{ intelligence: true \}/);
assert.match(atlasHost, /disposition: 'new-tab'/);
assert.doesNotMatch(
	atlasHost,
	/activationVersion/,
	'an explicit rail click must not be dropped merely because a newer click arrived',
);
assert.match(
	atlasHost,
	/activationQueue = activationQueue\.then\(activate, activate\)/,
	'document opens must remain serialized to avoid concurrent Composer mount spikes',
);
assert.match(atlasHost, /setBounded\(sessionViews/);
assert.match(atlasHost, /setBounded\(externalPreviewCache/);
assert.match(atlasHost, /documentReadQueue\.then\(read, read\)/);
assert.match(inspector, /new AbortController\(\)/);
assert.match(inspector, /controller\.abort\(\)/);
assert.match(atlasSurface, /host\.readDoc\(activePath, controller\.signal\)/);
assert.match(atlasSurface, /let refreshPending = false/);
assert.match(atlasSurface, /while \(alive && refreshPending\)/);

const runtimeBind = main.indexOf('setDocumentComposerRuntime(');
const viewRegistration = main.indexOf('this.viewManager.init()');
assert.ok(runtimeBind >= 0 && viewRegistration >= 0 && runtimeBind < viewRegistration);
assert.match(
	composerView,
	/status: 'loading',\s*filePath: this\.viewState\.filePath/,
	'a restored file-bound leaf must never project the unbound empty document state',
);
assert.match(composerView, /getState: \(\) => this\.pendingState/);
const composerOnOpen = composerView.slice(
	composerView.indexOf('async onOpen(): Promise<void>'),
	composerView.indexOf('async onClose(): Promise<void>'),
);
const hostMountIndex = composerOnOpen.indexOf('await super.onOpen()');
assert.ok(
	hostMountIndex >= 0 &&
		composerOnOpen.indexOf('await this.ensureControllerAfterLoadingPaint', hostMountIndex) > hostMountIndex,
	'Composer onOpen must route initial controller creation through the loading-paint gate',
);
const paintGate = composerView.slice(
	composerView.indexOf('private async ensureControllerAfterLoadingPaint'),
	composerView.indexOf('private updatePendingState'),
);
const loadingRenderIndex = paintGate.indexOf('this.rerender()');
const paintIndex = paintGate.indexOf('await waitForComposerLoadingPaint', loadingRenderIndex);
const controllerStartIndex = paintGate.indexOf('this.ensureController', paintIndex);
assert.ok(
	loadingRenderIndex >= 0 && paintIndex > loadingRenderIndex && controllerStartIndex > paintIndex,
	'file-bound loading must render and paint before synchronous controller composition',
);
assert.match(
	composerView,
	/else if \(runtime && this\.reactHostReady\) \{\s*await this\.ensureControllerAfterLoadingPaint\(runtime\)/,
	'setState-after-onOpen must use the same loading-paint gate',
);

assert.match(streamdown, /importImplWithoutMermaidLoadListener/);
assert.match(mermaidLoader, /Mermaid failed to initialize/);
assert.match(composerMermaid, /importWithoutMermaidLoadListener/);
assert.match(reactRenderer, /export function clearPortalHostsForUnload\(\)/);
assert.match(reactRenderer, /removeEventListener\('unload'/);

console.log('plugin-memory-lifecycle: passed');
