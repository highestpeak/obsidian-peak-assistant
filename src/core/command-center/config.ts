import type {
	CommandCenterAction,
	CommandCenterActionItem,
	CommandCenterBoardConfig,
	CommandCenterDropPlacement,
	CommandCenterDisplayMode,
	CommandCenterGroup,
	CommandCenterHomeLayoutItem,
	CommandCenterItemIcon,
	CommandCenterTabId,
} from './types';

const DISPLAY_MODES = new Set<CommandCenterDisplayMode>(['auto', 'icon', 'compact', 'wide', 'full']);

function normalizeDisplayMode(value: unknown, icon: CommandCenterItemIcon | undefined): CommandCenterDisplayMode {
	let display: CommandCenterDisplayMode;
	if (DISPLAY_MODES.has(value as CommandCenterDisplayMode)) display = value as CommandCenterDisplayMode;
	else if (value === 'icon-label' || value === 'icon-only') display = 'icon';
	else if (value === 'text-only') display = 'full';
	else display = 'auto';
	return display === 'icon' && !icon ? 'auto' : display;
}

function cleanText(value: unknown, fallback = ''): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeIcon(value: unknown): CommandCenterItemIcon | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const raw = value as Record<string, unknown>;
	if (raw.kind === 'lucide') {
		const name = cleanText(raw.name);
		return name ? { kind: 'lucide', name } : undefined;
	}
	if (raw.kind === 'emoji') {
		const emoji = cleanText(raw.value);
		return emoji ? { kind: 'emoji', value: Array.from(emoji).slice(0, 8).join('') } : undefined;
	}
	return undefined;
}

function normalizeAction(value: unknown): CommandCenterAction | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	switch (raw.kind) {
		case 'peak-command': {
			const commandId = cleanText(raw.commandId);
			return commandId ? { kind: 'peak-command', commandId } : null;
		}
		case 'obsidian-command': {
			const commandId = cleanText(raw.commandId);
			if (!commandId) return null;
			const pluginId = cleanText(raw.pluginId);
			return pluginId ? { kind: 'obsidian-command', commandId, pluginId } : { kind: 'obsidian-command', commandId };
		}
		case 'vault-target': {
			const path = cleanText(raw.path);
			if (!path) return null;
			const subpath = cleanText(raw.subpath);
			return subpath ? { kind: 'vault-target', path, subpath } : { kind: 'vault-target', path };
		}
		case 'bookmark': {
			const bookmarkId = cleanText(raw.bookmarkId);
			if (!bookmarkId) return null;
			const path = cleanText(raw.path);
			return path ? { kind: 'bookmark', bookmarkId, path } : { kind: 'bookmark', bookmarkId };
		}
		case 'workspace': {
			const workspaceName = cleanText(raw.workspaceName);
			return workspaceName ? { kind: 'workspace', workspaceName } : null;
		}
		case 'view': {
			const viewType = cleanText(raw.viewType);
			return viewType ? { kind: 'view', viewType } : null;
		}
		default:
			return null;
	}
}

function normalizeItem(value: unknown, index: number): CommandCenterActionItem | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	const action = normalizeAction(raw.action);
	const id = cleanText(raw.id);
	const shortLabel = cleanText(raw.shortLabel, 'Untitled action');
	if (!action || !id) return null;
	const icon = normalizeIcon(raw.icon);
	return {
		id,
		action,
		shortLabel,
		aliases: Array.isArray(raw.aliases)
			? raw.aliases.map((alias) => cleanText(alias)).filter(Boolean).slice(0, 12)
			: [],
		icon,
		display: normalizeDisplayMode(raw.display, icon),
		pinnedToHome: raw.pinnedToHome === true,
		order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
	};
}

function normalizeGroup(value: unknown, index: number): CommandCenterGroup | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	const id = cleanText(raw.id);
	const label = cleanText(raw.label, 'Untitled group');
	if (!id) return null;
	const actions = Array.isArray(raw.actions)
		? raw.actions.map(normalizeItem).filter((item): item is CommandCenterActionItem => item !== null)
		: [];
	return {
		id,
		label,
		icon: normalizeIcon(raw.icon),
		order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
		actions: actions.sort((a, b) => a.order - b.order).map((item, order) => ({ ...item, order })),
	};
}

