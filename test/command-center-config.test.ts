import assert from 'assert';
import { readFileSync } from 'fs';
import {
	buildProjectionPositions,
	commandCenterGridSpan,
	commandCenterActionKey,
	commandCenterCatalogScopeForAction,
	COMMAND_CENTER_CATALOG_DEFAULTS,
	moveCommandCenterItem,
	moveProjectionFocus,
	normalizeCommandCenterBoardConfig,
	resolveAutoCommandCenterDisplayMode,
	type CommandCenterBoardConfig,
} from '@/core/command-center';

const rawDefaults = JSON.parse(readFileSync('templates/config/command-center-defaults.json', 'utf8')) as CommandCenterBoardConfig;
const defaults = normalizeCommandCenterBoardConfig(rawDefaults, rawDefaults);

assert.strictEqual(defaults.version, 1);
assert.deepStrictEqual(defaults.modal.tabOrder, ['all', 'pinned', 'peak-assistant', 'navigation']);
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

const roundTrip = normalizeCommandCenterBoardConfig(JSON.parse(JSON.stringify(defaults)), rawDefaults);
assert.deepStrictEqual(roundTrip, defaults, 'normalized config must round-trip without drift');

const legacyBoard = JSON.parse(JSON.stringify(defaults)) as any;
delete legacyBoard.modal.tabOrder;
const migratedLegacyBoard = normalizeCommandCenterBoardConfig(legacyBoard, defaults);
assert.deepStrictEqual(migratedLegacyBoard.modal.tabOrder, ['all', 'pinned', 'peak-assistant', 'navigation'], 'legacy boards must migrate to All-first tab order');

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

assert.deepStrictEqual(commandCenterGridSpan('icon'), { columnSpan: 6, rowSpan: 2 });
assert.deepStrictEqual(commandCenterGridSpan('compact'), { columnSpan: 10, rowSpan: 1 });
assert.deepStrictEqual(commandCenterGridSpan('wide'), { columnSpan: 15, rowSpan: 1 });
assert.deepStrictEqual(commandCenterGridSpan('full'), { columnSpan: 30, rowSpan: 1 });
assert.strictEqual(resolveAutoCommandCenterDisplayMode(80, 600), 'compact');
assert.strictEqual(resolveAutoCommandCenterDisplayMode(240, 600), 'wide');
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

console.log('command-center-config: passed');
