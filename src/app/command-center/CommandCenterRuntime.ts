import { Notice } from 'obsidian';
import type { CommandGateway } from '@/service/capabilities/CommandGateway';
import {
	cloneCommandCenterConfig,
	commandCenterActionKey,
	commandCenterCatalogScopeForAction,
	getCommandCenterCatalogEntryMembership,
	moveCommandCenterItem,
	moveCommandCenterHomeItem,
	moveCommandCenterTab,
	normalizeCommandCenterBoardConfig,
	getCommandCenterVaultTargetMembership,
	renameCommandCenterVaultTargets,
	setCommandCenterVaultTargetGroup,
	setCommandCenterVaultTargetHome,
	setCommandCenterCatalogEntryGroup,
	setCommandCenterCatalogEntryHome,
	type CommandCenterActionItem,
	type CommandCenterBoardConfig,
	type CommandCenterCatalogEntry,
	type CommandCenterCatalogEntryMembership,
	type CommandCenterCatalogScope,
	type CommandCenterDropPlacement,
	type CommandCenterRecentTarget,
	type CommandCenterRuntimePort,
	type CommandCenterTabId,
	type CommandCenterVaultTargetMembership,
	type ResolvedCommandCenterItem,
} from '@/core/command-center';
import type { ObsidianCommandCenterAdapter } from './ObsidianCommandCenterAdapter';
import type { AppContext } from '@/app/context/AppContext';
import { CommandCenterModal } from './CommandCenterModal';

function sourceForItem(item: CommandCenterActionItem, adapter: ObsidianCommandCenterAdapter): string {
	const command = adapter.getCommand(item.action);
	if (item.action.kind === 'peak-command') return 'Peak Assistant';
	if (item.action.kind === 'obsidian-command') return command?.name.split(':')[0] || item.action.pluginId || 'Obsidian';
	if (item.action.kind === 'vault-target') return item.action.path;
	if (item.action.kind === 'bookmark') return 'Bookmark';
	if (item.action.kind === 'workspace') return 'Workspace';
	return 'View';
}

function isDestination(item: CommandCenterActionItem): boolean {
	return item.action.kind === 'vault-target'
		|| item.action.kind === 'bookmark'
		|| item.action.kind === 'workspace'
		|| item.action.kind === 'view';
}

export class CommandCenterRuntime implements CommandCenterRuntimePort {
	private config: CommandCenterBoardConfig;
	private readonly listeners = new Set<() => void>();
	private persistTail: Promise<void> = Promise.resolve();
	private idSequence = 0;

	constructor(
		defaults: CommandCenterBoardConfig,
		persisted: CommandCenterBoardConfig | undefined,
		private readonly adapter: ObsidianCommandCenterAdapter,
		private readonly gateway: CommandGateway,
		private readonly persist: (config: CommandCenterBoardConfig) => Promise<void>,
		private readonly appContext: AppContext,
	) {
		this.config = normalizeCommandCenterBoardConfig(persisted, defaults);
	}

