import type { App } from 'obsidian';
import { getPluginDir } from '@/core/utils/obsidian-utils';
import { ensureFolderRecursive } from '@/core/utils/vault-utils';

/**
 * Base class for file-based storage in Obsidian vault.
 * Supports both text and binary file operations.
 */
export abstract class VaultFileStore {
	protected readonly fullPath: string;

	constructor(
		protected readonly app: App,
		params: {
			pluginId?: string;
			filename: string;
			storageFolder?: string;
		},
	) {
		// Use user-configured storage folder if provided, otherwise fallback to plugin directory
		const baseDir = params.storageFolder?.trim() || getPluginDir(app, params.pluginId);
		this.fullPath = `${baseDir}/${params.filename}`;
	}

	/**
	 * Ensure the directory exists before saving.
	 */
	protected async ensureDirectory(): Promise<void> {
		const dirPath = this.fullPath.substring(0, this.fullPath.lastIndexOf('/'));
		if (dirPath) {
			await ensureFolderRecursive(this.app, dirPath);
		}
	}
}