function normalizeTabOrder(value: unknown, groups: CommandCenterGroup[]): Array<string | 'home'> {
	const groupIds = groups.map((group) => group.id);
	const valid = new Set<string>(['home', ...groupIds]);
	const requested = Array.isArray(value)
		? value.map((item) => cleanText(item)).map((item) => item === 'all' ? 'home' : item).filter((item) => valid.has(item))
		: [];
	const ordered = Array.from(new Set(requested.filter((item) => item !== 'home'))) as Array<string | 'home'>;
	for (const groupId of groupIds) {
		if (!ordered.includes(groupId)) ordered.push(groupId);
	}
	return ['home', ...ordered];
}

function normalizeHomeLayout(
	value: unknown,
	legacyIds: string[],
	groups: CommandCenterGroup[],
): CommandCenterHomeLayoutItem[] {
	const sourceItems = groups.flatMap((group) => group.actions);
	const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
	const seen = new Set<string>();
	const normalized: CommandCenterHomeLayoutItem[] = [];
	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			if (!entry || typeof entry !== 'object') continue;
			const raw = entry as Record<string, unknown>;
			const sourceItemId = cleanText(raw.sourceItemId);
			const sourceItem = sourceById.get(sourceItemId);
			if (!sourceItem || seen.has(sourceItemId)) continue;
			seen.add(sourceItemId);
			normalized.push({
				sourceItemId,
				display: normalizeDisplayMode(raw.display, sourceItem.icon),
				order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
			});
		}
	} else {
		const migratedIds = [...legacyIds, ...sourceItems.filter((item) => item.pinnedToHome).map((item) => item.id)];
		for (const sourceItemId of migratedIds) {
			const sourceItem = sourceById.get(sourceItemId);
			if (!sourceItem || seen.has(sourceItemId)) continue;
			seen.add(sourceItemId);
			normalized.push({ sourceItemId, display: 'auto', order: normalized.length });
		}
	}
	return normalized
		.sort((left, right) => left.order - right.order)
		.map((item, order) => ({ ...item, order }));
}

export function normalizeCommandCenterBoardConfig(
	value: unknown,
	fallback: CommandCenterBoardConfig,
): CommandCenterBoardConfig {
	if (!value || typeof value !== 'object') return cloneCommandCenterConfig(fallback);
	const raw = value as Record<string, unknown>;
	const groups = Array.isArray(raw.groups)
		? raw.groups.map(normalizeGroup).filter((group): group is CommandCenterGroup => group !== null)
		: [];
	if (groups.length === 0) return cloneCommandCenterConfig(fallback);
	const orderedGroups = groups.sort((a, b) => a.order - b.order);
	const rawModal = raw.modal && typeof raw.modal === 'object' ? raw.modal as Record<string, unknown> : {};
	const tabOrder = normalizeTabOrder(rawModal.tabOrder, orderedGroups);
	const groupOrder = tabOrder.filter((scope) => scope !== 'home');
	const orderByGroupId = new Map(groupOrder.map((groupId, order) => [groupId, order]));
	const rawHome = raw.home && typeof raw.home === 'object' ? raw.home as Record<string, unknown> : {};
	const strings = (entry: unknown): string[] => Array.isArray(entry)
		? entry.map((item) => cleanText(item)).filter(Boolean)
		: [];
	const groupsInTabOrder = orderedGroups
		.sort((a, b) => (orderByGroupId.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderByGroupId.get(b.id) ?? Number.MAX_SAFE_INTEGER))
		.map((group, order) => ({ ...group, order }));
	const homeLayout = normalizeHomeLayout(rawHome.layout, strings(rawHome.quickAccessActionIds), groupsInTabOrder);
	const homeItemIds = new Set(homeLayout.map((item) => item.sourceItemId));
	return {
		version: 2,
		modal: { density: 'compact', tabOrder },
		home: {
			openOnStartup: rawHome.openOnStartup === true,
			replaceEmptyTab: rawHome.replaceEmptyTab === true,
			layout: homeLayout,
			quickAccessActionIds: homeLayout.map((item) => item.sourceItemId),
			pinnedTargetIds: strings(rawHome.pinnedTargetIds),
		},
		groups: groupsInTabOrder.map((group) => ({
			...group,
			actions: group.actions.map((item) => ({ ...item, pinnedToHome: homeItemIds.has(item.id) })),
		})),
	};
}

