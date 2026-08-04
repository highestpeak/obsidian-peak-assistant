import assert from 'assert';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const registry = readFileSync('src/core/template/TemplateRegistry.ts', 'utf8');
assert.match(registry, /CommandCenter:\s*'config-command-center'/);
assert.match(registry, /ConfigTemplateId\.CommandCenter\]: meta\('config', 'command-center-defaults'/);

const main = readFileSync('main.ts', 'utf8');
assert.match(main, /setCommandCenterRuntime/);
assert.match(main, /openCommandCenter:/);
assert.match(main, /id: binding\.commandId/);
assert.doesNotMatch(main, /hotkeys:\s*\[/, 'Command Center must not assign a default hotkey');

const runtime = readFileSync('src/app/command-center/CommandCenterRuntime.ts', 'utf8');
assert.match(runtime, /this\.config\.groups/);
assert.match(runtime, /normalizedQuery && !searchable\.includes/, 'runtime search must filter configured items');
const resolveSection = runtime.slice(runtime.indexOf('async resolveItems'), runtime.indexOf('async getCatalog'));
assert.doesNotMatch(resolveSection, /listCatalog/, 'runtime launcher search must not expand into the full catalog');

const privateReaders = execFileSync('rg', [
	'-l',
	'app as App.*commands|app\.commands\.commands|commands\?\.commands',
	'src/core',
	'src/service',
	'src/ui',
	'src/app/command-center',
], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
assert.deepStrictEqual(
	privateReaders,
	['src/app/command-center/ObsidianCommandCenterAdapter.ts'],
	'private Obsidian command catalog access must stay in the app compatibility adapter',
);

const modal = readFileSync('src/ui/view/command-center/CommandCenterSurface.tsx', 'utf8');
const home = readFileSync('src/ui/view/command-center/CommandCenterHome.tsx', 'utf8');
const customize = readFileSync('src/ui/view/command-center/CommandCenterCustomize.tsx', 'utf8');
const launcher = readFileSync('src/ui/view/command-center/CommandCenterLauncher.tsx', 'utf8');
const iconBrowser = readFileSync('src/ui/view/command-center/IconBrowser.tsx', 'utf8');
const adapter = readFileSync('src/app/command-center/ObsidianCommandCenterAdapter.ts', 'utf8');
assert.match(modal, /runtime: CommandCenterRuntimePort/);
assert.match(home, /runtime: CommandCenterRuntimePort/);
assert.match(home, /runtime\.openCustomize\(\)/, 'Home must enter Customize directly');
assert.match(customize, /pk-cc-directory/, 'Customize must keep one continuous catalog');
assert.doesNotMatch(customize, /ADDED TO|AVAILABLE COMMANDS|window\.confirm/i, 'Customize must not split or jump between membership regions');
assert.match(customize, /runtime\.getCatalog\(debouncedQuery, catalogScope\)/, 'Customize catalog search must be scoped and debounced');
assert.match(customize, /metaKey \|\| event\.ctrlKey/, 'Customize must route Cmd\/Ctrl+F to its current search field');
assert.match(customize, /onBlur=\{commitGroupLabel\}/, 'group renaming must commit a local draft instead of normalizing every keystroke');
assert.doesNotMatch(customize, /onDone|>Done</, 'autosaving customization must not expose a fake Done action');
assert.match(customize, /pk-cc-directory-row__copy/, 'directory rows must keep label and source in a stable two-line copy column');
assert.match(customize, /CommandCenterArrangeItems/, 'membership and arrangement must be separate tasks without splitting the catalog');
assert.match(adapter, /scope === 'all' \|\| scope === 'documents'/, 'Vault scanning must only run in the documents scope');
assert.match(adapter, /maximumDocumentResults/, 'document results must be ranked and capped');
assert.match(adapter, /searchClient\.search\(/, 'document queries must use the existing indexed SearchClient when available');
assert.match(adapter, /searchClient\.getRecent\(/, 'empty document queries must show indexed recents when available');
assert.match(adapter, /destinationAvailable\(action: CommandCenterAction\)/, 'configured destinations must use direct availability checks');
assert.doesNotMatch(resolveSection, /destinationAvailable[\s\S]*?listCatalog/, 'launcher availability must not rescan the full catalog');
for (const source of [home, customize, launcher, iconBrowser]) {
	assert.doesNotMatch(source, /ui\/component\/shared-ui\/(button|switch)/, 'Command Center must use public Peak primitives');
}

const css = readFileSync('src/styles/command-center.css', 'utf8');
assert.match(css, /peak-command-center-modal:has\(\.pk-cc-customize\)[\s\S]*?680px/);
assert.match(css, /\.pk-cc-links[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(css, /\.pk-cc-links[\s\S]*?max-height: 106px/, 'destination links must stay within roughly three rows');
assert.match(css, /\.pk-cc-action--link[\s\S]*?height: 34px !important/, 'destinations must render as compact links rather than large tiles');
assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
assert.match(css, /\.pk-cc-action--grid[\s\S]*?height: 60px !important/);
assert.match(css, /\.pk-cc-action--row[\s\S]*?height: 34px !important/, 'text commands must have a dedicated row presentation');
assert.match(css, /\.pk-cc-action__label[\s\S]*?max-width: 100%/, 'command labels must be contained within their cells');
assert.match(css, /var\(--pk-surface\)/, 'Command Center must consume Peak design tokens');
assert.doesNotMatch(css, /var\(--(?:background|text|interactive|font)-/, 'Command Center CSS must not bypass Peak tokens with Obsidian theme variables');
assert.match(css, /prefers-reduced-motion: reduce/);

console.log('command-center-boundary: passed');
