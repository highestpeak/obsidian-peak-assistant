import { App, TAbstractFile } from 'obsidian';
import type { VaultEventPort, VaultEventRef, VaultEventTarget } from '@/core/ports/VaultEventPort';
import type { VaultFileRef, VaultFolderRef } from '@/core/ports/VaultFileRef';

/**
 * T11R Phase 2: Obsidian-backed adapter for {@link VaultEventPort}. Wraps
 * `app.vault.on('create' | 'modify' | 'delete' | 'rename')` so service code
 * never imports `EventRef` / `TAbstractFile` from obsidian.
 */
export class VaultEventAdapter implements VaultEventPort {
	constructor(private readonly app: App) {}

	private toTarget(af: TAbstractFile): VaultEventTarget {
		return af as unknown as VaultFileRef | VaultFolderRef;
	}

	onCreate(handler: (target: VaultEventTarget) => void): VaultEventRef {
		return this.app.vault.on('create', file => handler(this.toTarget(file)));
	}

	onModify(handler: (target: VaultEventTarget) => void): VaultEventRef {
		return this.app.vault.on('modify', file => handler(this.toTarget(file)));
	}

	onDelete(handler: (target: VaultEventTarget) => void): VaultEventRef {
		return this.app.vault.on('delete', file => handler(this.toTarget(file)));
	}

	onRename(handler: (target: VaultEventTarget, oldPath: string) => void): VaultEventRef {
		return this.app.vault.on('rename', (file, oldPath) => handler(this.toTarget(file), oldPath));
	}

	offref(ref: VaultEventRef): void {
		this.app.vault.offref(ref as Parameters<App['vault']['offref']>[0]);
	}
}
