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
const modalHost = readFileSync('src/app/command-center/CommandCenterModal.tsx', 'utf8');
const composer = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
const home = readFileSync('src/ui/view/command-center/CommandCenterHome.tsx', 'utf8');
const customize = readFileSync('src/ui/view/command-center/CommandCenterCustomize.tsx', 'utf8');
const launcher = readFileSync('src/ui/view/command-center/CommandCenterLauncher.tsx', 'utf8');
const globalResults = readFileSync('src/ui/view/command-center/CommandCenterGlobalResults.tsx', 'utf8');
const viewResults = readFileSync('src/ui/view/command-center/CommandCenterViewResults.tsx', 'utf8');
const iconBrowser = readFileSync('src/ui/view/command-center/IconBrowser.tsx', 'utf8');
const adapter = readFileSync('src/app/command-center/ObsidianCommandCenterAdapter.ts', 'utf8');
assert.match(modal, /runtime: CommandCenterRuntimePort/);
assert.match(home, /runtime: CommandCenterRuntimePort/);
assert.match(home, /runtime\.openCustomize\(\)/, 'Home must enter Customize directly');
assert.match(home, /runtime\.resolveItems\('home'\)/, 'full Home workspace must consume the same independent Home layout');
assert.match(customize, /pk-cc-directory/, 'Customize must keep one continuous catalog');
assert.doesNotMatch(customize, /ADDED TO|AVAILABLE COMMANDS|window\.confirm/i, 'Customize must not split or jump between membership regions');
assert.match(customize, /runtime\.getCatalog\(debouncedQuery, catalogScope\)/, 'Customize catalog search must be scoped and debounced');
assert.match(customize, /aria-pressed=\{showActiveOnly\}/, 'Customize must expose one in-place active-only filter button');
assert.match(customize, /catalog\.filter\(\(entry\) => activeKeys\.has\(entry\.key\)\)/, 'active-only filtering must keep the continuous catalog and filter it in place');
assert.match(customize, /metaKey \|\| event\.ctrlKey/, 'Customize must route Cmd\/Ctrl+F to its current search field');
assert.match(customize, /onBlur=\{commitGroupLabel\}/, 'group renaming must commit a local draft instead of normalizing every keystroke');
assert.doesNotMatch(customize, /onDone|>Done</, 'autosaving customization must not expose a fake Done action');
assert.match(customize, /pk-cc-directory-row__copy/, 'directory rows must keep label and source in a stable two-line copy column');
assert.match(customize, /CommandCenterArrangeItems/, 'membership and arrangement must be separate tasks without splitting the catalog');
assert.match(customize, /next\.home\.layout\.push/, 'Customize pinning must add one action to the independent Home layout');
assert.match(customize, /homeDisplay=\{homeLayoutItem\?\.display\}/, 'Home display must remain independent from its source group item');
assert.doesNotMatch(customize, /CommandCenterArrangeTabs|Arrange launcher tabs|arrange-tabs/, 'tab ordering must not live in a separate Customize panel');
assert.match(customize, /shortLabel: entry\.label/, 'new items must preserve the complete source command name');
assert.doesNotMatch(customize, /compactCommandLabel|actionLayout/, 'Customize must not shorten names or impose a group-wide layout');
assert.match(customize, /container=\{modalPortal\}/, 'scope picker must remain inside the active Obsidian modal');
assert.match(customize, /onCloseAutoFocus/, 'scope selection must restore focus to catalog search instead of the closed trigger');
assert.match(modalHost, /modalEl\.addEventListener\('keydown', this\.containKeyEvent\)/, 'Command Center keys must not bubble into the workspace behind the modal');
assert.match(composer, /modal-container \.peak-command-center/, 'Composer find must yield to a foreground Command Center modal');
assert.match(adapter, /scope === 'all' \|\| scope === 'documents'/, 'Vault scanning must only run in the documents scope');
assert.match(adapter, /maximumDocumentResults/, 'document results must be ranked and capped');
assert.match(adapter, /searchClient\.search\(/, 'document queries must use the existing indexed SearchClient when available');
assert.match(adapter, /searchClient\.getRecent\(/, 'empty document queries must show indexed recents when available');
assert.match(adapter, /destinationAvailable\(action: CommandCenterAction\)/, 'configured destinations must use direct availability checks');
assert.match(adapter, /label: 'Peak Home'/, 'view catalog labels must match the visible Obsidian tab title');
assert.match(adapter, /\.\.\.view\.aliases/, 'stable Peak views must remain searchable by their product aliases');
assert.doesNotMatch(resolveSection, /destinationAvailable[\s\S]*?listCatalog/, 'launcher availability must not rescan the full catalog');
for (const source of [home, customize, launcher, iconBrowser]) {
	assert.doesNotMatch(source, /ui\/component\/shared-ui\/(button|switch)/, 'Command Center must use public Peak primitives');
}
assert.match(iconBrowser, /getCommandCenterLucideNames/, 'icon search must read the complete registered icon catalog');
assert.match(iconBrowser, /Type or paste any emoji/, 'emoji customization must accept arbitrary Unicode emoji beyond the common shortcuts');
assert.match(launcher, /draggable=\{dragEnabled\}/, 'configured items must be directly draggable in the launcher');
assert.match(launcher, /runtime\.moveItem\(draggedId, groupId, itemId, placement\)/, 'launcher drag must persist through the runtime instead of remaining a visual mock');
assert.match(launcher, /runtime\.moveTab\(draggedTabId, targetTabId, placement\)/, 'top-level tabs must persist direct drag ordering in place');
assert.match(launcher, /draggable=\{!isHome\}/, 'Home must be fixed while ordinary tabs remain draggable');
assert.match(launcher, /if \(scope === 'home'\) return \[\{ group: HOME_GROUP, items \}\]/, 'Home must render one independent mixed layout instead of aggregating groups');
assert.doesNotMatch(launcher, /scope === 'all'/, 'launcher must not retain the old All aggregation branch');
assert.match(launcher, /runtime\.moveHomeItem\(draggedId, itemId, placement\)/, 'direct Home drag must persist through its independent order');
assert.match(launcher, /runtime\.getCatalog\(query, 'commands'\)/, 'launcher search must query the complete command-only catalog');
assert.match(launcher, /runtime\.getCatalog\(query, 'workspaces-views'\)/, 'launcher search must query the destination catalog separately for stable Peak views');
assert.doesNotMatch(launcher, /runtime\.getCatalog\(query, 'all'\)/, 'launcher fallback must never expand into documents or other catalog scopes');
assert.match(launcher, /runtime\.invokeCatalogEntry\(entry\)/, 'global fallback results must execute through the existing runtime boundary');
assert.match(globalResults, /Show all \{total\} commands/, 'global command preview must expand in place');
assert.match(viewResults, />Peak views</, 'launcher must expose a dedicated Peak view result section without flattening curated groups into commands');
assert.match(viewResults, /CommandCenterCatalogPinControl/, 'Peak view results must let users choose their Command Center destinations in place');
assert.match(launcher, /className="pk-cc-tab-slot"/, 'Home and group tabs must share one rail primitive while retaining distinct drag behavior');
assert.match(launcher, /setDragImage\(ghost/, 'direct drag must provide a dedicated visual ghost');
assert.match(launcher, /resolveAutoCommandCenterDisplayMode/, 'Auto display must measure and resolve the rendered label');

const css = readFileSync('src/styles/command-center.css', 'utf8');
assert.match(css, /peak-command-center-modal:has\(\.pk-cc-customize\)[\s\S]*?720px/);
assert.match(css, /\.pk-cc-mixed-grid[\s\S]*?grid-template-columns: repeat\(30, minmax\(0, 1fr\)\)/);
assert.match(css, /\.pk-cc-item-slot--icon[\s\S]*?grid-column: span 6[\s\S]*?grid-row: span 2/);
assert.match(css, /\.pk-cc-item-slot--compact[\s\S]*?grid-column: span 10/);
assert.match(css, /\.pk-cc-item-slot--wide[\s\S]*?grid-column: span 15/);
assert.match(css, /\.pk-cc-item-slot--full[\s\S]*?grid-column: span 30/);
assert.match(css, /\.pk-cc-action--icon[\s\S]*?height: 66px !important/);
assert.match(css, /\.pk-cc-action--compact,[\s\S]*?height: 31px !important/);
assert.match(css, /\.pk-cc-action__label[\s\S]*?max-width: 100%/, 'command labels must be contained within their cells');
assert.match(css, /\.pk-cc-action--icon \.pk-cc-action__label[\s\S]*?text-align: center/, 'icon tiles must center icon and label together');
assert.match(css, /\.pk-cc-item-slot--drop-before-column::after/, 'direct drag must expose an insertion target in the mixed grid');
assert.match(css, /\.pk-cc-tab-slot\[data-drop-placement\]::after/, 'tab drag must expose an insertion target in the launcher rail');
assert.match(css, /\.pk-cc-global-result[\s\S]*?height:\s*40px !important;[\s\S]*?min-height:\s*40px !important;[\s\S]*?max-height:\s*40px !important;/, 'global command rows must retain compact fixed geometry under the Obsidian reset');
assert.match(css, /\.pk-cc-arrange-row\[data-drop-target="true"\]::before/, 'drag reorder must expose a visible drop target');
assert.match(css, /var\(--pk-surface\)/, 'Command Center must consume Peak design tokens');
assert.doesNotMatch(css, /var\(--(?:background|text|interactive|font)-/, 'Command Center CSS must not bypass Peak tokens with Obsidian theme variables');
assert.match(css, /prefers-reduced-motion: reduce/);

console.log('command-center-boundary: passed');
