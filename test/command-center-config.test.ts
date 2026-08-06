import assert from 'assert';
import { readFileSync } from 'fs';
import {
	buildProjectionPositions,
	commandCenterGridSpan,
	commandCenterActionKey,
	commandCenterCatalogScopeForAction,
	COMMAND_CENTER_CATALOG_DEFAULTS,
	moveCommandCenterItem,
	moveCommandCenterHomeItem,
	moveCommandCenterTab,
	moveProjectionFocus,
	normalizeCommandCenterBoardConfig,
	prepareCommandCenterGlobalMatches,
	prepareCommandCenterViewMatches,
	resolveAutoCommandCenterDisplayMode,
	type CommandCenterBoardConfig,
	type CommandCenterCatalogEntry,
} from '@/core/command-center';

const rawDefaults = JSON.parse(readFileSync('templates/config/command-center-defaults.json', 'utf8')) as CommandCenterBoardConfig;
const defaults = normalizeCommandCenterBoardConfig(rawDefaults, rawDefaults);

assert.strictEqual(defaults.version, 2);
assert.deepStrictEqual(defaults.modal.tabOrder, ['home', 'pinned', 'peak-assistant', 'navigation']);
assert.deepStrictEqual(defaults.groups.map((group) => group.label), ['Pinned', 'Peak Assistant', 'Navigation']);
assert.ok(
	defaults.groups.flatMap((group) => group.actions).every((item) => item.display === 'auto'),
	'first-run actions must all default to Auto while preserving item-level overrides',
);
assert.deepStrictEqual(
	defaults.groups.find((group) => group.id === 'peak-assistant')?.actions.map((item) => item.action.kind === 'peak-command' ? item.action.commandId : ''),
	[
		'peak-open-document-composer',
		'peak-open-chat-studio',
		'peak-file-atlas-open',
		'peak-quick-search',
		'peak-open-settings',
	],
	'first-run Peak group must stay intentionally small and exact',
);
assert.strictEqual(defaults.home.openOnStartup, false);
assert.strictEqual(defaults.home.replaceEmptyTab, false);
assert.deepStrictEqual(defaults.home.layout.map((item) => item.sourceItemId), ['pinned-home', 'pinned-usage']);

const independentHomeDisplay = JSON.parse(JSON.stringify(defaults)) as any;
independentHomeDisplay.home.layout[0].display = 'full';
const normalizedIndependentHomeDisplay = normalizeCommandCenterBoardConfig(independentHomeDisplay, defaults);
assert.strictEqual(normalizedIndependentHomeDisplay.home.layout[0]?.display, 'full');
assert.strictEqual(normalizedIndependentHomeDisplay.groups[0]?.actions[0]?.display, 'auto', 'Home display overrides must not rewrite the source group layout');

const roundTrip = normalizeCommandCenterBoardConfig(JSON.parse(JSON.stringify(defaults)), rawDefaults);
assert.deepStrictEqual(roundTrip, defaults, 'normalized config must round-trip without drift');

const legacyBoard = JSON.parse(JSON.stringify(defaults)) as any;
delete legacyBoard.modal.tabOrder;
const migratedLegacyBoard = normalizeCommandCenterBoardConfig(legacyBoard, defaults);
assert.deepStrictEqual(migratedLegacyBoard.modal.tabOrder, ['home', 'pinned', 'peak-assistant', 'navigation'], 'boards without a tab order must migrate to fixed Home-first order');

const versionOneBoard = JSON.parse(JSON.stringify(defaults)) as any;
versionOneBoard.version = 1;
versionOneBoard.modal.tabOrder = ['peak-assistant', 'all', 'navigation', 'pinned'];
delete versionOneBoard.home.layout;
versionOneBoard.home.quickAccessActionIds = ['peak-chat-studio', 'navigation-daily-note'];
for (const group of versionOneBoard.groups) {
	for (const item of group.actions) item.pinnedToHome = false;
}
versionOneBoard.groups[0].actions[0].pinnedToHome = true;
const migratedVersionOneBoard = normalizeCommandCenterBoardConfig(versionOneBoard, defaults);
assert.deepStrictEqual(migratedVersionOneBoard.modal.tabOrder, ['home', 'peak-assistant', 'navigation', 'pinned'], 'legacy All must become a fixed Home tab without preserving its draggable position');
assert.deepStrictEqual(migratedVersionOneBoard.home.layout.map((item) => item.sourceItemId), ['peak-chat-studio', 'navigation-daily-note', 'pinned-home'], 'legacy quick access and pinned actions must migrate into one independent Home order');

