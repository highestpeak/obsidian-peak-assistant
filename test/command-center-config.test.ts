import assert from 'assert';
import { readFileSync } from 'fs';
import {
	commandCenterActionKey,
	moveProjectionFocus,
	normalizeCommandCenterBoardConfig,
	projectCommandCenterItems,
	type CommandCenterBoardConfig,
	type ResolvedCommandCenterItem,
} from '@/core/command-center';

const rawDefaults = JSON.parse(readFileSync('templates/config/command-center-defaults.json', 'utf8')) as CommandCenterBoardConfig;
const defaults = normalizeCommandCenterBoardConfig(rawDefaults, rawDefaults);

assert.strictEqual(defaults.version, 1);
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

function resolved(id: string, layer: 'destination' | 'command'): ResolvedCommandCenterItem {
	return {
		id,
		action: layer === 'destination' ? { kind: 'view', viewType: id } : { kind: 'peak-command', commandId: id },
		shortLabel: id,
		aliases: [],
		display: 'text-only',
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
	...Array.from({ length: 13 }, (_, index) => resolved(`c${index}`, 'command')),
]);
assert.strictEqual(projection.destinations.length, 5);
assert.strictEqual(projection.grid.length, 10, 'command grid must cap at two five-column rows');
assert.strictEqual(projection.overflow.length, 3);

const positions = [
	...projection.destinations.map((item, index) => ({ id: item.id, layer: 'destination' as const, column: index % 4, columns: 4 })),
	...projection.grid.map((item, index) => ({ id: item.id, layer: 'command' as const, column: index % 5, columns: 5 })),
	...projection.overflow.map((item) => ({ id: item.id, layer: 'overflow' as const, column: 0, columns: 1 })),
];
assert.strictEqual(moveProjectionFocus(positions, 'd4', 'down'), 'c0', 'vertical navigation must cross layer boundaries');
assert.strictEqual(moveProjectionFocus(positions, 'c9', 'right'), 'c10', 'horizontal navigation must enter overflow continuously');

console.log('command-center-config: passed');
