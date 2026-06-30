// T11P (Track H): Obsidian implementation of `VaultStatsPort`.

import type { App } from 'obsidian';
import type { VaultStatsPort } from '@/core/ports/VaultStatsPort';

export class AppVaultStatsAdapter implements VaultStatsPort {
	constructor(private readonly app: App) {}

	markdownCount(): number {
		return this.app.vault.getMarkdownFiles().length;
	}

	activeFilePath(): string | null {
		return this.app.workspace.getActiveFile()?.path ?? null;
	}
}