const missingIcon = JSON.parse(JSON.stringify(defaults)) as any;
const firstItem = missingIcon.groups[0]!.actions[0]!;
delete firstItem.icon;
firstItem.display = 'icon-only';
const repaired = normalizeCommandCenterBoardConfig(missingIcon, defaults);
assert.strictEqual(repaired.groups[0]!.actions[0]!.display, 'auto', 'legacy icon-only without an icon must remain visible through Auto');

const legacyDisplays = JSON.parse(JSON.stringify(defaults)) as any;
legacyDisplays.groups[0].actions[0].display = 'icon-label';
legacyDisplays.groups[0].actions[1].display = 'text-only';
const migratedDisplays = normalizeCommandCenterBoardConfig(legacyDisplays, defaults);
assert.deepStrictEqual(migratedDisplays.groups[0]!.actions.map((item) => item.display), ['icon', 'full'], 'legacy per-item displays must migrate without retaining group layout semantics');

assert.strictEqual(
	commandCenterActionKey({ kind: 'vault-target', path: 'Dashboards/Home.md', subpath: 'Today' }),
	'vault:Dashboards/Home.md#Today',
);
assert.strictEqual(commandCenterCatalogScopeForAction({ kind: 'peak-command', commandId: 'open' }), 'commands');
assert.strictEqual(commandCenterCatalogScopeForAction({ kind: 'obsidian-command', commandId: 'app:open' }), 'commands');
assert.strictEqual(commandCenterCatalogScopeForAction({ kind: 'vault-target', path: 'Home.md' }), 'documents');
assert.strictEqual(commandCenterCatalogScopeForAction({ kind: 'bookmark', bookmarkId: 'home' }), 'bookmarks');
assert.strictEqual(commandCenterCatalogScopeForAction({ kind: 'workspace', workspaceName: 'Research' }), 'workspaces-views');
assert.strictEqual(commandCenterCatalogScopeForAction({ kind: 'view', viewType: 'peak-home' }), 'workspaces-views');
assert.strictEqual(COMMAND_CENTER_CATALOG_DEFAULTS.minimumDocumentQueryLength, 2);
assert.ok(COMMAND_CENTER_CATALOG_DEFAULTS.maximumDocumentResults <= 100, 'document search must remain bounded');
assert.strictEqual(COMMAND_CENTER_CATALOG_DEFAULTS.launcherCommandPreviewLimit, 6);
assert.ok(COMMAND_CENTER_CATALOG_DEFAULTS.submenuHoverOpenDelayMs <= 150, 'destination submenus must feel immediate on hover');
assert.ok(COMMAND_CENTER_CATALOG_DEFAULTS.submenuHoverCloseDelayMs >= 180, 'destination submenus must preserve a usable pointer corridor');

const commandEntry = (key: string, label: string, sourceLabel = 'Excalidraw', available = true): CommandCenterCatalogEntry => ({
	key,
	action: { kind: 'obsidian-command', commandId: key.slice('command:'.length) },
	label,
	sourceLabel,
	layer: 'command',
	available,
	hotkey: null,
});
const globalMatches = prepareCommandCenterGlobalMatches([
	commandEntry('command:source', 'Create drawing'),
	commandEntry('command:contains', 'Open Excalidraw drawing'),
	commandEntry('command:prefix', 'Excalidraw: New drawing'),
	commandEntry('command:exact', 'Excalidraw'),
	commandEntry('command:configured', 'Excalidraw configured'),
	commandEntry('command:missing', 'Excalidraw missing', 'Excalidraw', false),
	commandEntry('command:exact', 'Excalidraw duplicate'),
], new Set(['command:configured']), 'excalidraw');
assert.deepStrictEqual(
	globalMatches.map((entry) => entry.key),
	['command:exact', 'command:prefix', 'command:contains', 'command:source'],
	'global fallback must rank deterministic name matches, deduplicate, and exclude configured or unavailable commands',
);

