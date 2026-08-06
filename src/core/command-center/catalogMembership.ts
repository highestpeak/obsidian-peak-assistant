import { cloneCommandCenterConfig } from './config';
import { commandCenterActionKey } from './types';
import type {
	CommandCenterActionItem,
	CommandCenterBoardConfig,
	CommandCenterCatalogEntry,
	CommandCenterCatalogEntryMembership,
	CommandCenterGroup,
	CommandCenterItemMembership,
} from './types';

interface LocatedItem {
	group: CommandCenterGroup;
	item: CommandCenterActionItem;
}

function defaultGroupId(config: CommandCenterBoardConfig): string | null {
	return config.groups.find((group) => group.id === 'pinned')?.id
		?? config.groups.slice().sort((left, right) => left.order - right.order)[0]?.id
		?? null;
}

function matchesEntry(item: CommandCenterActionItem, entry: CommandCenterCatalogEntry): boolean {
	return commandCenterActionKey(item.action) === entry.key;
}

function findEntryItems(config: CommandCenterBoardConfig, entry: CommandCenterCatalogEntry): CommandCenterActionItem[] {
	return config.groups.flatMap((group) => group.actions.filter((item) => matchesEntry(item, entry)));
}

function createEntryItem(entry: CommandCenterCatalogEntry, itemId: string, order: number): CommandCenterActionItem {
	return {
		id: itemId,
		action: entry.action,
		shortLabel: entry.label,
		aliases: [],
		icon: entry.icon,
		display: 'auto',
		pinnedToHome: false,
		order,
	};
}

function findItem(config: CommandCenterBoardConfig, itemId: string): LocatedItem | null {
	for (const group of config.groups) {
		const item = group.actions.find((candidate) => candidate.id === itemId);
		if (item) return { group, item };
	}
	return null;
}

function matchesAction(item: CommandCenterActionItem, actionKey: string): boolean {
	return commandCenterActionKey(item.action) === actionKey;
}

function findActionItems(config: CommandCenterBoardConfig, actionKey: string): CommandCenterActionItem[] {
	return config.groups.flatMap((group) => group.actions.filter((item) => matchesAction(item, actionKey)));
}

