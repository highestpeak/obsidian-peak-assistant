import assert from 'assert';
import { readFileSync } from 'fs';
import {
	getCommandCenterCatalogEntryMembership,
	setCommandCenterCatalogEntryGroup,
	setCommandCenterCatalogEntryHome,
	type CommandCenterBoardConfig,
	type CommandCenterCatalogEntry,
} from '../src/core/command-center';

const defaults = JSON.parse(
	readFileSync('templates/config/command-center-defaults.json', 'utf8'),
) as CommandCenterBoardConfig;

const entry: CommandCenterCatalogEntry = {
	key: 'view:peak-ai-control-center',
	action: { kind: 'view', viewType: 'peak-ai-control-center' },
	label: 'AI Control Center',
	sourceLabel: 'Peak view',
	icon: { kind: 'lucide', name: 'sparkles' },
	layer: 'destination',
	available: true,
	hotkey: null,
};

const empty = getCommandCenterCatalogEntryMembership(defaults, entry);
assert.strictEqual(empty.defaultGroupId, 'pinned');
assert.strictEqual(empty.configured, false);
assert.strictEqual(empty.shownOnHome, false);

const pinned = setCommandCenterCatalogEntryGroup(defaults, entry, 'pinned', true, 'view-pinned');
const pinnedState = getCommandCenterCatalogEntryMembership(pinned, entry);
assert.strictEqual(pinnedState.configured, true);
assert.deepStrictEqual(pinnedState.groups.filter((group) => group.included).map((group) => group.id), ['pinned']);
const pinnedItem = pinned.groups.find((group) => group.id === 'pinned')?.actions.find((item) => item.id === 'view-pinned');
assert.deepStrictEqual(pinnedItem?.action, entry.action);
assert.strictEqual(pinnedItem?.shortLabel, entry.label);
assert.deepStrictEqual(pinnedItem?.icon, entry.icon);

const idempotent = setCommandCenterCatalogEntryGroup(pinned, entry, 'pinned', true, 'duplicate-id');
assert.strictEqual(
	idempotent.groups.find((group) => group.id === 'pinned')?.actions.filter((item) => item.action.kind === 'view' && item.action.viewType === 'peak-ai-control-center').length,
	1,
	'adding one view to the same group twice must be idempotent',
);

const multiGroup = setCommandCenterCatalogEntryGroup(pinned, entry, 'navigation', true, 'view-navigation');
const onHome = setCommandCenterCatalogEntryHome(multiGroup, entry, true, 'unused-id');
assert.strictEqual(getCommandCenterCatalogEntryMembership(onHome, entry).shownOnHome, true);
assert.ok(onHome.home.layout.some((item) => item.sourceItemId === 'view-pinned'));

const removedPinned = setCommandCenterCatalogEntryGroup(onHome, entry, 'pinned', false, 'unused-id');
assert.deepStrictEqual(
	getCommandCenterCatalogEntryMembership(removedPinned, entry).groups.filter((group) => group.included).map((group) => group.id),
	['navigation'],
);
assert.ok(
	removedPinned.home.layout.some((item) => item.sourceItemId === 'view-navigation'),
	'Home must follow the remaining view membership when its original group is removed',
);

const removedEverywhere = setCommandCenterCatalogEntryGroup(removedPinned, entry, 'navigation', false, 'unused-id');
assert.strictEqual(getCommandCenterCatalogEntryMembership(removedEverywhere, entry).configured, false);
assert.strictEqual(getCommandCenterCatalogEntryMembership(removedEverywhere, entry).shownOnHome, false);

const homeFromEmpty = setCommandCenterCatalogEntryHome(defaults, entry, true, 'home-source');
assert.deepStrictEqual(
	getCommandCenterCatalogEntryMembership(homeFromEmpty, entry).groups.filter((group) => group.included).map((group) => group.id),
	['pinned'],
	'pinning a view to Home must first create a source item in the default group',
);
assert.ok(homeFromEmpty.home.layout.some((item) => item.sourceItemId === 'home-source'));

console.log('command-center-catalog-membership: passed');