const viewEntry = (key: string, label: string, available = true): CommandCenterCatalogEntry => ({
	key,
	action: key.startsWith('view:')
		? { kind: 'view', viewType: key.slice('view:'.length) }
		: { kind: 'workspace', workspaceName: label },
	label,
	sourceLabel: key.startsWith('view:') ? 'Peak view' : 'Workspace',
	layer: 'destination',
	available,
	hotkey: null,
});
const viewMatches = prepareCommandCenterViewMatches([
	viewEntry('view:peak-home', 'Home'),
	viewEntry('workspace:home', 'Home workspace'),
	viewEntry('view:missing', 'Missing view', false),
	viewEntry('view:peak-home', 'Home duplicate'),
], 'home');
assert.deepStrictEqual(
	viewMatches.map((entry) => entry.key),
	['view:peak-home'],
	'launcher view search must only surface available deduplicated Peak views, not saved workspaces',
);

assert.deepStrictEqual(commandCenterGridSpan('icon'), { columnSpan: 6, rowSpan: 2 });
assert.deepStrictEqual(commandCenterGridSpan('compact'), { columnSpan: 10, rowSpan: 1 });
assert.deepStrictEqual(commandCenterGridSpan('wide'), { columnSpan: 15, rowSpan: 1 });
assert.deepStrictEqual(commandCenterGridSpan('full'), { columnSpan: 30, rowSpan: 1 });
assert.strictEqual(resolveAutoCommandCenterDisplayMode(80, 600), 'compact');
assert.strictEqual(resolveAutoCommandCenterDisplayMode(160, 600), 'wide', 'long document labels must reserve room for icon, metadata, and item controls');
assert.strictEqual(resolveAutoCommandCenterDisplayMode(240, 600), 'full');
assert.strictEqual(resolveAutoCommandCenterDisplayMode(400, 600), 'full');

const positions = buildProjectionPositions([{ sectionId: 'g', items: [
	{ id: 'icon', mode: 'icon' },
	{ id: 'compact', mode: 'compact' },
	{ id: 'wide', mode: 'wide' },
	{ id: 'full', mode: 'full' },
] }]);
assert.deepStrictEqual(positions.map(({ id, row, column, columnSpan, rowSpan }) => ({ id, row, column, columnSpan, rowSpan })), [
	{ id: 'icon', row: 0, column: 0, columnSpan: 6, rowSpan: 2 },
	{ id: 'compact', row: 0, column: 6, columnSpan: 10, rowSpan: 1 },
	{ id: 'wide', row: 1, column: 6, columnSpan: 15, rowSpan: 1 },
	{ id: 'full', row: 2, column: 0, columnSpan: 30, rowSpan: 1 },
], 'mixed projection must preserve item order while densely packing item-level spans');
assert.strictEqual(moveProjectionFocus(positions, 'icon', 'right'), 'compact');
assert.strictEqual(moveProjectionFocus(positions, 'compact', 'down'), 'wide');

const moved = moveCommandCenterItem(defaults, 'peak-settings', 'pinned', 'pinned-home', 'before');
assert.deepStrictEqual(moved.groups.find((group) => group.id === 'pinned')?.actions.map((item) => item.id), ['peak-settings', 'pinned-home', 'pinned-usage']);
assert.strictEqual(moved.groups.find((group) => group.id === 'peak-assistant')?.actions.some((item) => item.id === 'peak-settings'), false, 'direct drag must support moving an item across groups');
assert.deepStrictEqual(moved.groups.find((group) => group.id === 'pinned')?.actions.map((item) => item.order), [0, 1, 2], 'cross-group moves must normalize persisted order');

assert.deepStrictEqual(moveCommandCenterTab(defaults, 'home', 'peak-assistant', 'after'), defaults, 'Home must never move with ordinary tabs');
const movedTabs = moveCommandCenterTab(defaults, 'navigation', 'home', 'before');
assert.deepStrictEqual(movedTabs.modal.tabOrder, ['home', 'navigation', 'pinned', 'peak-assistant']);
assert.deepStrictEqual(movedTabs.groups.map((group) => group.id), ['navigation', 'pinned', 'peak-assistant'], 'direct tab drag must keep group order aligned after fixed Home');
assert.deepStrictEqual(moveCommandCenterTab(movedTabs, 'peak-assistant', 'navigation', 'before').modal.tabOrder, ['home', 'peak-assistant', 'navigation', 'pinned']);

const movedHome = moveCommandCenterHomeItem(defaults, 'pinned-usage', 'pinned-home', 'before');
assert.deepStrictEqual(movedHome.home.layout.map((item) => item.sourceItemId), ['pinned-usage', 'pinned-home']);
assert.deepStrictEqual(movedHome.home.quickAccessActionIds, ['pinned-usage', 'pinned-home'], 'Home compatibility ids must follow its independent layout order');

console.log('command-center-config: passed');
