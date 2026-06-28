import { App } from 'obsidian';
import type { FileOpenEventRef, WorkspaceObserverPort } from '@/core/ports/WorkspaceObserverPort';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';

/**
 * T11R Phase 2: Obsidian-backed adapter for {@link WorkspaceObserverPort}.
 * Replaces direct `app.workspace.*` access from service modules.
 */
export class WorkspaceObserverAdapter implements WorkspaceObserverPort {
	constructor(private readonly app: App) {}

	getActiveFile(): VaultFileRef | null {
		const f = this.app.workspace.getActiveFile();
		return f ? (f as unknown as VaultFileRef) : null;
	}

	getVaultName(): string {
		return this.app.vault.getName();
	}

	getLastOpenFilePaths(): string[] {
		const fn = (this.app.workspace as unknown as { getLastOpenFiles?: () => string[] }).getLastOpenFiles;
		return typeof fn === 'function' ? fn.call(this.app.workspace) : [];
	}

	onFileOpen(handler: (file: VaultFileRef | null) => void): FileOpenEventRef {
		return this.app.workspace.on('file-open', file => {
			handler(file ? (file as unknown as VaultFileRef) : null);
		});
	}

	offFileOpen(ref: FileOpenEventRef): void {
		this.app.workspace.offref(ref as Parameters<typeof this.app.workspace.offref>[0]);
	}
}
