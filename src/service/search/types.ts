import type { DocumentType } from '@/core/document/types';
import type { GraphPreview } from '@/core/storage/graph/types';

/**
 * File/Resource type for search results and file listing
 */
export type SearchResultType = DocumentType | 'heading';

/**
 * Supported search modes in quick search.
 * - vault: global vault search
 * - inFile: search within a single file
 * - inFolder: search within a folder scope
 * - limitIdsSet: search within a limited set of IDs
 */
export type SearchScopeMode = 'vault' | 'inFile' | 'inFolder' | 'limitIdsSet' | 'excludeDocIdsSet';

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
}

/**
 * Returned by search() calls.
 */
export interface SearchResponse {
	query: SearchQuery;
	items: SearchResultItem[];
}

/**
 * A source document used for AI RAG.
 * @deprecated Use SearchResultItem instead.
 */
export interface RagSource {
	path: string;
	title: string;
	snippet: string;
	score?: number;
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
