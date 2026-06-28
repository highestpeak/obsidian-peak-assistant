import { App, TFile } from 'obsidian';
import type { CachedMetadataSnapshot, HostMetadataPort } from '@/core/ports/HostMetadataPort';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';

/**
 * T11R Phase 2: Obsidian-backed adapter for {@link HostMetadataPort}.
 * Wraps `app.metadataCache` so service code stays free of
 * `MetadataCache` / `CachedMetadata` imports.
 */
export class HostMetadataAdapter implements HostMetadataPort {
	constructor(private readonly app: App) {}

	getFileCache(file: VaultFileRef): CachedMetadataSnapshot | null {
		const tfile = this.app.vault.getAbstractFileByPath(file.path);
		if (!(tfile instanceof TFile)) return null;
		const cache = this.app.metadataCache.getFileCache(tfile);
		return cache as CachedMetadataSnapshot | null;
	}

	getResolvedLinks(): Record<string, Record<string, number>> {
		return this.app.metadataCache.resolvedLinks;
	}

	getFirstLinkpathDest(linkpath: string, sourcePath: string): VaultFileRef | null {
		const tfile = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		return tfile ? (tfile as unknown as VaultFileRef) : null;
	}
}
