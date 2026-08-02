import { Notice } from 'obsidian';
import type { CommandGateway } from '@/service/capabilities/CommandGateway';
import {
	cloneCommandCenterConfig,
	commandCenterActionKey,
	normalizeCommandCenterBoardConfig,
	type CommandCenterActionItem,
	type CommandCenterBoardConfig,
	type CommandCenterCatalogEntry,
	type CommandCenterRecentTarget,
	type CommandCenterRuntimePort,
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

	async resolveItems(groupId: string | 'all', query = ''): Promise<ResolvedCommandCenterItem[]> {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		const groups = this.config.groups
			.filter((group) => groupId === 'all' || group.id === groupId)
			.sort((a, b) => a.order - b.order);
		const seen = new Set<string>();
		const resolved: ResolvedCommandCenterItem[] = [];
		for (const group of groups) {
			for (const item of group.actions.slice().sort((a, b) => a.order - b.order)) {
				const identity = commandCenterActionKey(item.action);
				if (groupId === 'all' && seen.has(identity)) continue;
				seen.add(identity);
				const command = this.adapter.getCommand(item.action);
				const available = isDestination(item) ? this.destinationAvailable(item) : command !== null;
				const fullLabel = command?.name ?? item.shortLabel;
				const sourceLabel = sourceForItem(item, this.adapter);
				const searchable = [item.shortLabel, fullLabel, sourceLabel, group.label, ...item.aliases]
					.join(' ')
					.toLocaleLowerCase();
				if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
				resolved.push({
					...item,
					groupId: group.id,
					groupLabel: group.label,
					fullLabel,
					sourceLabel,
					layer: isDestination(item) ? 'destination' : 'command',
					available,
					unavailableReason: available ? undefined : 'This command or destination is not currently available.',
					hotkey: this.adapter.resolveHotkey(item.action),
				});
			}
		}
		return resolved;
	}

	async getCatalog(query = ''): Promise<CommandCenterCatalogEntry[]> {
		const catalog = this.adapter.listCatalog(query);
		const normalizedQuery = query.trim().toLocaleLowerCase();
		const existingKeys = new Set(catalog.map((entry) => entry.key));
		for (const group of this.config.groups) {
			for (const item of group.actions) {
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
			display: entry.icon ? 'icon-label' : 'text-only',
			pinnedToHome: false,
			order: 0,
		});
	}

	getRecentTargets(): CommandCenterRecentTarget[] {
		return this.adapter.getRecentTargets();
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

	private destinationAvailable(item: CommandCenterActionItem): boolean {
		if (item.action.kind === 'vault-target') {
			return this.adapter.listCatalog(item.action.path).some((entry) => entry.key === commandCenterActionKey(item.action));
		}
		if (item.action.kind === 'bookmark' || item.action.kind === 'workspace') {
			return this.adapter.listCatalog(item.shortLabel).some((entry) => entry.key === commandCenterActionKey(item.action));
		}
		return true;
	}
}
