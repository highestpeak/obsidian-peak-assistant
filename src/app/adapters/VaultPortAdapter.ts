import { App, TFile, TFolder, TAbstractFile } from 'obsidian';
import type { VaultFileRef, VaultFolderRef } from '@/core/ports/VaultFileRef';
import type { VaultWriterPort } from '@/core/ports/VaultWriterPort';
import type { VaultLookupPort } from '@/core/ports/VaultLookupPort';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';

/**
 * T11R Phase 2: Obsidian-backed adapter implementing all three vault
 * read/write/lookup ports. One adapter, three port faces — service code
 * receives only the narrow port it needs.
 */
export class VaultPortAdapter implements VaultWriterPort, VaultLookupPort, DocumentVaultReaderPort {
	constructor(private readonly app: App) {}

	private resolveFile(target: VaultFileRef | string): TFile | null {
		const path = typeof target === 'string' ? target : target.path;
		const af = this.app.vault.getAbstractFileByPath(path);
		return af instanceof TFile ? af : null;
	}

	private resolveAny(target: VaultFileRef | VaultFolderRef | string): TAbstractFile | null {
		const path = typeof target === 'string' ? target : target.path;
		return this.app.vault.getAbstractFileByPath(path);
	}

	// ── VaultWriterPort ────────────────────────────────────────────────

	async read(target: VaultFileRef | string): Promise<string> {
		const file = this.resolveFile(target);
		if (!file) throw new Error(`VaultPort.read: file not found: ${typeof target === 'string' ? target : target.path}`);
		return this.app.vault.read(file);
	}

	async cachedRead(target: VaultFileRef | string): Promise<string> {
		const file = this.resolveFile(target);
		if (!file) throw new Error(`VaultPort.cachedRead: file not found: ${typeof target === 'string' ? target : target.path}`);
		return this.app.vault.cachedRead(file);
	}

	async readBinary(target: VaultFileRef | string): Promise<ArrayBuffer> {
		const file = this.resolveFile(target);
		if (!file) throw new Error(`VaultPort.readBinary: file not found: ${typeof target === 'string' ? target : target.path}`);
		return this.app.vault.readBinary(file);
	}

	async modify(target: VaultFileRef | string, content: string): Promise<void> {
		const file = this.resolveFile(target);
		if (!file) throw new Error(`VaultPort.modify: file not found: ${typeof target === 'string' ? target : target.path}`);
		await this.app.vault.modify(file, content);
	}

	async create(path: string, content: string): Promise<VaultFileRef> {
		const file = await this.app.vault.create(path, content);
		return file as unknown as VaultFileRef;
	}

	async createBinary(path: string, data: ArrayBuffer): Promise<VaultFileRef> {
		const file = await this.app.vault.createBinary(path, data);
		return file as unknown as VaultFileRef;
	}

	async createFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;
		await this.app.vault.createFolder(path);
	}

	async ensureFolder(path: string): Promise<void> {
		const parts = path.split('/').filter(p => p.length > 0);
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (existing instanceof TFolder) continue;
			if (!existing) {
				try {
					await this.app.vault.createFolder(current);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					if (!msg.includes('already exist')) throw err;
				}
			}
		}
	}

	async trash(target: VaultFileRef | VaultFolderRef | string, systemTrash: boolean): Promise<void> {
		const af = this.resolveAny(target);
		if (!af) return;
		await this.app.vault.trash(af, systemTrash);
	}

	async rename(target: VaultFileRef | VaultFolderRef | string, newPath: string): Promise<void> {
		const af = this.resolveAny(target);
		if (!af) throw new Error(`VaultPort.rename: source not found: ${typeof target === 'string' ? target : target.path}`);
		await this.app.vault.rename(af, newPath);
	}

	// ── VaultLookupPort ────────────────────────────────────────────────

	getFile(path: string): VaultFileRef | null {
		const af = this.app.vault.getAbstractFileByPath(path);
		return af instanceof TFile ? (af as unknown as VaultFileRef) : null;
	}

	getFolder(path: string): VaultFolderRef | null {
		const af = this.app.vault.getAbstractFileByPath(path);
		return af instanceof TFolder ? (af as unknown as VaultFolderRef) : null;
	}

	exists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) != null;
	}

	// ── DocumentVaultReaderPort ────────────────────────────────────────

	listFiles(): VaultFileRef[] {
		return this.app.vault.getFiles() as unknown as VaultFileRef[];
	}

	listFolderChildren(folderPath: string): { files: VaultFileRef[]; folders: VaultFolderRef[] } {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			return { files: [], folders: [] };
		}
		const files: VaultFileRef[] = [];
		const folders: VaultFolderRef[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile) files.push(child as unknown as VaultFileRef);
			else if (child instanceof TFolder) folders.push(child as unknown as VaultFolderRef);
		}
		return { files, folders };
	}

	async readText(file: VaultFileRef): Promise<string> {
		return this.cachedRead(file);
	}
}
