import type { SearchResultItem } from '@/core/search/searchTypes';
import type { DocChunkRepo } from '@/core/storage/sqlite/repositories/DocChunkRepo';
import { isVaultReadableSource, isVaultReadableByPath } from '@/core/document/types';
import {
	SEARCH_HIGHLIGHT_VAULT_READ_TIMEOUT_MS,
	SEARCH_HIGHLIGHT_VAULT_CACHE_CAPACITY,
} from '@/core/constant';

/**
 * Where a highlight snippet's raw text came from. Used for debug trace and
 * as a signal to distinguish real content from meta-only fallback.
 */
export type HighlightSourceKind =
	| 'vault_raw'
	| 'chunk_raw'
	| 'summary_raw'
	| 'title_or_path'
	| 'normalized_fallback';

export interface HighlightSource {
	text: string;
	kind: HighlightSourceKind;
	/**
	 * Approximate offset within `text` where the item's chunk is expected to
	 * live. Used by HighlightEngine to bias window selection so multi-chunk
	 * files pick the region matching the chunk that scored. Undefined when
	 * chunking data is unavailable.
	 */
	hintOffset?: number;
	/** How long the Vault read took, if applicable. Debug only. */
	vaultReadMs?: number;
}

/**
 * Read a text file from the Vault by path. Kept as a narrow port so
 * QueryService doesn't have to depend on Obsidian's `App` type.
 */
export interface VaultTextReader {
	readText(path: string): Promise<string | null>;
}

/**
 * Cross-query LRU for Vault text. Optional — resolver still works with an
 * always-miss implementation. Kept as a port so tests can wire a no-op.
 */
export interface VaultTextCache {
	get(path: string): string | null;
	set(path: string, text: string): void;
}

/**
 * Default in-memory LRU with a fixed capacity. Not thread-safe, but plugin
 * queries never overlap on the same tick, so a plain Map is sufficient.
 */
export class MemoryVaultTextCache implements VaultTextCache {
	private readonly store = new Map<string, string>();
	constructor(private readonly capacity: number = SEARCH_HIGHLIGHT_VAULT_CACHE_CAPACITY) {}

	get(path: string): string | null {
		const hit = this.store.get(path);
		if (hit === undefined) return null;
		// Reinsert to make LRU: last-touched moves to the end of iteration order.
		this.store.delete(path);
		this.store.set(path, hit);
		return hit;
	}

	set(path: string, text: string): void {
		if (this.store.has(path)) this.store.delete(path);
		this.store.set(path, text);
		while (this.store.size > this.capacity) {
			const oldest = this.store.keys().next().value as string | undefined;
			if (oldest === undefined) break;
			this.store.delete(oldest);
		}
	}
}

/**
 * Resolves the best raw text source for highlight rendering of final topK
 * results. For Vault-readable document types (markdown / txt / canvas /
 * excalidraw / json / html / xml / csv), reads the file live via
 * {@link VaultTextReader} — this reflects post-edit state and avoids storing
 * a redundant copy in `doc_chunk.content_raw`. For binary / derived types
 * (PDF / DOCX / PPTX / image / URL), falls back to the indexed
 * `content_raw`, which is those types' single source of truth for
 * extracted text.
 *
 * Batching: chunk lookups are one SQL round-trip per query; vault reads are
 * per-query deduplicated by path and cross-query cached via an optional
 * {@link VaultTextCache}. Each read is bounded by a timeout so slow disks
 * don't stall the highlight phase.
 */
export class HighlightSourceResolver {
	constructor(
		private readonly docChunkRepo: DocChunkRepo,
		private readonly vaultReader?: VaultTextReader | null,
		private readonly vaultCache?: VaultTextCache | null,
		private readonly readTimeoutMs: number = SEARCH_HIGHLIGHT_VAULT_READ_TIMEOUT_MS,
	) {}

	async resolveMany(items: SearchResultItem[]): Promise<Map<string, HighlightSource>> {
		const [chunkRawById, chunkIndexById, chunkCountByDoc, vaultTextByPath] = await Promise.all([
			this.batchLoadChunkRaw(items),
			this.batchLoadChunkIndex(items),
			this.batchLoadChunkCount(items),
			this.batchLoadVaultText(items),
		]);

		const byId = new Map<string, HighlightSource>();
		for (const item of items) {
			byId.set(item.id, this.resolveOne(item, {
				chunkRawById,
				chunkIndexById,
				chunkCountByDoc,
				vaultTextByPath,
			}));
		}
		return byId;
	}

	private async batchLoadChunkRaw(items: SearchResultItem[]): Promise<Map<string, string>> {
		// Only fetch content_raw for items we might actually need it for —
		// binary/derived types. Vault-readable items get their text from disk.
		const chunkIds = uniqueValues(items
			.filter(i => !isVaultReadableForItem(i))
			.map(i => i.chunkId));
		if (chunkIds.length === 0) return new Map();
		try {
			const rows = await this.docChunkRepo.getByChunkIds(chunkIds);
			const map = new Map<string, string>();
			for (const r of rows) {
				const raw = (r.content_raw ?? '').trim();
				if (raw) map.set(r.chunk_id, r.content_raw);
			}
			return map;
		} catch (error) {
			console.warn('[HighlightSourceResolver] getByChunkIds failed:', error);
			return new Map();
		}
	}

	private async batchLoadChunkIndex(items: SearchResultItem[]): Promise<Map<string, { docId: string; chunkIndex: number }>> {
		const chunkIds = uniqueValues(items.map(i => i.chunkId));
		if (chunkIds.length === 0) return new Map();
		try {
			return await this.docChunkRepo.getChunkIndexByChunkIds(chunkIds);
		} catch (error) {
			console.warn('[HighlightSourceResolver] getChunkIndexByChunkIds failed:', error);
			return new Map();
		}
	}