	getConfig(): CommandCenterBoardConfig {
		return cloneCommandCenterConfig(this.config);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async saveConfig(config: CommandCenterBoardConfig): Promise<void> {
		this.config = normalizeCommandCenterBoardConfig(config, this.config);
		this.listeners.forEach((listener) => listener());
		const snapshot = this.getConfig();
		this.persistTail = this.persistTail
			.catch(() => undefined)
			.then(() => this.persist(snapshot));
		await this.persistTail;
	}

	async moveItem(
		itemId: string,
		targetGroupId: string,
		targetItemId: string | null,
		placement: CommandCenterDropPlacement,
	): Promise<void> {
		await this.saveConfig(moveCommandCenterItem(this.config, itemId, targetGroupId, targetItemId, placement));
	}

	async moveHomeItem(
		itemId: string,
		targetItemId: string | null,
		placement: CommandCenterDropPlacement,
	): Promise<void> {
		await this.saveConfig(moveCommandCenterHomeItem(this.config, itemId, targetItemId, placement));
	}

	async moveTab(
		tabId: CommandCenterTabId,
		targetTabId: CommandCenterTabId,
		placement: CommandCenterDropPlacement,
	): Promise<void> {
		await this.saveConfig(moveCommandCenterTab(this.config, tabId, targetTabId, placement));
	}

	getVaultTargetMembership(path: string): CommandCenterVaultTargetMembership {
		return getCommandCenterVaultTargetMembership(this.config, path);
	}

	async setVaultTargetGroup(
		path: string,
		groupId: string,
		included: boolean,
	): Promise<CommandCenterVaultTargetMembership> {
		const next = setCommandCenterVaultTargetGroup(
			this.config,
			path,
			groupId,
			included,
			this.createActionId(),
		);
		if (JSON.stringify(next) !== JSON.stringify(this.config)) await this.saveConfig(next);
		return this.getVaultTargetMembership(path);
	}

	async setVaultTargetHome(path: string, included: boolean): Promise<CommandCenterVaultTargetMembership> {
		const next = setCommandCenterVaultTargetHome(this.config, path, included, this.createActionId());
		if (JSON.stringify(next) !== JSON.stringify(this.config)) await this.saveConfig(next);
		return this.getVaultTargetMembership(path);
	}

	async renameVaultTargets(oldPath: string, newPath: string): Promise<void> {
		const next = renameCommandCenterVaultTargets(this.config, oldPath, newPath);
		if (JSON.stringify(next) === JSON.stringify(this.config)) return;
		await this.saveConfig(next);
	}

	async resolveItems(groupId: string | 'home', query = ''): Promise<ResolvedCommandCenterItem[]> {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		const candidates: Array<{ group: typeof this.config.groups[number]; item: CommandCenterActionItem }> = [];
		if (groupId === 'home') {
			const owners = new Map(this.config.groups.flatMap((group) => group.actions.map((item) => [item.id, { group, item }] as const)));
			for (const layoutItem of this.config.home.layout.slice().sort((left, right) => left.order - right.order)) {
				const owner = owners.get(layoutItem.sourceItemId);
				if (!owner) continue;
				candidates.push({ group: owner.group, item: { ...owner.item, display: layoutItem.display } });
			}
		} else {
			const group = this.config.groups.find((candidate) => candidate.id === groupId);
			if (group) {
				for (const item of group.actions.slice().sort((left, right) => left.order - right.order)) candidates.push({ group, item });
			}
		}
		const resolved: ResolvedCommandCenterItem[] = [];
		for (const { group, item } of candidates) {
			const command = this.adapter.getCommand(item.action);
			const available = isDestination(item) ? this.adapter.destinationAvailable(item.action) : command !== null;
			const fullLabel = command?.name ?? item.shortLabel;
			const sourceLabel = sourceForItem(item, this.adapter);
			const searchable = [item.shortLabel, fullLabel, sourceLabel, group.label, ...item.aliases]
				.join(' ')
				.toLocaleLowerCase();
			if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
			resolved.push({
				...item,
				groupId: groupId === 'home' ? 'home' : group.id,
				groupLabel: groupId === 'home' ? 'Home' : group.label,
				fullLabel,
				sourceLabel,
				layer: isDestination(item) ? 'destination' : 'command',
				available,
				unavailableReason: available ? undefined : 'This command or destination is not currently available.',
				hotkey: this.adapter.resolveHotkey(item.action),
			});
		}
		return resolved;
	}

	async getCatalog(query = '', scope: CommandCenterCatalogScope = 'commands'): Promise<CommandCenterCatalogEntry[]> {
		const catalog = await this.adapter.listCatalog(query, scope);
		const normalizedQuery = query.trim().toLocaleLowerCase();
		const existingKeys = new Set(catalog.map((entry) => entry.key));
		for (const group of this.config.groups) {
			for (const item of group.actions) {
				if (commandCenterCatalogScopeForAction(item.action) !== scope) continue;
				const key = commandCenterActionKey(item.action);
				if (existingKeys.has(key)) continue;
				const sourceLabel = sourceForItem(item, this.adapter);
				const searchable = [item.shortLabel, sourceLabel, group.label, ...item.aliases]
					.join(' ')
					.toLocaleLowerCase();
				if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
				catalog.unshift({
					key,
					action: item.action,
					label: item.shortLabel,
					sourceLabel,
					icon: item.icon,
					layer: isDestination(item) ? 'destination' : 'command',
					available: false,
					unavailableReason: 'Configured item is no longer available.',
					hotkey: null,
				});
				existingKeys.add(key);
			}
		}
		return catalog;
	}

	async invokeItem(item: CommandCenterActionItem): Promise<boolean> {
		if (item.action.kind !== 'peak-command') return this.adapter.execute(item.action);
		if (!this.gateway.has(item.action.commandId)) {
			new Notice(`Peak command is no longer available: ${item.action.commandId}`, 5000);
			return false;
		}
		try {
			await this.gateway.dispatch(item.action.commandId);
			return true;
		} catch (error) {
			console.error(`[Command Center] Peak command '${item.action.commandId}' failed.`, error);
			new Notice(`Command failed: ${item.shortLabel}`, 5000);
			return false;
		}
	}

	async invokeCatalogEntry(entry: CommandCenterCatalogEntry): Promise<boolean> {
		return this.invokeItem({
			id: entry.key,
			action: entry.action,
			shortLabel: entry.label,
			aliases: [],
			icon: entry.icon,
			display: 'auto',
			pinnedToHome: false,
			order: 0,
		});
	}

	getRecentTargets(): CommandCenterRecentTarget[] {
		return this.adapter.getRecentTargets();
	}

	getCatalogEntryMembership(entry: CommandCenterCatalogEntry): CommandCenterCatalogEntryMembership {
		return getCommandCenterCatalogEntryMembership(this.config, entry);
	}

	async setCatalogEntryGroup(
		entry: CommandCenterCatalogEntry,
		groupId: string,
		included: boolean,
	): Promise<CommandCenterCatalogEntryMembership> {
		const next = setCommandCenterCatalogEntryGroup(
			this.config,
			entry,
			groupId,
			included,
			this.createActionId(),
		);
		if (JSON.stringify(next) !== JSON.stringify(this.config)) await this.saveConfig(next);
		return this.getCatalogEntryMembership(entry);
	}

	async setCatalogEntryHome(
		entry: CommandCenterCatalogEntry,
		included: boolean,
	): Promise<CommandCenterCatalogEntryMembership> {
		const next = setCommandCenterCatalogEntryHome(
			this.config,
			entry,
			included,
			this.createActionId(),
		);
		if (JSON.stringify(next) !== JSON.stringify(this.config)) await this.saveConfig(next);
		return this.getCatalogEntryMembership(entry);
	}

	openLauncher(): void {
		new CommandCenterModal(this.appContext, this, 'launcher').open();
	}

	openCustomize(): void {
		new CommandCenterModal(this.appContext, this, 'customize').open();
	}

	async openHome(): Promise<void> {
		await this.adapter.execute({ kind: 'view', viewType: 'peak-command-center-home' });
	}

	openNativeCommandPalette(): void {
		this.adapter.openNativeCommandPalette();
	}

	private createActionId(): string {
		this.idSequence += 1;
		const randomId = globalThis.crypto?.randomUUID?.()
			?? `${Date.now().toString(36)}-${this.idSequence.toString(36)}`;
		return `action-${randomId}`;
	}
}
