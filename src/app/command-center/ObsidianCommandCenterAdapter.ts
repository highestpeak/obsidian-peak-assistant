import { Notice, TFile, type App, type Command } from 'obsidian';
import type MyPlugin from 'main';
import {
	COMMAND_CENTER_CATALOG_DEFAULTS,
	commandCenterActionKey,
	type CommandCenterAction,
	type CommandCenterCatalogEntry,
	type CommandCenterCatalogScope,
	type CommandCenterItemIcon,
	type CommandCenterRecentTarget,
} from '@/core/command-center';
import {
	AI_CONTROL_CENTER_VIEW_TYPE,
	COMMAND_CENTER_HOME_VIEW_TYPE,
	MY_CONTENT_VIEW_TYPE,
	USAGE_DASHBOARD_VIEW_TYPE,
} from '@/app/ui-host/views/types';
import type { SearchClient } from '@/service/search/SearchClient';

export { COMMAND_CENTER_HOME_VIEW_TYPE };

interface ObsidianCommandRecord extends Command {
	id: string;
	name: string;
}

interface BookmarkRecord {
	id?: string;
	title?: string;
	type?: string;
	path?: string;
	items?: BookmarkRecord[];
}

const VIEW_CATALOG: ReadonlyArray<{
	viewType: string;
	label: string;
	aliases: readonly string[];
	icon: CommandCenterItemIcon;
}> = [
	{ viewType: COMMAND_CENTER_HOME_VIEW_TYPE, label: 'Peak Home', aliases: ['Home', 'Command Center Home'], icon: { kind: 'lucide', name: 'house' } },
	{ viewType: USAGE_DASHBOARD_VIEW_TYPE, label: 'Token Usage', aliases: ['Usage Dashboard', 'Tokens'], icon: { kind: 'lucide', name: 'chart-no-axes-column' } },
	{ viewType: AI_CONTROL_CENTER_VIEW_TYPE, label: 'AI Control Center', aliases: ['AI settings'], icon: { kind: 'lucide', name: 'sparkles' } },
	{ viewType: MY_CONTENT_VIEW_TYPE, label: 'My Content', aliases: ['Generated content'], icon: { kind: 'lucide', name: 'folder-heart' } },
];

function sourceFromCommandId(commandId: string, pluginId: string): string {
	if (commandId.startsWith(`${pluginId}:`)) return 'Peak Assistant';
	const source = commandId.split(':')[0] ?? 'Obsidian';
	if (source === 'app' || source === 'editor' || source === 'workspace') return 'Obsidian';
	return source
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part[0]!.toUpperCase() + part.slice(1))
		.join(' ');
}

