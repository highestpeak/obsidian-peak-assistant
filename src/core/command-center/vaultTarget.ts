import { cloneCommandCenterConfig } from './config';
import { commandCenterActionKey } from './types';
import type {
	CommandCenterActionItem,
	CommandCenterBoardConfig,
	CommandCenterVaultTargetMembership,
} from './types';

function vaultTargetKey(path: string): string {
	return commandCenterActionKey({ kind: 'vault-target', path });
}

function matchesVaultTarget(item: CommandCenterActionItem, path: string): boolean {
	return commandCenterActionKey(item.action) === vaultTargetKey(path);
}

function defaultGroupId(config: CommandCenterBoardConfig): string | null {
	return config.groups.find((group) => group.id === 'pinned')?.id
		?? config.groups.slice().sort((left, right) => left.order - right.order)[0]?.id
		?? null;
}

function defaultLabel(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') || path;
}

function normalizeGroupOrders(config: CommandCenterBoardConfig): void {
	for (const group of config.groups) {
		group.actions = group.actions.map((item, order) => ({ ...item, order }));
	}
}

function normalizeHomeLayout(
	config: CommandCenterBoardConfig,
	replacements: ReadonlyMap<string, string> = new Map(),
): void {
	const validIds = new Set(config.groups.flatMap((group) => group.actions.map((item) => item.id)));
	const seen = new Set<string>();
	const normalized = config.home.layout
		.slice()
		.sort((left, right) => left.order - right.order)
		.map((item) => ({ ...item, sourceItemId: replacements.get(item.sourceItemId) ?? item.sourceItemId }));
	config.home.layout = [];
	for (const item of normalized) {
		if (!validIds.has(item.sourceItemId) || seen.has(item.sourceItemId)) continue;
		seen.add(item.sourceItemId);
		config.home.layout.push({ ...item, order: config.home.layout.length });
	}
	config.home.quickAccessActionIds = config.home.layout.map((item) => item.sourceItemId);
	const homeIds = new Set(config.home.quickAccessActionIds);
	for (const group of config.groups) {
		group.actions = group.actions.map((item) => ({ ...item, pinnedToHome: homeIds.has(item.id) }));
	}
}

function createVaultTargetItem(path: string, itemId: string, order: number): CommandCenterActionItem {
	return {
		id: itemId,
		action: { kind: 'vault-target', path },
		shortLabel: defaultLabel(path),
		aliases: [],
		icon: { kind: 'lucide', name: 'file-text' },
		display: 'auto',
		pinnedToHome: false,
		order,
	};
}

function findVaultTargetItems(config: CommandCenterBoardConfig, path: string): CommandCenterActionItem[] {
	return config.groups.flatMap((group) => group.actions.filter((item) => matchesVaultTarget(item, path)));
}

export function getCommandCenterVaultTargetMembership(
	config: CommandCenterBoardConfig,
	path: string,
): CommandCenterVaultTargetMembership {
	const homeIds = new Set(config.home.layout.map((item) => item.sourceItemId));
	const groups = config.groups
		.slice()
		.sort((left, right) => left.order - right.order)
		.map((group) => ({
			id: group.id,
			label: group.label,
			included: group.actions.some((item) => matchesVaultTarget(item, path)),
		}));
	const items = findVaultTargetItems(config, path);
	return {
		path,
		defaultGroupId: defaultGroupId(config),
		configured: items.length > 0,
		shownOnHome: items.some((item) => homeIds.has(item.id)),
		groups,
	};
}

export function setCommandCenterVaultTargetGroup(
	config: CommandCenterBoardConfig,
	path: string,
	groupId: string,
	included: boolean,
	itemId: string,
): CommandCenterBoardConfig {
	const next = cloneCommandCenterConfig(config);
	const group = next.groups.find((candidate) => candidate.id === groupId);
	if (!group || !path.trim()) return next;

	const matches = group.actions.filter((item) => matchesVaultTarget(item, path));
	if (included && matches.length === 0) {
		group.actions.push(createVaultTargetItem(path, itemId, group.actions.length));
	}

	const replacements = new Map<string, string>();
	if (included && matches.length > 1) {
		const [survivor, ...duplicates] = matches;
		for (const duplicate of duplicates) replacements.set(duplicate.id, survivor!.id);
		const duplicateIds = new Set(duplicates.map((item) => item.id));
		group.actions = group.actions.filter((item) => !duplicateIds.has(item.id));
	}

	if (!included && matches.length > 0) {
		const removedIds = new Set(matches.map((item) => item.id));
		group.actions = group.actions.filter((item) => !removedIds.has(item.id));
		const fallback = findVaultTargetItems(next, path)[0];
		if (fallback) {
			for (const removedId of removedIds) replacements.set(removedId, fallback.id);
		}
	}

	normalizeGroupOrders(next);
	normalizeHomeLayout(next, replacements);
	return next;
}

export function setCommandCenterVaultTargetHome(
	config: CommandCenterBoardConfig,
	path: string,
	included: boolean,
	itemId: string,
): CommandCenterBoardConfig {
	let next = cloneCommandCenterConfig(config);
	let items = findVaultTargetItems(next, path);
	if (included && items.length === 0) {
		const targetGroupId = defaultGroupId(next);
		if (!targetGroupId) return next;
		next = setCommandCenterVaultTargetGroup(next, path, targetGroupId, true, itemId);
		items = findVaultTargetItems(next, path);
	}

	const targetIds = new Set(items.map((item) => item.id));
	const existing = next.home.layout.find((item) => targetIds.has(item.sourceItemId));
	next.home.layout = next.home.layout.filter((item) => !targetIds.has(item.sourceItemId));
	if (included && items[0]) {
		next.home.layout.push({
			sourceItemId: items[0].id,
			display: existing?.display ?? 'auto',
			order: existing?.order ?? next.home.layout.length,
		});
	}
	normalizeHomeLayout(next);
	return next;
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

	normalizeGroupOrders(next);
	normalizeHomeLayout(next, replacements);
	return next;
}
