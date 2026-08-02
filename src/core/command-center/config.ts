import type {
	CommandCenterAction,
	CommandCenterActionItem,
	CommandCenterBoardConfig,
	CommandCenterDisplayMode,
	CommandCenterGroup,
	CommandCenterItemIcon,
} from './types';

const DISPLAY_MODES = new Set<CommandCenterDisplayMode>(['icon-label', 'icon-only', 'text-only']);

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
	const display = DISPLAY_MODES.has(raw.display as CommandCenterDisplayMode)
		? raw.display as CommandCenterDisplayMode
		: 'icon-label';
	const icon = normalizeIcon(raw.icon);
	return {
		id,
		action,
		shortLabel,
		aliases: Array.isArray(raw.aliases)
			? raw.aliases.map((alias) => cleanText(alias)).filter(Boolean).slice(0, 12)
			: [],
		icon,
		display: display === 'icon-only' && !icon ? 'text-only' : display,
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
		actionLayout: raw.actionLayout === 'rows' ? 'rows' : 'layered',
		order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
		actions: actions.sort((a, b) => a.order - b.order).map((item, order) => ({ ...item, order })),
	};
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
	const rawHome = raw.home && typeof raw.home === 'object' ? raw.home as Record<string, unknown> : {};
	const strings = (entry: unknown): string[] => Array.isArray(entry)
		? entry.map((item) => cleanText(item)).filter(Boolean)
		: [];
	return {
		version: 1,
		modal: { density: 'compact' },
		home: {
			openOnStartup: rawHome.openOnStartup === true,
			replaceEmptyTab: rawHome.replaceEmptyTab === true,
			quickAccessActionIds: strings(rawHome.quickAccessActionIds),
			pinnedTargetIds: strings(rawHome.pinnedTargetIds),
		},
		groups: groups.sort((a, b) => a.order - b.order).map((group, order) => ({ ...group, order })),
	};
}

export function cloneCommandCenterConfig(config: CommandCenterBoardConfig): CommandCenterBoardConfig {
	return JSON.parse(JSON.stringify(config)) as CommandCenterBoardConfig;
}