function formatHotkey(modifiers: string[], key: string): string {
	const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
	const symbols: Record<string, string> = mac
		? { Mod: '⌘', Meta: '⌘', Ctrl: '⌃', Control: '⌃', Alt: '⌥', Shift: '⇧' }
		: { Mod: 'Ctrl', Meta: 'Ctrl', Ctrl: 'Ctrl', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
	const parts = modifiers.filter(Boolean).map((modifier) => symbols[modifier] ?? modifier);
	parts.push(key.length === 1 ? key.toUpperCase() : key);
	return mac ? parts.join('') : parts.join('+');
}

function flattenBookmarks(records: BookmarkRecord[], output: BookmarkRecord[]): void {
	for (const record of records) {
		if (record.type === 'file' && record.path) output.push(record);
		if (Array.isArray(record.items)) flattenBookmarks(record.items, output);
	}
}

export class ObsidianCommandCenterAdapter {
	constructor(
		private readonly app: App,
		private readonly plugin: MyPlugin,
		private readonly resolveSearchClient: () => SearchClient | null,
	) {}

	toRuntimeCommandId(action: CommandCenterAction): string | null {
		if (action.kind === 'peak-command') return `${this.plugin.manifest.id}:${action.commandId}`;
		if (action.kind === 'obsidian-command') return action.commandId;
		return null;
	}

	resolveHotkey(action: CommandCenterAction): string | null {
		const commandId = this.toRuntimeCommandId(action);
		if (!commandId) return null;
		try {
			const manager = (this.app as App & { hotkeyManager?: any }).hotkeyManager;
			const hotkeys = manager?.getHotkeys?.(commandId) ?? manager?.getDefaultHotkeys?.(commandId);
			const first = Array.isArray(hotkeys) ? hotkeys[0] : null;
			if (!first?.key) return null;
			const modifiers = Array.isArray(first.modifiers)
				? first.modifiers
				: String(first.modifiers ?? '').split(',');
			return formatHotkey(modifiers, String(first.key));
		} catch {
			return null;
		}
	}

	getCommand(action: CommandCenterAction): ObsidianCommandRecord | null {
		const commandId = this.toRuntimeCommandId(action);
		if (!commandId) return null;
		return this.commandMap().get(commandId) ?? null;
	}

	commandAvailable(action: CommandCenterAction): boolean {
		return this.getCommand(action) !== null;
	}

	destinationAvailable(action: CommandCenterAction): boolean {
		if (action.kind === 'vault-target') {
			return this.app.vault.getAbstractFileByPath(action.path) instanceof TFile;
		}
		if (action.kind === 'bookmark') {
			if (action.path) return this.app.vault.getAbstractFileByPath(action.path) instanceof TFile;
			const plugin = (this.app as App & { internalPlugins?: any }).internalPlugins?.getPluginById?.('bookmarks');
			const roots = plugin?.instance?.items;
			if (!Array.isArray(roots)) return false;
			const records: BookmarkRecord[] = [];
			flattenBookmarks(roots, records);
			return records.some((record) => (record.id || record.path) === action.bookmarkId);
		}
		if (action.kind === 'workspace') {
			const plugin = (this.app as App & { internalPlugins?: any }).internalPlugins?.getPluginById?.('workspaces');
			return Boolean(plugin?.instance?.workspaces?.[action.workspaceName]);
		}
		if (action.kind === 'view') return true;
		return this.commandAvailable(action);
	}

	async listCatalog(
		query = '',
		scope: CommandCenterCatalogScope | 'all' = 'all',
	): Promise<CommandCenterCatalogEntry[]> {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		const entries: CommandCenterCatalogEntry[] = [];
		if (scope === 'all' || scope === 'commands') {
			for (const command of this.commandMap().values()) {
				const peakPrefix = `${this.plugin.manifest.id}:`;
				const isPeak = command.id.startsWith(peakPrefix);
				const action: CommandCenterAction = isPeak
					? { kind: 'peak-command', commandId: command.id.slice(peakPrefix.length) }
					: { kind: 'obsidian-command', commandId: command.id, pluginId: command.id.split(':')[0] };
				const sourceLabel = sourceFromCommandId(command.id, this.plugin.manifest.id);
				if (!this.matches(normalizedQuery, command.name, sourceLabel, command.id)) continue;
				entries.push({
					key: commandCenterActionKey(action),
					action,
					label: command.name,
					sourceLabel,
					layer: 'command',
					available: true,
					hotkey: this.resolveHotkey(action),
				});
			}
		}

		if (scope === 'all' || scope === 'workspaces-views') {
			for (const view of VIEW_CATALOG) {
				const action: CommandCenterAction = { kind: 'view', viewType: view.viewType };
				if (!this.matches(normalizedQuery, view.label, 'Peak view', view.viewType, ...view.aliases)) continue;
				entries.push({
					key: commandCenterActionKey(action),
					action,
					label: view.label,
					sourceLabel: 'Peak view',
					icon: view.icon,
					layer: 'destination',
					available: true,
					hotkey: null,
				});
			}
			this.appendWorkspaceEntries(entries, normalizedQuery);
		}

		if (scope === 'all' || scope === 'bookmarks') {
			this.appendBookmarkEntries(entries, normalizedQuery);
		}
		if (scope === 'all' || scope === 'documents') {
			await this.appendDocumentEntries(entries, normalizedQuery);
		}
		if (scope === 'documents') return entries;
		return entries.sort((a, b) => {
			if (a.layer !== b.layer) return a.layer === 'destination' ? -1 : 1;
			return a.label.localeCompare(b.label);
		});
	}

	getRecentTargets(): CommandCenterRecentTarget[] {
		const workspace = this.app.workspace as typeof this.app.workspace & { getLastOpenFiles?: () => string[] };
		const paths = workspace.getLastOpenFiles?.() ?? [];
		return paths
			.map((path) => this.app.vault.getAbstractFileByPath(path))
			.filter((file): file is TFile => file instanceof TFile)
			.slice(0, 8)
			.map((file) => ({
				path: file.path,
				label: file.basename,
				parentPath: file.parent?.path === '/' ? '' : file.parent?.path ?? '',
			}));
	}

	async execute(action: CommandCenterAction): Promise<boolean> {
		switch (action.kind) {
			case 'obsidian-command':
				return this.executeObsidianCommand(action.commandId);
			case 'vault-target':
				return this.openVaultTarget(action.path, action.subpath);
			case 'bookmark':
				return action.path ? this.openVaultTarget(action.path) : this.openBookmark(action.bookmarkId);
			case 'workspace':
				return this.loadWorkspace(action.workspaceName);
			case 'view':
				return this.openView(action.viewType);
			case 'peak-command':
				return false;
		}
	}

	openNativeCommandPalette(): void {
		void this.executeObsidianCommand('command-palette:open');
	}

	private commandMap(): Map<string, ObsidianCommandRecord> {
		const commands = (this.app as App & {
			commands?: { commands?: Record<string, ObsidianCommandRecord> };
		}).commands?.commands ?? {};
		return new Map(Object.entries(commands));
	}

	private matches(query: string, ...fields: string[]): boolean {
		if (!query) return true;
		return fields.some((field) => field.toLocaleLowerCase().includes(query));
	}

	private async appendDocumentEntries(entries: CommandCenterCatalogEntry[], query: string): Promise<void> {
		const searchClient = this.resolveSearchClient();
		if (!query) {
			if (searchClient) {
				try {
					const recent = await searchClient.getRecent(20);
					this.appendSearchResultEntries(entries, recent.map((item) => ({ path: item.path, title: item.title })));
				} catch (error) {
					console.warn('[Peak Command Center] Recent document search unavailable; using workspace recents.', error);
				}
			}
			if (entries.length === 0) this.appendWorkspaceRecentEntries(entries);
			return;
		}

		if (searchClient) {
			try {
				const response = await searchClient.search({
					text: query,
					scopeMode: 'all',
					topK: COMMAND_CENTER_CATALOG_DEFAULTS.maximumDocumentResults,
					searchMode: 'fulltext',
					enablePPR: false,
				});
				this.appendSearchResultEntries(entries, response.items.map((item) => ({ path: item.path, title: item.title })));
			} catch (error) {
				console.warn('[Peak Command Center] Indexed document search unavailable; using filename fallback.', error);
			}
		}
		if (entries.length === 0) this.appendVaultEntries(entries, query);
	}

	private appendSearchResultEntries(
		entries: CommandCenterCatalogEntry[],
		results: Array<{ path: string; title: string }>,
	): void {
		const seen = new Set(entries.map((entry) => entry.action.kind === 'vault-target' ? entry.action.path : ''));
		for (const result of results) {
			if (seen.has(result.path)) continue;
			const file = this.app.vault.getAbstractFileByPath(result.path);
			if (!(file instanceof TFile)) continue;
			if (!COMMAND_CENTER_CATALOG_DEFAULTS.documentExtensions.has(file.extension.toLocaleLowerCase())) continue;
			this.appendFileEntry(entries, file, result.title || file.basename);
			seen.add(file.path);
			if (entries.length >= COMMAND_CENTER_CATALOG_DEFAULTS.maximumDocumentResults) return;
		}
	}

	private appendWorkspaceRecentEntries(entries: CommandCenterCatalogEntry[]): void {
		for (const target of this.getRecentTargets()) {
			const file = this.app.vault.getAbstractFileByPath(target.path);
			if (!(file instanceof TFile)) continue;
			this.appendFileEntry(entries, file, target.label);
		}
	}

	private appendFileEntry(entries: CommandCenterCatalogEntry[], file: TFile, label = file.basename): void {
		const action: CommandCenterAction = { kind: 'vault-target', path: file.path };
		entries.push({
			key: commandCenterActionKey(action),
			action,
			label,
			sourceLabel: file.parent?.path || 'Vault',
			icon: { kind: 'lucide', name: file.extension === 'canvas' ? 'layout-dashboard' : 'file-text' },
			layer: 'destination',
			available: true,
			hotkey: null,
		});
	}

	private appendVaultEntries(entries: CommandCenterCatalogEntry[], query: string): void {
		const matches = this.app.vault.getFiles()
			.filter((file) => COMMAND_CENTER_CATALOG_DEFAULTS.documentExtensions.has(file.extension.toLocaleLowerCase()))
			.filter((file) => this.matches(query, file.basename, file.path))
			.map((file) => {
				const basename = file.basename.toLocaleLowerCase();
				const path = file.path.toLocaleLowerCase();
				const score = basename === query ? 0 : basename.startsWith(query) ? 1 : basename.includes(query) ? 2 : path.includes(query) ? 3 : 4;
				return { file, score };
			})
			.sort((a, b) => a.score - b.score || a.file.basename.localeCompare(b.file.basename) || a.file.path.localeCompare(b.file.path))
			.slice(0, COMMAND_CENTER_CATALOG_DEFAULTS.maximumDocumentResults);
		for (const { file } of matches) {
			this.appendFileEntry(entries, file);
		}
	}

	private appendBookmarkEntries(entries: CommandCenterCatalogEntry[], query: string): void {
		const plugin = (this.app as App & { internalPlugins?: any }).internalPlugins?.getPluginById?.('bookmarks');
		const roots = plugin?.instance?.items;
		if (!Array.isArray(roots)) return;
		const records: BookmarkRecord[] = [];
		flattenBookmarks(roots, records);
		for (const bookmark of records) {
			const path = bookmark.path!;
			const label = bookmark.title || path.split('/').pop() || path;
			if (!this.matches(query, label, path, 'bookmark')) continue;
			const action: CommandCenterAction = {
				kind: 'bookmark',
				bookmarkId: bookmark.id || path,
				path,
			};
			entries.push({
				key: commandCenterActionKey(action),
				action,
				label,
				sourceLabel: 'Bookmark',
				icon: { kind: 'lucide', name: 'bookmark' },
				layer: 'destination',
				available: true,
				hotkey: null,
			});
		}
	}

	private appendWorkspaceEntries(entries: CommandCenterCatalogEntry[], query: string): void {
		const plugin = (this.app as App & { internalPlugins?: any }).internalPlugins?.getPluginById?.('workspaces');
		const workspaces = plugin?.instance?.workspaces;
		if (!workspaces || typeof workspaces !== 'object') return;
		for (const workspaceName of Object.keys(workspaces)) {
			if (!this.matches(query, workspaceName, 'workspace')) continue;
			const action: CommandCenterAction = { kind: 'workspace', workspaceName };
			entries.push({
				key: commandCenterActionKey(action),
				action,
				label: workspaceName,
				sourceLabel: 'Workspace',
				icon: { kind: 'lucide', name: 'panels-top-left' },
				layer: 'destination',
				available: true,
				hotkey: null,
			});
		}
	}

	private async executeObsidianCommand(commandId: string): Promise<boolean> {
		const commands = (this.app as App & { commands?: any }).commands;
		if (!commands?.commands?.[commandId]) {
			new Notice(`Command is no longer available: ${commandId}`, 5000);
			return false;
		}
		await commands.executeCommandById(commandId);
		return true;
	}

	private async openVaultTarget(path: string, subpath?: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`File is no longer available: ${path}`, 5000);
			return false;
		}
		if (subpath) {
			await this.app.workspace.openLinkText(`${path}#${subpath}`, '', false);
			return true;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
		return true;
	}

	private async openBookmark(bookmarkId: string): Promise<boolean> {
		const catalog = await this.listCatalog(bookmarkId, 'bookmarks');
		const entry = catalog.find((candidate) =>
			candidate.action.kind === 'bookmark' && candidate.action.bookmarkId === bookmarkId,
		);
		if (entry?.action.kind !== 'bookmark' || !entry.action.path) {
			new Notice(`Bookmark is no longer available: ${bookmarkId}`, 5000);
			return false;
		}
		return this.openVaultTarget(entry.action.path);
	}

	private async loadWorkspace(workspaceName: string): Promise<boolean> {
		const plugin = (this.app as App & { internalPlugins?: any }).internalPlugins?.getPluginById?.('workspaces');
		const instance = plugin?.instance;
		if (!instance?.workspaces?.[workspaceName] || typeof instance.loadWorkspace !== 'function') {
			new Notice(`Workspace is no longer available: ${workspaceName}`, 5000);
			return false;
		}
		await instance.loadWorkspace(workspaceName);
		return true;
	}

	private async openView(viewType: string): Promise<boolean> {
		try {
			const existing = this.app.workspace.getLeavesOfType(viewType)[0];
			if (existing) {
				this.app.workspace.revealLeaf(existing);
				return true;
			}
			const leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({ type: viewType, active: true });
			this.app.workspace.revealLeaf(leaf);
			return true;
		} catch (error) {
			console.warn(`[Command Center] Failed to open view '${viewType}'.`, error);
			new Notice(`View is not available: ${viewType}`, 5000);
			return false;
		}
	}
}
