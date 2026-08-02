import type { App } from 'obsidian';
import type { GeneratedOutputDataAdapter } from '@/core/storage/generated-output';
import { ensureAdapterDirectory } from '@/app/composer/ObsidianComposerDataStore';

/** The only raw Vault adapter used by the generic generated-output stores. */
export class ObsidianGeneratedOutputDataAdapter implements GeneratedOutputDataAdapter {
	constructor(private readonly app: App) {}

	exists(path: string): Promise<boolean> {
		return this.app.vault.adapter.exists(path);
	}

	readText(path: string): Promise<string> {
		return this.app.vault.adapter.read(path);
	}

	writeText(path: string, content: string): Promise<void> {
		return this.app.vault.adapter.write(path, content);
	}

	appendText(path: string, content: string): Promise<void> {
		return this.app.vault.adapter.append(path, content);
	}

	async readBinary(path: string): Promise<Uint8Array> {
		return new Uint8Array(await this.app.vault.adapter.readBinary(path));
	}

	writeBinary(path: string, content: Uint8Array): Promise<void> {
		const bytes = new Uint8Array(content);
		return this.app.vault.adapter.writeBinary(path, bytes.buffer);
	}

	rename(fromPath: string, toPath: string): Promise<void> {
		return this.app.vault.adapter.rename(fromPath, toPath);
	}

	remove(path: string): Promise<void> {
		return this.app.vault.adapter.remove(path);
	}

	ensureDirectory(path: string): Promise<void> {
		return ensureAdapterDirectory(this.app, path);
	}
}
