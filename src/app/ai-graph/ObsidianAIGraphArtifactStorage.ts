import type { App } from 'obsidian';
import type { AIGraphArtifactStoragePort } from '@/service/ai-graph';
import { ensureAdapterDirectory, joinAdapterPath } from '@/app/composer/ObsidianComposerDataStore';

export class ObsidianAIGraphArtifactStorage implements AIGraphArtifactStoragePort {
	constructor(
		private readonly app: App,
		private readonly baseDir: string,
	) {}

	async listArtifactIds(): Promise<string[]> {
		if (!(await this.app.vault.adapter.exists(this.baseDir))) return [];
		const listing = await this.app.vault.adapter.list(this.baseDir);
		return listing.folders.map((path) => path.slice(path.lastIndexOf('/') + 1));
	}

	async listVersionIds(graphId: string): Promise<string[]> {
		const directory = this.versionsDir(graphId);
		if (!(await this.app.vault.adapter.exists(directory))) return [];
		const listing = await this.app.vault.adapter.list(directory);
		return listing.files
			.filter((path) => path.endsWith('.json'))
			.map((path) => path.slice(path.lastIndexOf('/') + 1, -5));
	}

	readManifest(graphId: string): Promise<string | null> {
		return this.readIfExists(this.manifestPath(graphId));
	}

	readVersion(graphId: string, versionId: string): Promise<string | null> {
		return this.readIfExists(this.versionPath(graphId, versionId));
	}

	readSources(graphId: string): Promise<string | null> {
		return this.readIfExists(this.sourcesPath(graphId));
	}

	async writeNewVersion(graphId: string, versionId: string, content: string): Promise<void> {
		const path = this.versionPath(graphId, versionId);
		await ensureAdapterDirectory(this.app, this.versionsDir(graphId));
		if (await this.app.vault.adapter.exists(path)) {
			throw new Error(`AI Graph version ${versionId} is immutable and already exists.`);
		}
		await this.app.vault.adapter.write(path, content);
	}

	writeManifestAtomic(graphId: string, content: string): Promise<void> {
		return this.replaceAtomic(this.manifestPath(graphId), content);
	}

	writeSourcesAtomic(graphId: string, content: string): Promise<void> {
		return this.replaceAtomic(this.sourcesPath(graphId), content);
	}

	private manifestPath(graphId: string): string {
		return joinAdapterPath(this.baseDir, graphId, 'manifest.json');
	}

	private sourcesPath(graphId: string): string {
		return joinAdapterPath(this.baseDir, graphId, 'sources.json');
	}

	private versionsDir(graphId: string): string {
		return joinAdapterPath(this.baseDir, graphId, 'versions');
	}

	private versionPath(graphId: string, versionId: string): string {
		return joinAdapterPath(this.versionsDir(graphId), `${versionId}.json`);
	}

	private async readIfExists(path: string): Promise<string | null> {
		if (!(await this.app.vault.adapter.exists(path))) return null;
		return this.app.vault.adapter.read(path);
	}

	/**
	 * Replace a small mutable pointer document through verified temp + backup
	 * rename. Recovery prefers the previous file if the final rename fails.
	 */
	private async replaceAtomic(path: string, content: string): Promise<void> {
		const directory = path.slice(0, path.lastIndexOf('/'));
		await ensureAdapterDirectory(this.app, directory);
		const nonce = crypto.randomUUID();
		const tempPath = `${path}.${nonce}.tmp`;
		const backupPath = `${path}.${nonce}.bak`;
		await this.app.vault.adapter.write(tempPath, content);
		if (await this.app.vault.adapter.read(tempPath) !== content) {
			throw new Error(`AI Graph atomic write verification failed: ${path}`);
		}
		const hadPrevious = await this.app.vault.adapter.exists(path);
		if (hadPrevious) await this.app.vault.adapter.rename(path, backupPath);
		try {
			await this.app.vault.adapter.rename(tempPath, path);
			if (hadPrevious && await this.app.vault.adapter.exists(backupPath)) {
				await this.app.vault.adapter.remove(backupPath);
			}
		} catch (error) {
			if (await this.app.vault.adapter.exists(tempPath)) {
				await this.app.vault.adapter.remove(tempPath);
			}
			if (hadPrevious && await this.app.vault.adapter.exists(backupPath)) {
				await this.app.vault.adapter.rename(backupPath, path);
			}
			throw error;
		}
	}
}
