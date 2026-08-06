import {
	commandCenterActionKey,
	commandCenterCatalogScopeForAction,
	type CommandCenterCatalogScope,
	type CommandCenterTabId,
	type ResolvedCommandCenterItem,
} from '@/core/command-center';

export interface CommandCenterCustomizeIntent {
	groupId: string;
	itemId: string;
	actionKey: string;
	catalogScope: CommandCenterCatalogScope;
	query: string;
	sourceLabel: string;
}

export interface CommandCenterLauncherRestoreState {
	scope: CommandCenterTabId;
	query: string;
	activeId: string | null;
}

export function createCommandCenterCustomizeIntent(
	item: ResolvedCommandCenterItem,
	groupId: string,
): CommandCenterCustomizeIntent {
	return {
		groupId,
		itemId: item.id,
		actionKey: commandCenterActionKey(item.action),
		catalogScope: commandCenterCatalogScopeForAction(item.action),
		query: item.fullLabel,
		sourceLabel: item.sourceLabel,
	};
}
