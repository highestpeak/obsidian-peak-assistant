import type { DocumentType } from '@/core/document/types';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { ChunkType } from '@/core/search/chunkTypes';

/**
 * File/Resource type for search results and file listing
 */
export type SearchResultType = DocumentType | 'heading';

/**
 * Supported search scope modes.
 * - all: global vault search (was `vault` pre-T0/2026-07-07)
 * - heading: search / outline within a single file (was `inFile` pre-T0)
 * - inFolder: folder-scoped search — used by chat-view context `@folder`
 *   autocomplete; the quick-search `@` folder mode was retired by T1.
 * - limitIdsSet: search within a limited set of IDs
 * - excludeDocIdsSet: search excluding a set of IDs
 */
export type SearchScopeMode = 'all' | 'heading' | 'inFolder' | 'limitIdsSet' | 'excludeDocIdsSet';

/**
 * Optional search scope information.
 */
export interface SearchScopeValue {
	/**
	 * Current file path (if any). Used for inFile mode and directory boost.
	 */
	currentFilePath?: string | null;
	/**
	 * Folder path (if inFolder mode).
	 */
	folderPath?: string | null;
	/**
	 * Limit IDs set (if limitIdsSet mode).
	 */
	limitIdsSet?: Set<string>;
	/**
	 * Exclude IDs set (if excludeIdsSet mode).
	 */
	excludeDocIdsSet?: Set<string>;
}

/**
 * Query object sent from UI to the search engine.
 */
export interface SearchQuery {
	text: string;
	/**
	 * no full support currently. please implement it when you need it.
	 */
	scopeMode: SearchScopeMode;
	scopeValue?: SearchScopeValue;
	topK?: number;
	/**
	 * Search mode: 'fulltext' for text only, 'vector' for vector only, 'hybrid' for both.
	 * Defaults to 'fulltext'.
	 */
	searchMode?: 'fulltext' | 'vector' | 'hybrid';
	/**
	 * Exclude folder mode: paths starting with any of these prefixes are excluded from search.
	 * E.g. ['templates/', 'trash/'] — leading slash optional; folder semantics (prefix/ or exact name).
	 */
	excludeFolderPrefixes?: string[];
	/**
	 * Index tenant: 'vault' = search.sqlite (default), 'chat' = meta.sqlite (ChatFolder index).
	 */
	indexTenant?: 'vault' | 'chat';
	/** Enable Personalized PageRank graph-based reranking (default: true when available). */
	enablePPR?: boolean;
}

/**
 * A highlight span in a snippet/title.
 * Offsets are UTF-16 indices (JS string indices).
 */
export interface SnippetSpan {
	start: number;
	end: number;
}

/**
 * Search snippet with optional highlight spans.
 */
export interface SearchSnippet {
	text: string;
	highlights?: SnippetSpan[];
}

/**
 * A single search result item.
 */
export type SearchResultSource = 'local' | 'web' | 'x'; // x for future extensibility

export interface SearchResultItem {
	id: string;
	type: SearchResultType;
	title: string;
	path: string;
	lastModified: number;
	/**
	 * Full content of the search result (chunk or document).
	 * Used for highlighting and displaying context.
	 */
	content?: string;
	highlight?: SearchSnippet | null;
	/**
	 * Raw score from the engine (before boosts).
	 */
	score?: number;
	/**
	 * Final score after boosts.
	 */
	finalScore?: number;
	/**
	 * Relative-normalized display score in [0, 100]. Written by
	 * `assignDisplayScorePercent` after ranking finishes. Top item = 100%.
	 * Consumers should prefer this over `Math.round(finalScore * 100)` — the
	 * additive boost sum in `finalScore` can exceed 1.0 and isn't a probability.
	 */
	displayScorePercent?: number | null;
	/**
	 * Source of the search result (local vault, web, etc.)
	 */
	source?: SearchResultSource;
	/**
	 * Optional location hint for opening/scrolling.
	 */
	loc?: {
		/**
		 * Character offset in the file (best effort).
		 */
		charOffset?: number;
		/**
		 * Line number in the file (1-based, best effort).
		 */
		line?: number;
	};
	/**
	 * Badges for AI search results - quick identifiers for the item's role.
	 */
	badges?: string[];
	/**
	 * Score breakdown for AI search results (physical/semantic/average).
	 */
	scoreDetail?: {
		physical: number;
		semantic: number;
		average: number;
	};
	/**
	 * Indexed document id (`mobius_node.node_id` for notes); set when chunk-level hit is resolved.
	 */
	docId?: string;
	/**
	 * Chunk id for vector/FTS hits (embedding / `doc_chunk.chunk_id`).
	 */
	chunkId?: string;
	/**
	 * Chunk provenance for rerank and display.
	 */
	chunkType?: ChunkType;
	/**
	 * Raw (un-normalized) content for highlight snippet generation.
	 */
	contentRaw?: string;
	/**
	 * How this result was matched (exact, stem, semantic, fuzzy, meta).
	 */
	matchType?: string;
	/**
	 * If the query was fuzzy-corrected, the corrected term.
	 */
	fuzzyCorrection?: string;
	/**
	 * Highlighted title with span positions.
	 */
	titleHighlight?: { text: string; spans: Array<{ start: number; end: number; type: string }> };
	/**
	 * Debug-only: identifies which source produced the highlight snippet raw
	 * text (chunk_raw, vault_raw, summary_raw, title_or_path, normalized_fallback).
	 * Not shown in production UI; consumed by Search debug trace.
	 */
	highlightSourceKind?: string;
	/**
	 * Debug-only: hint offset (chars) into the whole-file source that
	 * `findBestWindow` used to bias window selection. Undefined when chunk
	 * metadata was unavailable.
	 */
	highlightHintOffset?: number;
	/**
	 * Debug-only: milliseconds spent reading the Vault text for this item.
	 * Zero when served from the resolver's in-memory cache.
	 */
	highlightVaultReadMs?: number;
}

/**
 * Returned by search() calls.
 */
export interface SearchResponse {
	query: SearchQuery;
	items: SearchResultItem[];
	/** If the query was fuzzy-corrected, the corrected term (e.g. "Did you mean: ..."). */
	fuzzyCorrection?: string;
}


/**
 * AI analysis request parameters.
 */
export interface AiAnalyzeRequest {
	query: string;
	topK?: number;
	webEnabled?: boolean;
}

/**
 * AI analysis result returned by the system.
 * The summary is typically produced by LLM, while sources/insights come from retrieval.
 */
export interface AiAnalyzeResult {
	summary: string;
	sources: SearchResultItem[];
	insights?: {
		topics?: Array<{ label: string; weight: number }>;
		graph?: GraphPreview;
	};
	usage?: {
		estimatedTokens?: number;
	};
	duration?: number; // Search duration in milliseconds
}
