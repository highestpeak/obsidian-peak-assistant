import type { App, TFile } from 'obsidian';
import type {
	PluginCommandDescriptor,
	PluginCommandExecutionObservation,
	PluginCommandPreflight,
	PluginCommandWorkspaceSnapshot,
} from '@/core/types/plugin-command-gateway';
import type {
	PluginCommandExecuteOptions,
	PluginCommandPort,
} from '@/core/ports/PluginCommandPort';
import { hashSHA256 } from '@/core/utils/hash-utils';

interface RawObsidianCommand {
	id: string;
	name?: string;
	callback?: () => unknown;
	checkCallback?: (checking: boolean) => boolean | void;
	editorCallback?: (editor: unknown, context: unknown) => unknown;
	editorCheckCallback?: (
		checking: boolean,
		editor: unknown,
		context: unknown,
	) => boolean | void;
}

interface RawPluginRecord {
	manifest?: {
		id?: string;
		name?: string;
		version?: string;
	};
}

interface ObsidianCommandHost {
	commands: {
		commands: Record<string, RawObsidianCommand>;
		executeCommandById(commandId: string): boolean;
	};
	plugins: {
		plugins: Record<string, RawPluginRecord>;
		enabledPlugins: Set<string>;
	};
}

/**
 * The only production adapter allowed to inspect Obsidian's private command
 * registry. It exposes enabled third-party plugin commands as plain data.
 */
export class ObsidianPluginCommandPort implements PluginCommandPort {
	constructor(
		private readonly app: App,
		private readonly peakPluginId: string,
	) {}

	async discover(): Promise<readonly PluginCommandDescriptor[]> {
		const host = this.host();
		const enabled = [...host.plugins.enabledPlugins]
			.filter((pluginId) => pluginId !== this.peakPluginId)
			.sort((a, b) => b.length - a.length);
		const descriptors: PluginCommandDescriptor[] = [];

		for (const [registryId, command] of Object.entries(host.commands.commands)) {
			const commandId = registryId.includes(':') ? registryId : command.id;
			const pluginId = enabled.find((candidate) => commandId.startsWith(`${candidate}:`));
			if (!pluginId) continue;
			const plugin = host.plugins.plugins[pluginId];
			const manifest = plugin?.manifest;
			const commandName = command.name?.trim() || commandId;
			const pluginName = manifest?.name?.trim() || pluginId;
			const pluginVersion = manifest?.version?.trim() || 'unknown';
			const preflight = this.check(command);
			const callbackShape = [
				command.callback ? 'callback' : '',
				command.checkCallback ? 'check' : '',
				command.editorCallback ? 'editor' : '',
				command.editorCheckCallback ? 'editor-check' : '',
			].filter(Boolean).join('+') || 'none';
			const sourceHash = hashSHA256([
				commandId,
				commandName,
				pluginId,
				pluginName,
				pluginVersion,
				callbackShape,
			].join('\u0000'));
			descriptors.push({
				commandId,
				commandName,
				pluginId,
				pluginName,
				pluginVersion,
				sourceHash,
				availability: preflight.availability,
				interaction: 'unknown',
				...(preflight.reason ? { availabilityReason: preflight.reason } : {}),
			});
		}

		return descriptors.sort((a, b) =>
			a.pluginName.localeCompare(b.pluginName) ||
			a.commandName.localeCompare(b.commandName),
		);
	}

	async preflight(commandId: string): Promise<PluginCommandPreflight> {
		const command = this.host().commands.commands[commandId];
		if (!command) {
			return {
				commandId,
				availability: 'unavailable',
				reason: 'command-not-found',
			};
		}
		return {
			commandId,
			...this.check(command),
		};
	}

	async execute(
		commandId: string,
		options: PluginCommandExecuteOptions,
	): Promise<PluginCommandExecutionObservation> {
		const preflight = await this.preflight(commandId);
		if (preflight.availability !== 'available') {
			throw new Error(preflight.reason ?? `command-unavailable:${commandId}`);
		}

		const before = this.snapshot();
		const invoked = this.host().commands.executeCommandById(commandId);
		if (!invoked) throw new Error(`command-refused:${commandId}`);
		await delay(options.settleDelayMs);
		const after = this.snapshot();
		return observe(before, after, options.maxChangedPaths);
	}

