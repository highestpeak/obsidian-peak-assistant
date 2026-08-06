import assert from 'assert';
import { readFileSync } from 'fs';
import {
	getCommandCenterCatalogEntryMembership,
	getCommandCenterItemMembership,
	moveCommandCenterItemToGroup,
	setCommandCenterCatalogEntryGroup,
	setCommandCenterCatalogEntryHome,
	setCommandCenterItemGroup,
	setCommandCenterItemHome,
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

const sourceConfig = JSON.parse(JSON.stringify(defaults)) as CommandCenterBoardConfig;
const sourceGroup = sourceConfig.groups.find((group) => group.id === 'peak-assistant')!;
const sourceItem = sourceGroup.actions.find((item) => item.id === 'peak-settings')!;
sourceItem.shortLabel = 'Settings hub';
sourceItem.aliases = ['preferences', 'configuration'];
sourceItem.display = 'wide';

const itemMembership = getCommandCenterItemMembership(sourceConfig, sourceItem.id);
assert.strictEqual(itemMembership?.sourceGroupId, 'peak-assistant');
assert.deepStrictEqual(itemMembership?.groups.filter((group) => group.included).map((group) => group.id), ['peak-assistant']);

const addedItem = setCommandCenterItemGroup(sourceConfig, sourceItem.id, 'navigation', true, 'settings-navigation');
const addedClone = addedItem.groups.find((group) => group.id === 'navigation')?.actions.find((item) => item.id === 'settings-navigation');
assert.deepStrictEqual(
	addedClone && {
		action: addedClone.action,
		shortLabel: addedClone.shortLabel,
		aliases: addedClone.aliases,
		icon: addedClone.icon,
		display: addedClone.display,
	},
	{
		action: sourceItem.action,
		shortLabel: 'Settings hub',
		aliases: ['preferences', 'configuration'],
		icon: sourceItem.icon,
		display: 'wide',
	},
	'Add to tab must preserve the source item presentation instead of rebuilding a generic catalog entry',
);

const itemOnHome = setCommandCenterItemHome(addedItem, sourceItem.id, true);
assert.ok(itemOnHome.home.layout.some((item) => item.sourceItemId === sourceItem.id));

const removedSourceMembership = setCommandCenterItemGroup(itemOnHome, sourceItem.id, 'peak-assistant', false, 'unused');
assert.ok(
	removedSourceMembership.home.layout.some((item) => item.sourceItemId === 'settings-navigation'),
	'Remove from one tab must preserve Home by repointing it to another membership of the same action',
);

const movedToPinned = moveCommandCenterItemToGroup(itemOnHome, sourceItem.id, 'pinned');
assert.strictEqual(movedToPinned.groups.find((group) => group.id === 'peak-assistant')?.actions.some((item) => item.id === sourceItem.id), false);
assert.strictEqual(movedToPinned.groups.find((group) => group.id === 'pinned')?.actions.some((item) => item.id === sourceItem.id), true);
assert.ok(movedToPinned.home.layout.some((item) => item.sourceItemId === sourceItem.id), 'Move must preserve an existing Home projection');

const movedIntoExisting = moveCommandCenterItemToGroup(movedToPinned, sourceItem.id, 'navigation');
assert.strictEqual(
	movedIntoExisting.groups.find((group) => group.id === 'navigation')?.actions.filter((item) => item.action.kind === 'peak-command' && item.action.commandId === 'peak-open-settings').length,
	1,
	'Move into an already configured tab must deduplicate by action identity',
);
assert.ok(
	movedIntoExisting.home.layout.some((item) => item.sourceItemId === 'settings-navigation'),
	'Home must follow the surviving target membership when Move deduplicates',
);

const removedNavigation = setCommandCenterItemGroup(movedIntoExisting, 'settings-navigation', 'navigation', false, 'unused');
assert.strictEqual(getCommandCenterCatalogEntryMembership(removedNavigation, {
	...entry,
	key: 'peak:peak-open-settings',
	action: { kind: 'peak-command', commandId: 'peak-open-settings' },
	label: 'Settings hub',
}).configured, false, 'Remove from the last tab must remove the configured membership');
assert.strictEqual(removedNavigation.home.layout.some((item) => item.sourceItemId === 'settings-navigation'), false);

console.log('command-center-catalog-membership: passed');
