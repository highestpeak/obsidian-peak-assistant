import assert from 'assert';
import { readFileSync } from 'fs';
import {
	getCommandCenterVaultTargetMembership,
	renameCommandCenterVaultTargets,
	setCommandCenterVaultTargetGroup,
	setCommandCenterVaultTargetHome,
	type CommandCenterBoardConfig,
} from '../src/core/command-center';

const defaults = JSON.parse(
	readFileSync('templates/config/command-center-defaults.json', 'utf8'),
) as CommandCenterBoardConfig;

const path = 'Projects/Peak Command Center.md';

const empty = getCommandCenterVaultTargetMembership(defaults, path);
assert.strictEqual(empty.defaultGroupId, 'pinned');
assert.strictEqual(empty.configured, false);
assert.strictEqual(empty.shownOnHome, false);
assert.deepStrictEqual(empty.groups.map((group) => [group.id, group.included]), [
	['pinned', false],
	['peak-assistant', false],
	['navigation', false],
]);

const pinned = setCommandCenterVaultTargetGroup(defaults, path, 'pinned', true, 'doc-pinned');
const pinnedState = getCommandCenterVaultTargetMembership(pinned, path);
assert.strictEqual(pinnedState.configured, true);
assert.deepStrictEqual(pinnedState.groups.filter((group) => group.included).map((group) => group.id), ['pinned']);
const pinnedItem = pinned.groups.find((group) => group.id === 'pinned')?.actions.find((item) => item.id === 'doc-pinned');
assert.deepStrictEqual(pinnedItem?.action, { kind: 'vault-target', path });
assert.strictEqual(pinnedItem?.shortLabel, 'Peak Command Center');
assert.deepStrictEqual(pinnedItem?.icon, { kind: 'lucide', name: 'file-text' });

const idempotent = setCommandCenterVaultTargetGroup(pinned, path, 'pinned', true, 'duplicate-id');
assert.strictEqual(
	idempotent.groups.find((group) => group.id === 'pinned')?.actions.filter((item) => item.action.kind === 'vault-target' && item.action.path === path).length,
	1,
	'adding the same document to one group twice must be idempotent',
);

const multiGroup = setCommandCenterVaultTargetGroup(pinned, path, 'navigation', true, 'doc-navigation');
assert.deepStrictEqual(
	getCommandCenterVaultTargetMembership(multiGroup, path).groups.filter((group) => group.included).map((group) => group.id),
	['pinned', 'navigation'],
	'a document may belong to multiple user-owned groups',
);

const onHome = setCommandCenterVaultTargetHome(multiGroup, path, true, 'unused-id');
assert.strictEqual(getCommandCenterVaultTargetMembership(onHome, path).shownOnHome, true);
assert.ok(onHome.home.layout.some((item) => item.sourceItemId === 'doc-pinned'));

const removedDefaultGroup = setCommandCenterVaultTargetGroup(onHome, path, 'pinned', false, 'unused-id');
assert.deepStrictEqual(
	getCommandCenterVaultTargetMembership(removedDefaultGroup, path).groups.filter((group) => group.included).map((group) => group.id),
	['navigation'],
);
assert.deepStrictEqual(
	removedDefaultGroup.home.layout.filter((item) => item.sourceItemId.startsWith('doc-')).map((item) => item.sourceItemId),
	['doc-navigation'],
	'Home must keep pointing at the document when another group membership still owns it',
);

const removedEverywhere = setCommandCenterVaultTargetGroup(removedDefaultGroup, path, 'navigation', false, 'unused-id');
assert.strictEqual(getCommandCenterVaultTargetMembership(removedEverywhere, path).configured, false);
assert.strictEqual(getCommandCenterVaultTargetMembership(removedEverywhere, path).shownOnHome, false);

const homeFromEmpty = setCommandCenterVaultTargetHome(defaults, path, true, 'home-created-source');
assert.deepStrictEqual(
	getCommandCenterVaultTargetMembership(homeFromEmpty, path).groups.filter((group) => group.included).map((group) => group.id),
	['pinned'],
	'Home pinning must first create a real source membership in the default group',
);
assert.ok(homeFromEmpty.home.layout.some((item) => item.sourceItemId === 'home-created-source'));

const customLabel = JSON.parse(JSON.stringify(onHome)) as CommandCenterBoardConfig;
const navigationItem = customLabel.groups.find((group) => group.id === 'navigation')?.actions.find((item) => item.id === 'doc-navigation');
assert.ok(navigationItem);
navigationItem!.shortLabel = 'Research launchpad';
const renamed = renameCommandCenterVaultTargets(customLabel, 'Projects/Peak Command Center.md', 'Archive/Command Center.md');
const renamedItems = renamed.groups.flatMap((group) => group.actions).filter((item) => item.action.kind === 'vault-target' && item.action.path === 'Archive/Command Center.md');
assert.strictEqual(renamedItems.length, 2);
assert.deepStrictEqual(renamedItems.map((item) => item.shortLabel), ['Command Center', 'Research launchpad']);
assert.strictEqual(getCommandCenterVaultTargetMembership(renamed, 'Archive/Command Center.md').shownOnHome, true);

const folderRenamed = renameCommandCenterVaultTargets(renamed, 'Archive', 'Knowledge/Archive');
assert.strictEqual(
	folderRenamed.groups.flatMap((group) => group.actions).filter((item) => item.action.kind === 'vault-target' && item.action.path === 'Knowledge/Archive/Command Center.md').length,
	2,
	'folder moves must rewrite descendant Vault targets as well as exact file paths',
);

console.log('command-center-vault-target-membership: passed');
