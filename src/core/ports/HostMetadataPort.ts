import type { VaultFileRef } from './VaultFileRef';

/**
 * T11R: Narrow, structural shape of Obsidian's cached metadata used by
 * service-tier code (ContextProvider, SessionContextService,
 * vaultMcpServer). Mirrors the subset of fields actually consumed —
 * Obsidian's real `CachedMetadata` is structurally assignable to this.
 */
export interface CachedMetadataSnapshot {
	frontmatter?: { tags?: string[] | string; type?: string; category?: string; [k: string]: unknown };
	headings?: Array<{ level: number; heading: string }>;
	links?: Array<{ link: string }>;
	embeds?: Array<{ link: string }>;
	tags?: Array<{ tag: string }>;
}

/**
 * Narrow read port for Obsidian's metadata cache. Service code does not
 * import `MetadataCache` from `obsidian`; instead it consumes this port,
 * and the app composes a `metadataCache`-backed adapter at boot.
 */
export interface HostMetadataPort {
	/** Cached metadata for a file, or null if the cache has no entry. */
	getFileCache(file: VaultFileRef): CachedMetadataSnapshot | null;

	/** Adjacency map: `links[from][to] = count`. Same shape as Obsidian's `metadataCache.resolvedLinks`. */
	getResolvedLinks(): Record<string, Record<string, number>>;

	/** Resolve a wikilink target relative to a source path, returning a ref or null. */
	getFirstLinkpathDest(linkpath: string, sourcePath: string): VaultFileRef | null;
}
