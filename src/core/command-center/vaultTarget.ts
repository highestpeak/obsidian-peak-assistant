import { cloneCommandCenterConfig } from './config';
import { commandCenterActionKey } from './types';
import {
	getCommandCenterCatalogEntryMembership,
	normalizeCommandCenterMemberships,
	setCommandCenterCatalogEntryGroup,
	setCommandCenterCatalogEntryHome,
} from './catalogMembership';
import type {
	CommandCenterActionItem,
	CommandCenterBoardConfig,
	CommandCenterCatalogEntry,
	CommandCenterVaultTargetMembership,
} from './types';

function defaultLabel(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') || path;
}

function vaultTargetEntry(path: string): CommandCenterCatalogEntry {
	const action = { kind: 'vault-target' as const, path };
	return {
		key: commandCenterActionKey(action),
		action,
		label: defaultLabel(path),
		sourceLabel: path,
		icon: { kind: 'lucide', name: 'file-text' },
		layer: 'destination',
		available: true,
		hotkey: null,
	};
}

export function getCommandCenterVaultTargetMembership(
	config: CommandCenterBoardConfig,
	path: string,
): CommandCenterVaultTargetMembership {
	const membership = getCommandCenterCatalogEntryMembership(config, vaultTargetEntry(path));
	return {
		path,
		defaultGroupId: membership.defaultGroupId,
		configured: membership.configured,
		shownOnHome: membership.shownOnHome,
		groups: membership.groups,
	};
}

export function setCommandCenterVaultTargetGroup(
	config: CommandCenterBoardConfig,
	path: string,
	groupId: string,
	included: boolean,
	itemId: string,
): CommandCenterBoardConfig {
	if (!path.trim()) return cloneCommandCenterConfig(config);
	return setCommandCenterCatalogEntryGroup(config, vaultTargetEntry(path), groupId, included, itemId);
}

export function setCommandCenterVaultTargetHome(
	config: CommandCenterBoardConfig,
	path: string,
	included: boolean,
	itemId: string,
): CommandCenterBoardConfig {
	if (!path.trim()) return cloneCommandCenterConfig(config);
	return setCommandCenterCatalogEntryHome(config, vaultTargetEntry(path), included, itemId);
}

function renamedPath(path: string, oldPath: string, newPath: string): string | null {
	if (path === oldPath) return newPath;
	if (!path.startsWith(`${oldPath}/`)) return null;
	return `${newPath}${path.slice(oldPath.length)}`;
}

export function renameCommandCenterVaultTargets(
	config: CommandCenterBoardConfig,
	oldPath: string,
	newPath: string,
): CommandCenterBoardConfig {
	const next = cloneCommandCenterConfig(config);
	if (!oldPath || !newPath || oldPath === newPath) return next;

	const replacements = new Map<string, string>();
	for (const group of next.groups) {
		for (const item of group.actions) {
			if (item.action.kind !== 'vault-target') continue;
			const path = renamedPath(item.action.path, oldPath, newPath);
			if (!path) continue;
			const previousDefaultLabel = defaultLabel(item.action.path);
			item.action = { ...item.action, path };
			if (item.shortLabel === previousDefaultLabel) item.shortLabel = defaultLabel(path);
		}

		const seen = new Map<string, CommandCenterActionItem>();
		group.actions = group.actions.filter((item) => {
			const key = commandCenterActionKey(item.action);
			const survivor = seen.get(key);
			if (!survivor) {
				seen.set(key, item);
				return true;
			}
			replacements.set(item.id, survivor.id);
			return false;
		});
	}

	normalizeCommandCenterMemberships(next, replacements);
	return next;
}
