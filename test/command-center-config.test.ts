import assert from 'assert';
import { readFileSync } from 'fs';
import {
	buildProjectionPositions,
	commandCenterActionKey,
	commandCenterCatalogScopeForAction,
	COMMAND_CENTER_CATALOG_DEFAULTS,
	moveProjectionFocus,
	normalizeCommandCenterBoardConfig,
	projectCommandCenterItems,
	type CommandCenterBoardConfig,
	type ResolvedCommandCenterItem,
} from '@/core/command-center';

const rawDefaults = JSON.parse(readFileSync('templates/config/command-center-defaults.json', 'utf8')) as CommandCenterBoardConfig;
const defaults = normalizeCommandCenterBoardConfig(rawDefaults, rawDefaults);

assert.strictEqual(defaults.version, 1);
assert.deepStrictEqual(defaults.modal.tabOrder, ['all', 'pinned', 'peak-assistant', 'navigation']);
assert.deepStrictEqual(defaults.groups.map((group) => group.label), ['Pinned', 'Peak Assistant', 'Navigation']);
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

const missingIcon = JSON.parse(JSON.stringify(defaults)) as CommandCenterBoardConfig;
const firstItem = missingIcon.groups[0]!.actions[0]!;
delete firstItem.icon;
firstItem.display = 'icon-only';
const repaired = normalizeCommandCenterBoardConfig(missingIcon, defaults);
assert.strictEqual(repaired.groups[0]!.actions[0]!.display, 'text-only', 'icon-only without an icon must fail visibly to text');

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

function resolved(id: string, layer: 'destination' | 'command', visual = false): ResolvedCommandCenterItem {
	return {
		id,
		action: layer === 'destination' ? { kind: 'view', viewType: id } : { kind: 'peak-command', commandId: id },
		shortLabel: id,
		aliases: [],
		display: visual ? 'icon-label' : 'text-only',
		icon: visual ? { kind: 'lucide', name: 'command' } : undefined,
		pinnedToHome: false,
		order: 0,
		groupId: 'g',
		groupLabel: 'Group',
		fullLabel: id,
		sourceLabel: 'Test',
		layer,
		available: true,
		hotkey: null,
	};
}

const projection = projectCommandCenterItems([
	...Array.from({ length: 5 }, (_, index) => resolved(`d${index}`, 'destination')),
	...Array.from({ length: 5 }, (_, index) => resolved(`c${index}`, 'command', true)),
	...Array.from({ length: 8 }, (_, index) => resolved(`r${index}`, 'command')),
]);
assert.strictEqual(projection.destinations.length, 5);
assert.strictEqual(projection.grid.length, 5, 'only commands with icons and a visual display mode belong in the grid');
assert.strictEqual(projection.rows.length, 8, 'text-only commands must render as stable rows');
assert.strictEqual(projectCommandCenterItems([resolved('visual', 'command', true)], 'rows').rows.length, 1, 'rows layout must override icon-based grid projection');
assert.deepStrictEqual(
	projectCommandCenterItems([resolved('r0', 'command'), resolved('c0', 'command', true), resolved('r1', 'command')]).blocks.map((block) => block.kind),
	['row', 'grid', 'row'],
	'explicit item order must survive transitions between row and grid blocks',
);

const positions = buildProjectionPositions(projection, 3);
assert.strictEqual(positions.find((position) => position.id === 'd4')?.columns, 3, 'destination links use at most three columns');
assert.strictEqual(moveProjectionFocus(positions, 'd4', 'down'), 'c1', 'vertical navigation must preserve the nearest column across layers');
assert.strictEqual(moveProjectionFocus(positions, 'c4', 'right'), 'r0', 'horizontal navigation must enter text rows continuously');

console.log('command-center-config: passed');
