import { cloneCommandCenterConfig } from './config';
import { commandCenterActionKey } from './types';
import type {
	CommandCenterActionItem,
	CommandCenterBoardConfig,
	CommandCenterCatalogEntry,
	CommandCenterCatalogEntryMembership,
} from './types';

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
