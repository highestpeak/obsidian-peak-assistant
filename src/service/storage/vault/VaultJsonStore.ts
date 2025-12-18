import type { App } from 'obsidian';
import type { JsonStore } from '@/service/storage/types';
import { VaultFileStore } from './VaultFileStore';

/**
 * JSON file store backed by Obsidian's vault adapter.
 * Stores JSON data as compact formatted text files.
 */
export class VaultJsonStore extends VaultFileStore implements JsonStore {
	constructor(
		app: App,
		params: {
			pluginId?: string;
			filename: string;
			storageFolder?: string;
		},
	) {
		super(app, params);
	}

	async loadJson(): Promise<string | null> {
		try {
			const text = await this.app.vault.adapter.read(this.fullPath);
			return text;
		} catch {
			return null;
		}
	}

	async saveJson(jsonString: string): Promise<void> {
		await this.ensureDirectory();
		await this.app.vault.adapter.write(this.fullPath, jsonString);
	}
}

