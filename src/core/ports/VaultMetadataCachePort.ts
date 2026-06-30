// T11Y-7b: narrow port for the Obsidian metadata-cache reads that are
// not covered by {@link DocumentVaultReaderPort} or
// {@link VaultMetadataResolverPort} — specifically per-file cache
// snapshots (links / embeds / tags / frontmatter) and the
// resolved-links graph snapshot.
//
// Scope is intentionally tight: callers (Copilot actions and friends)
// only need to *read* these snapshots; nothing mutates the cache through
// this port, and no Obsidian types leak through.
//
// Before T11Y-7b the equivalent surface lived inside
// `ObsidianCopilotActionVaultAdapter`, which also re-implemented
// markdown-file listing / cached reads / linkpath resolution — all
// already covered by the existing reader and resolver ports. Splitting
// this port out keeps the shared adapter (`AppVaultReaderAdapter`) the
// single owner of vault reads, and adds exactly one narrow surface for
// the metadata-cache pieces that adapter does not already expose.

import type { VaultFileRef } from './VaultFileRef';

export interface VaultFileCacheSnapshot {
	links?: ReadonlyArray<{ link: string }>;
	embeds?: ReadonlyArray<{ link: string }>;
	tags?: ReadonlyArray<{ tag: string }>;
	frontmatter?: { tags?: ReadonlyArray<string>; [k: string]: unknown };
}

export interface VaultMetadataCachePort {
	/**
	 * Plain-data snapshot of Obsidian's per-file metadata cache. Returns
	 * `null` when the file has no cached metadata yet (e.g. just created
	 * or unparsed).
	 */
	getFileCache(file: VaultFileRef): VaultFileCacheSnapshot | null;

	/**
	 * Snapshot of Obsidian's resolved-links graph:
	 * `{ [sourcePath]: { [destPath]: count } }`.
	 */
	getResolvedLinks(): Record<string, Record<string, number>>;
}