	private async batchLoadChunkCount(items: SearchResultItem[]): Promise<Map<string, number>> {
		const docIds = uniqueValues(items.map(i => i.docId));
		if (docIds.length === 0) return new Map();
		try {
			return await this.docChunkRepo.countChunksByDocIds(docIds);
		} catch (error) {
			console.warn('[HighlightSourceResolver] countChunksByDocIds failed:', error);
			return new Map();
		}
	}

	private async batchLoadVaultText(items: SearchResultItem[]): Promise<Map<string, { text: string; readMs: number }>> {
		if (!this.vaultReader) return new Map();
		const readablePaths = uniqueValues(items
			.filter(i => isVaultReadableForItem(i) && i.path)
			.map(i => i.path));
		if (readablePaths.length === 0) return new Map();

		const out = new Map<string, { text: string; readMs: number }>();
		await Promise.all(readablePaths.map(async (path) => {
			const cached = this.vaultCache?.get(path);
			if (cached != null) {
				out.set(path, { text: cached, readMs: 0 });
				return;
			}
			const started = performance.now();
			const text = await withTimeout(
				this.vaultReader!.readText(path),
				this.readTimeoutMs,
			);
			const readMs = performance.now() - started;
			if (text != null) {
				this.vaultCache?.set(path, text);
				out.set(path, { text, readMs });
			}
		}));
		return out;
	}

	private resolveOne(
		item: SearchResultItem,
		ctx: {
			chunkRawById: Map<string, string>;
			chunkIndexById: Map<string, { docId: string; chunkIndex: number }>;
			chunkCountByDoc: Map<string, number>;
			vaultTextByPath: Map<string, { text: string; readMs: number }>;
		},
	): HighlightSource {
		// 1. Vault-first for readable document types — always reflects the
		//    current file on disk, no stale content_raw involvement.
		if (isVaultReadableForItem(item)) {
			const vault = ctx.vaultTextByPath.get(item.path);
			if (vault && vault.text) {
				return {
					text: vault.text,
					kind: 'vault_raw',
					hintOffset: computeHintOffset(vault.text.length, item, ctx),
					vaultReadMs: vault.readMs,
				};
			}
		}

		// 2. Chunk raw for binary / derived types — content_raw is their
		//    single source of truth for extracted text. Skipped for
		//    Vault-readable paths whose read timed out: content_raw was
		//    cleared by the Phase 3 migration so it would be empty anyway.
		if (item.chunkId && !isVaultReadableForItem(item)) {
			const chunkText = ctx.chunkRawById.get(item.chunkId);
			if (chunkText) return { text: chunkText, kind: 'chunk_raw' };
		}

		// 3. Retriever-supplied contentRaw (vector semantic summary path).
		if (item.contentRaw && item.contentRaw.trim()) {
			const kind: HighlightSourceKind = item.matchType === 'semantic' ? 'summary_raw' : 'chunk_raw';
			return { text: item.contentRaw, kind };
		}

		// 4. Meta / fuzzy hits, OR any Vault-readable item whose file read
		//    failed: label snippet uses title/path so we never render
		//    normalized/segmented FTS text as the user's note body. For a
		//    Vault-readable item, an empty content_raw means the migration
		//    cleared it — falling to normalized text would leak the segmented
		//    version the user has already complained about.
		if (item.matchType === 'meta' || item.matchType === 'fuzzy' || isVaultReadableForItem(item)) {
			const label = item.title ? `${item.title} — ${item.path}` : item.path;
			return { text: label, kind: 'title_or_path' };
		}

		// 5. Last resort — normalized content. Kept only so search never
		//    blocks on a missing highlight source.
		return { text: item.content ?? '', kind: 'normalized_fallback' };
	}
}

/**
 * True when the item's file can be read live from the Vault. Prefers
 * DocumentType from index metadata; falls back to the path extension when
 * the retriever forgot to propagate type. Defense-in-depth: the resolver is
 * one of very few consumers of `item.type`, and losing the type field
 * silently regresses the whole Phase 2 design.
 */
function isVaultReadableForItem(item: SearchResultItem): boolean {
	if (isVaultReadableSource(item.type)) return true;
	if (!item.type || item.type === 'unknown') return isVaultReadableByPath(item.path);
	return false;
}

/**
 * Estimate a character offset into the whole-file text that corresponds to
 * `item`'s chunk. Ratio-based; robust to typical chunk-size variance because
 * `findBestWindow` only uses it as a soft bias.
 */
function computeHintOffset(
	textLength: number,
	item: SearchResultItem,
	ctx: {
		chunkIndexById: Map<string, { docId: string; chunkIndex: number }>;
		chunkCountByDoc: Map<string, number>;
	},
): number | undefined {
	if (!item.chunkId) return undefined;
	const idx = ctx.chunkIndexById.get(item.chunkId);
	if (!idx) return undefined;
	const total = ctx.chunkCountByDoc.get(idx.docId) ?? 0;
	if (total <= 0) return undefined;
	return Math.round((idx.chunkIndex / total) * textLength);
}

function uniqueValues<T>(arr: Array<T | undefined | null>): T[] {
	const seen = new Set<T>();
	const out: T[] = [];
	for (const v of arr) {
		if (v == null) continue;
		if (seen.has(v)) continue;
		seen.add(v);
		out.push(v);
	}
	return out;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			p,
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), ms);
			}),
		]);
	} catch {
		return null;
	} finally {
		if (timer) clearTimeout(timer);
	}
}