	private check(
		command: RawObsidianCommand,
	): Pick<PluginCommandPreflight, 'availability' | 'reason'> {
		const activeEditor = this.app.workspace.activeEditor;
		if (command.editorCheckCallback) {
			if (!activeEditor?.editor) {
				return { availability: 'unavailable', reason: 'active-editor-required' };
			}
			try {
				const result = command.editorCheckCallback(
					true,
					activeEditor.editor,
					activeEditor,
				);
				if (result === false) {
					return { availability: 'unavailable', reason: 'editor-check-callback-false' };
				}
				return { availability: 'available' };
			} catch (error) {
				return {
					availability: 'unavailable',
					reason: `editor-check-callback-error:${toErrorMessage(error)}`,
				};
			}
		}
		if (command.editorCallback) {
			return activeEditor?.editor
				? { availability: 'available' }
				: { availability: 'unavailable', reason: 'active-editor-required' };
		}
		if (command.checkCallback) {
			try {
				const result = command.checkCallback(true);
				if (result === false) {
					return { availability: 'unavailable', reason: 'check-callback-false' };
				}
				return { availability: 'available' };
			} catch (error) {
				return {
					availability: 'unavailable',
					reason: `check-callback-error:${toErrorMessage(error)}`,
				};
			}
		}
		if (command.callback) return { availability: 'available' };
		return { availability: 'unknown', reason: 'no-callable-handler' };
	}

	private snapshot(): PluginCommandWorkspaceSnapshot {
		const activeFile = this.app.workspace.getActiveFile();
		const files: Record<string, { mtime: number; size: number }> = {};
		for (const file of this.app.vault.getFiles() as TFile[]) {
			files[file.path] = {
				mtime: file.stat.mtime,
				size: file.stat.size,
			};
		}
		const ownerDocument =
			(this.app.workspace as unknown as { containerEl?: HTMLElement }).containerEl?.ownerDocument;
		const activeLeaf = (this.app.workspace as unknown as {
			activeLeaf?: { view?: { getViewType?: () => string } };
		}).activeLeaf;
		return {
			activeFilePath: activeFile?.path ?? null,
			activeLeafType: activeLeaf?.view?.getViewType?.() ?? null,
			openModalCount: ownerDocument?.querySelectorAll('.modal-container').length ?? 0,
			vaultFileCount: Object.keys(files).length,
			files,
		};
	}

	private host(): ObsidianCommandHost {
		return this.app as unknown as ObsidianCommandHost;
	}
}

function observe(
	before: PluginCommandWorkspaceSnapshot,
	after: PluginCommandWorkspaceSnapshot,
	maxChangedPaths: number,
): PluginCommandExecutionObservation {
	const changedPaths: string[] = [];
	let changedPathCount = 0;
	const allPaths = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
	for (const path of [...allPaths].sort()) {
		const previous = before.files[path];
		const current = after.files[path];
		if (previous?.mtime === current?.mtime && previous?.size === current?.size) continue;
		changedPathCount += 1;
		if (changedPaths.length < maxChangedPaths) changedPaths.push(path);
	}
	const changedPathsTruncated = changedPathCount > changedPaths.length;
	const activeFileChanged = before.activeFilePath !== after.activeFilePath;
	const activeLeafChanged = before.activeLeafType !== after.activeLeafType;
	const modalCountDelta = after.openModalCount - before.openModalCount;
	const vaultFileCountDelta = after.vaultFileCount - before.vaultFileCount;
	const observableChange =
		changedPathCount > 0 ||
		activeFileChanged ||
		activeLeafChanged ||
		modalCountDelta !== 0 ||
		vaultFileCountDelta !== 0;
	const signals = [
		activeFileChanged ? 'active-file' : '',
		activeLeafChanged ? 'active-leaf' : '',
		modalCountDelta !== 0 ? `modal:${modalCountDelta}` : '',
		vaultFileCountDelta !== 0 ? `vault-files:${vaultFileCountDelta}` : '',
		changedPathCount > 0
			? `changed-paths:${changedPathCount}${changedPathsTruncated ? ` (showing ${changedPaths.length})` : ''}`
			: '',
	].filter(Boolean);
	return {
		invoked: true,
		before,
		after,
		changedPaths,
		changedPathCount,
		changedPathsTruncated,
		activeFileChanged,
		activeLeafChanged,
		modalCountDelta,
		vaultFileCountDelta,
		observableChange,
		summary: signals.length > 0 ? signals.join(', ') : 'no-observable-change',
	};
}

function delay(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