export function cloneCommandCenterConfig(config: CommandCenterBoardConfig): CommandCenterBoardConfig {
	return JSON.parse(JSON.stringify(config)) as CommandCenterBoardConfig;
}

export function moveCommandCenterItem(
	config: CommandCenterBoardConfig,
	itemId: string,
	targetGroupId: string,
	targetItemId: string | null,
	placement: CommandCenterDropPlacement,
): CommandCenterBoardConfig {
	const next = cloneCommandCenterConfig(config);
	if (targetItemId === itemId) return next;
	const sourceGroup = next.groups.find((group) => group.actions.some((item) => item.id === itemId));
	const targetGroup = next.groups.find((group) => group.id === targetGroupId);
	if (!sourceGroup || !targetGroup) return next;

	const sourceIndex = sourceGroup.actions.findIndex((item) => item.id === itemId);
	const [moved] = sourceGroup.actions.splice(sourceIndex, 1);
	if (!moved) return next;

	const targetIndex = targetItemId
		? targetGroup.actions.findIndex((item) => item.id === targetItemId)
		: -1;
	const insertionIndex = targetIndex < 0
		? targetGroup.actions.length
		: targetIndex + (placement === 'after' ? 1 : 0);
	targetGroup.actions.splice(insertionIndex, 0, moved);
	for (const group of next.groups) {
		group.actions = group.actions.map((item, order) => ({ ...item, order }));
	}
	return next;
}

export function moveCommandCenterHomeItem(
	config: CommandCenterBoardConfig,
	itemId: string,
	targetItemId: string | null,
	placement: CommandCenterDropPlacement,
): CommandCenterBoardConfig {
	const next = cloneCommandCenterConfig(config);
	if (targetItemId === itemId) return next;
	const sourceIndex = next.home.layout.findIndex((item) => item.sourceItemId === itemId);
	if (sourceIndex < 0) return next;
	const [moved] = next.home.layout.splice(sourceIndex, 1);
	if (!moved) return next;
	const targetIndex = targetItemId
		? next.home.layout.findIndex((item) => item.sourceItemId === targetItemId)
		: -1;
	const insertionIndex = targetIndex < 0
		? next.home.layout.length
		: targetIndex + (placement === 'after' ? 1 : 0);
	next.home.layout.splice(insertionIndex, 0, moved);
	next.home.layout = next.home.layout.map((item, order) => ({ ...item, order }));
	next.home.quickAccessActionIds = next.home.layout.map((item) => item.sourceItemId);
	return next;
}

export function moveCommandCenterTab(
	config: CommandCenterBoardConfig,
	tabId: CommandCenterTabId,
	targetTabId: CommandCenterTabId,
	placement: CommandCenterDropPlacement,
): CommandCenterBoardConfig {
	const next = cloneCommandCenterConfig(config);
	if (tabId === 'home' || tabId === targetTabId) return next;
	const tabs = next.modal.tabOrder.slice();
	const sourceIndex = tabs.indexOf(tabId);
	if (sourceIndex < 0 || !tabs.includes(targetTabId)) return next;
	const [moved] = tabs.splice(sourceIndex, 1);
	if (!moved) return next;
	const targetIndex = tabs.indexOf(targetTabId);
	const insertionIndex = targetTabId === 'home' ? 1 : targetIndex + (placement === 'after' ? 1 : 0);
	tabs.splice(insertionIndex, 0, moved);
	next.modal.tabOrder = ['home', ...tabs.filter((entry) => entry !== 'home')];
	const groupOrder = next.modal.tabOrder.filter((entry): entry is string => entry !== 'home');
	const orderByGroupId = new Map(groupOrder.map((groupId, order) => [groupId, order]));
	next.groups = next.groups
		.slice()
		.sort((left, right) => (orderByGroupId.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderByGroupId.get(right.id) ?? Number.MAX_SAFE_INTEGER))
		.map((group, order) => ({ ...group, order }));
	return next;
}