export function normalizeCommandCenterMemberships(
	config: CommandCenterBoardConfig,
	replacements: ReadonlyMap<string, string> = new Map(),
): void {
	for (const group of config.groups) {
		group.actions = group.actions.map((item, order) => ({ ...item, order }));
	}

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

export function getCommandCenterCatalogEntryMembership(
	config: CommandCenterBoardConfig,
	entry: CommandCenterCatalogEntry,
): CommandCenterCatalogEntryMembership {
	const homeIds = new Set(config.home.layout.map((item) => item.sourceItemId));
	const groups = config.groups
		.slice()
		.sort((left, right) => left.order - right.order)
		.map((group) => ({
			id: group.id,
			label: group.label,
			included: group.actions.some((item) => matchesEntry(item, entry)),
		}));
	const items = findEntryItems(config, entry);
	return {
		key: entry.key,
		defaultGroupId: defaultGroupId(config),
		configured: items.length > 0,
		shownOnHome: items.some((item) => homeIds.has(item.id)),
		groups,
	};
}

export function setCommandCenterCatalogEntryGroup(
	config: CommandCenterBoardConfig,
	entry: CommandCenterCatalogEntry,
	groupId: string,
	included: boolean,
	itemId: string,
): CommandCenterBoardConfig {
	const next = cloneCommandCenterConfig(config);
	const group = next.groups.find((candidate) => candidate.id === groupId);
	if (!group || !entry.key) return next;

	const matches = group.actions.filter((item) => matchesEntry(item, entry));
	if (included && matches.length === 0) {
		group.actions.push(createEntryItem(entry, itemId, group.actions.length));
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
		const fallback = findEntryItems(next, entry)[0];
		if (fallback) {
			for (const removedId of removedIds) replacements.set(removedId, fallback.id);
		}
	}

	normalizeCommandCenterMemberships(next, replacements);
	return next;
}

export function setCommandCenterCatalogEntryHome(
	config: CommandCenterBoardConfig,
	entry: CommandCenterCatalogEntry,
	included: boolean,
	itemId: string,
): CommandCenterBoardConfig {
	let next = cloneCommandCenterConfig(config);
	let items = findEntryItems(next, entry);
	if (included && items.length === 0) {
		const targetGroupId = defaultGroupId(next);
		if (!targetGroupId) return next;
		next = setCommandCenterCatalogEntryGroup(next, entry, targetGroupId, true, itemId);
		items = findEntryItems(next, entry);
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
	normalizeCommandCenterMemberships(next);
	return next;
}

export function getCommandCenterItemMembership(
	config: CommandCenterBoardConfig,
	itemId: string,
): CommandCenterItemMembership | null {
	const located = findItem(config, itemId);
	if (!located) return null;
	const key = commandCenterActionKey(located.item.action);
	const homeIds = new Set(config.home.layout.map((item) => item.sourceItemId));
	const items = findActionItems(config, key);
	return {
		itemId,
		sourceGroupId: located.group.id,
		key,
		defaultGroupId: defaultGroupId(config),
		configured: true,
		shownOnHome: items.some((item) => homeIds.has(item.id)),
		groups: config.groups
			.slice()
			.sort((left, right) => left.order - right.order)
			.map((group) => ({
				id: group.id,
				label: group.label,
				included: group.actions.some((item) => matchesAction(item, key)),
			})),
	};
}

export function setCommandCenterItemGroup(
	config: CommandCenterBoardConfig,
	itemId: string,
	groupId: string,
	included: boolean,
	newItemId: string,
): CommandCenterBoardConfig {
	const next = cloneCommandCenterConfig(config);
	const located = findItem(next, itemId);
	const targetGroup = next.groups.find((group) => group.id === groupId);
	if (!located || !targetGroup) return next;

	const actionKey = commandCenterActionKey(located.item.action);
	const matches = targetGroup.actions.filter((item) => matchesAction(item, actionKey));
	const replacements = new Map<string, string>();

	if (included && matches.length === 0) {
		targetGroup.actions.push({
			...located.item,
			id: newItemId,
			pinnedToHome: false,
			order: targetGroup.actions.length,
		});
	}

	if (included && matches.length > 1) {
		const [survivor, ...duplicates] = matches;
		for (const duplicate of duplicates) replacements.set(duplicate.id, survivor!.id);
		const duplicateIds = new Set(duplicates.map((item) => item.id));
		targetGroup.actions = targetGroup.actions.filter((item) => !duplicateIds.has(item.id));
	}

	if (!included && matches.length > 0) {
		const removedIds = new Set(matches.map((item) => item.id));
		targetGroup.actions = targetGroup.actions.filter((item) => !removedIds.has(item.id));
		const fallback = findActionItems(next, actionKey)[0];
		if (fallback) {
			for (const removedId of removedIds) replacements.set(removedId, fallback.id);
		}
	}

	normalizeCommandCenterMemberships(next, replacements);
	return next;
}

export function setCommandCenterItemHome(
	config: CommandCenterBoardConfig,
	itemId: string,
	included: boolean,
): CommandCenterBoardConfig {
	const next = cloneCommandCenterConfig(config);
	const located = findItem(next, itemId);
	if (!located) return next;
	const actionKey = commandCenterActionKey(located.item.action);
	const actionIds = new Set(findActionItems(next, actionKey).map((item) => item.id));
	const existing = next.home.layout.find((item) => actionIds.has(item.sourceItemId));
	next.home.layout = next.home.layout.filter((item) => !actionIds.has(item.sourceItemId));
	if (included) {
		next.home.layout.push({
			sourceItemId: itemId,
			display: existing?.display ?? 'auto',
			order: existing?.order ?? next.home.layout.length,
		});
	}
	normalizeCommandCenterMemberships(next);
	return next;
}

export function moveCommandCenterItemToGroup(
	config: CommandCenterBoardConfig,
	itemId: string,
	targetGroupId: string,
): CommandCenterBoardConfig {
	const next = cloneCommandCenterConfig(config);
	const located = findItem(next, itemId);
	const targetGroup = next.groups.find((group) => group.id === targetGroupId);
	if (!located || !targetGroup || located.group.id === targetGroupId) return next;

	const actionKey = commandCenterActionKey(located.item.action);
	const existing = targetGroup.actions.find((item) => matchesAction(item, actionKey));
	located.group.actions = located.group.actions.filter((item) => item.id !== itemId);
	if (existing) {
		normalizeCommandCenterMemberships(next, new Map([[itemId, existing.id]]));
		return next;
	}

	targetGroup.actions.push({ ...located.item, order: targetGroup.actions.length });
	normalizeCommandCenterMemberships(next);
	return next;
}
