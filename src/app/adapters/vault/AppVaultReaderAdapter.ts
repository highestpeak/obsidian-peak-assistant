import { TFile, TFolder } from 'obsidian';
import type { App, TAbstractFile } from 'obsidian';
import type { DocumentVaultReaderPort } from '@/core/ports/DocumentVaultReaderPort';
import type { VaultMetadataResolverPort } from '@/core/ports/VaultMetadataResolverPort';
import type { VaultFileRef, VaultFolderRef } from '@/core/ports/VaultFileRef';

/**
 * App-layer adapter: only place that holds Obsidian `App`, `TFile`, and
 * `TFolder`. Translates between live Obsidian objects and the neutral
 * plain-data `VaultFileRef` / `VaultFolderRef` shapes used in core.
 *
 * T11K: implementing both narrow ports on a single class is just an
 * implementation convenience; consumers depend on the interfaces, not
 * on this concrete class.
 */
export class AppVaultReaderAdapter
	implements DocumentVaultReaderPort, VaultMetadataResolverPort {
	constructor(private readonly app: App) {}

	// ── DocumentVaultReaderPort ────────────────────────────────────────

	getFile(path: string): VaultFileRef | null {
		const abs = this.app.vault.getAbstractFileByPath(path);
		if (!abs || !(abs instanceof TFile)) return null;
		return toFileRef(abs);
	}

	getFolder(path: string): VaultFolderRef | null {
		const abs = this.app.vault.getAbstractFileByPath(path);
		if (!abs || !(abs instanceof TFolder)) return null;
		return toFolderRef(abs);
	}

	listFiles(): VaultFileRef[] {
		return this.app.vault.getFiles().map(toFileRef);
	}

	listFolderChildren(folderPath: string): {
		files: VaultFileRef[];
		folders: VaultFolderRef[];
	} {
		const abs = this.app.vault.getAbstractFileByPath(folderPath);
		if (!abs || !(abs instanceof TFolder) || !abs.children) {
			return { files: [], folders: [] };
		}
		const files: VaultFileRef[] = [];
		const folders: VaultFolderRef[] = [];
		for (const child of abs.children as TAbstractFile[]) {
			if (child instanceof TFile) files.push(toFileRef(child));
			else if (child instanceof TFolder) folders.push(toFolderRef(child));
		}
		return { files, folders };
	}

	async readText(file: VaultFileRef): Promise<string> {
		const t = this.resolveTFile(file.path);
		return this.app.vault.cachedRead(t);
	}

	async readBinary(file: VaultFileRef): Promise<ArrayBuffer> {
		const t = this.resolveTFile(file.path);
		return this.app.vault.readBinary(t);
	}

	// ── VaultMetadataResolverPort ──────────────────────────────────────

	resolveLinkPath(linkText: string, sourcePath: string): string | null {
		const dest = this.app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
		return dest?.path ?? null;
	}

	// ── internals ──────────────────────────────────────────────────────

	private resolveTFile(path: string): TFile {
		const abs = this.app.vault.getAbstractFileByPath(path);
		if (!abs || !(abs instanceof TFile)) {
			throw new Error(`[AppVaultReaderAdapter] not a vault file: ${path}`);
		}
		return abs;
	}
}

function toFileRef(file: TFile): VaultFileRef {
	return {
		path: file.path,
		name: file.name,
		basename: file.basename,
		extension: file.extension,
		stat: {
			size: file.stat.size,
			mtime: file.stat.mtime,
			ctime: file.stat.ctime,
		},
	};
}

function toFolderRef(folder: TFolder): VaultFolderRef {
	return { path: folder.path, name: folder.name };
}
