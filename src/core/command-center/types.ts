export type CommandCenterAction =
	| { kind: 'peak-command'; commandId: string }
	| { kind: 'obsidian-command'; commandId: string; pluginId?: string }
	| { kind: 'vault-target'; path: string; subpath?: string }
	| { kind: 'bookmark'; bookmarkId: string; path?: string }
	| { kind: 'workspace'; workspaceName: string }
	| { kind: 'view'; viewType: string };

export type CommandCenterItemIcon =
	| { kind: 'lucide'; name: string }
	| { kind: 'emoji'; value: string };

export type CommandCenterDisplayMode = 'auto' | 'icon' | 'compact' | 'wide' | 'full';
export type ResolvedCommandCenterDisplayMode = Exclude<CommandCenterDisplayMode, 'auto'>;
export type CommandCenterDropPlacement = 'before' | 'after';
export type CommandCenterTabId = string | 'home';

export interface CommandCenterActionItem {
	id: string;
	action: CommandCenterAction;
	shortLabel: string;
	aliases: string[];
	icon?: CommandCenterItemIcon;
	display: CommandCenterDisplayMode;
	pinnedToHome: boolean;
	order: number;
}

export interface CommandCenterGroup {
	id: string;
	label: string;
	icon?: CommandCenterItemIcon;
	order: number;
	actions: CommandCenterActionItem[];
}

export interface CommandCenterHomeLayoutItem {
	sourceItemId: string;
	display: CommandCenterDisplayMode;
	order: number;
}

export interface CommandCenterBoardConfig {
	version: 2;
	modal: {
		density: 'compact';
		tabOrder: CommandCenterTabId[];
	};
	home: {
		openOnStartup: boolean;
		replaceEmptyTab: boolean;
		layout: CommandCenterHomeLayoutItem[];
		/** Compatibility mirror retained while version 1 settings migrate to layout. */
		quickAccessActionIds: string[];
		pinnedTargetIds: string[];
	};
	groups: CommandCenterGroup[];
}

export type CommandCenterLayer = 'destination' | 'command';

export type CommandCenterCatalogScope =
	| 'commands'
	| 'documents'
	| 'bookmarks'
	| 'workspaces-views';

export function commandCenterCatalogScopeForAction(action: CommandCenterAction): CommandCenterCatalogScope {
	if (action.kind === 'peak-command' || action.kind === 'obsidian-command') return 'commands';
	if (action.kind === 'vault-target') return 'documents';
	if (action.kind === 'bookmark') return 'bookmarks';
	return 'workspaces-views';
}

export interface ResolvedCommandCenterItem extends CommandCenterActionItem {
	groupId: string;
	groupLabel: string;
	fullLabel: string;
	sourceLabel: string;
	layer: CommandCenterLayer;
	available: boolean;
	unavailableReason?: string;
	hotkey: string | null;
}

export interface CommandCenterCatalogEntry {
	key: string;
	action: CommandCenterAction;
	label: string;
	sourceLabel: string;
	icon?: CommandCenterItemIcon;
	layer: CommandCenterLayer;
	available: boolean;
	unavailableReason?: string;
	hotkey: string | null;
}

export interface CommandCenterRecentTarget {
	path: string;
	label: string;
	parentPath: string;
}

export interface CommandCenterRuntimePort {
	getConfig(): CommandCenterBoardConfig;
	subscribe(listener: () => void): () => void;
	saveConfig(config: CommandCenterBoardConfig): Promise<void>;
	moveItem(itemId: string, targetGroupId: string, targetItemId: string | null, placement: CommandCenterDropPlacement): Promise<void>;
	moveHomeItem(itemId: string, targetItemId: string | null, placement: CommandCenterDropPlacement): Promise<void>;
	moveTab(tabId: CommandCenterTabId, targetTabId: CommandCenterTabId, placement: CommandCenterDropPlacement): Promise<void>;
	resolveItems(groupId: string | 'home', query?: string): Promise<ResolvedCommandCenterItem[]>;
	getCatalog(query?: string, scope?: CommandCenterCatalogScope): Promise<CommandCenterCatalogEntry[]>;
	invokeItem(item: CommandCenterActionItem): Promise<boolean>;
	invokeCatalogEntry(entry: CommandCenterCatalogEntry): Promise<boolean>;
	getRecentTargets(): CommandCenterRecentTarget[];
	openLauncher(): void;
	openCustomize(): void;
	openHome(): Promise<void>;
	openNativeCommandPalette(): void;
}

export function commandCenterActionKey(action: CommandCenterAction): string {
	switch (action.kind) {
		case 'peak-command':
			return `peak:${action.commandId}`;
		case 'obsidian-command':
			return `command:${action.commandId}`;
		case 'vault-target':
			return `vault:${action.path}#${action.subpath ?? ''}`;
		case 'bookmark':
			return `bookmark:${action.bookmarkId}`;
		case 'workspace':
			return `workspace:${action.workspaceName}`;
		case 'view':
			return `view:${action.viewType}`;
	}
}
