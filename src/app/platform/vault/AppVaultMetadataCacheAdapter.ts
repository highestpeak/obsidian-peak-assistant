// T11Y-7b: app adapter for {@link VaultMetadataCachePort}. Wraps
// Obsidian's `metadataCache.getFileCache` / `metadataCache.resolvedLinks`
// returns and exposes them as plain-data snapshots.
//
// Only place that imports Obsidian `App` for these reads.

import type { App, TFile } from 'obsidian';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import type {
	VaultFileCacheSnapshot,
	VaultMetadataCachePort,
} from '@/core/ports/VaultMetadataCachePort';

export class AppVaultMetadataCacheAdapter implements VaultMetadataCachePort {
	constructor(private readonly app: App) {}

	getFileCache(file: VaultFileRef): VaultFileCacheSnapshot | null {
		const abs = this.app.vault.getAbstractFileByPath(file.path);
		if (!abs) return null;
		// The metadataCache.getFileCache signature wants a TFile; the
		// helper is defensive — we re-cast via the runtime check that
		// `getAbstractFileByPath` already implies.
		const cache = this.app.metadataCache.getFileCache(abs as TFile);
		if (!cache) return null;
		// Pass through references; consumers only read these fields and
		// the returned object is treated as immutable.
		return {
			links: cache.links as any,
			embeds: cache.embeds as any,
			tags: cache.tags as any,
			frontmatter: cache.frontmatter as any,
		};
	}

	getResolvedLinks(): Record<string, Record<string, number>> {
		return this.app.metadataCache.resolvedLinks;
	}
}
