import { ProviderConfig } from '@/core/providers/types';
import { CommandHiddenSettings, DEFAULT_COMMAND_HIDDEN_SETTINGS } from '@/service/CommandHiddenControlService';
import type { DocumentType } from '@/core/document/types';

/**
 * Document chunking configuration.
 */
export interface ChunkingSettings {
	/**
	 * Maximum chunk size in characters.
	 * Default: 1000
	 */
	maxChunkSize: number;
	/**
	 * Overlap between chunks in characters.
	 * Default: 200
	 */
	chunkOverlap: number;
	/**
	 * Minimum document size to trigger chunking.
	 * Default: 1500
	 */
	minDocumentSizeForChunking: number;
	/**
	 * Embedding model configuration.
	 * If not provided, embeddings will not be generated.
	 */
	embeddingModel?: {
		provider: string;
		modelId: string;
	};
	/**
	 * Rerank model configuration for improving search result relevance.
	 * If not provided, reranking will not be performed.
	 */
	rerankModel?: {
		provider: string;
		modelId: string;
	};
}

/**
 * Default chunking settings.
 */
export const DEFAULT_CHUNKING_SETTINGS: ChunkingSettings = {
	maxChunkSize: 1000,
	chunkOverlap: 200,
	minDocumentSizeForChunking: 1500,
};

/**
 * Search-related settings.
 */
export interface SearchSettings {
	/**
	 * Automatically index files on startup.
	 * If false, user must manually trigger indexing via command.
	 */
	autoIndex: boolean;
	/**
	 * File types to include in indexing.
	 */
	includeDocumentTypes: Record<DocumentType, boolean>;
	/**
	 * Document chunking configuration for embedding and vector search.
	 */
	chunking: ChunkingSettings;
	/**
	 * Model configuration for AI search summary generation.
	 * If not provided, will fallback to defaultModel from AI settings.
	 */
	searchSummaryModel?: {
		provider: string;
		modelId: string;
	};
	/**
	 * Model configuration for image description generation (OCR and vision).
	 * If not provided, will fallback to defaultModel from AI settings.
	 */
	imageDescriptionModel?: {
		provider: string;
		modelId: string;
	};
}

/**
 * Default search settings.
 */
export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
	autoIndex: false, // Default to manual indexing
	includeDocumentTypes: {
		markdown: true,
		pdf: true,
		image: true,
		// All other document types default to false
		csv: false,
		json: false,
		html: false,
		xml: false,
		txt: false,
		docx: false,
		xlsx: false,
		pptx: false,
		conv: false,
		project: false,
		prompt: false,
		excalidraw: true,
		canvas: false,
		dataloom: false,
		folder: false,
		url: false,
		unknown: false,
	} as Record<DocumentType, boolean>,
	chunking: DEFAULT_CHUNKING_SETTINGS,
	searchSummaryModel: {
		provider: 'openai',
		modelId: 'gpt-4o-mini',
	},
	imageDescriptionModel: {
		provider: 'openai',
		modelId: 'gpt-4o',
	},
};

/**
 * AI service configuration settings.
 */
export interface AIServiceSettings {
	rootFolder: string;
	promptFolder: string;
	uploadFolder: string;
	defaultModel: {
		provider: string;
		modelId: string;
	};
	llmProviderConfigs: Record<string, ProviderConfig>;
	/**
	 * Enable profile mode (auto-update user profile)
	 */
	profileEnabled?: boolean;
	/**
	 * Path to user profile file (relative to vault root)
	 */
	profileFilePath?: string;
	/**
	 * Resources summary folder name (relative to rootFolder).
	 * Used for storing resource summary notes (files, URLs, etc.).
	 */
	resourcesSummaryFolder: string;
	/**
	 * Enable prompt rewrite (auto-improve user prompts)
	 */
	promptRewriteEnabled?: boolean;
}

/**
 * Default values for AI service settings.
 */
export const DEFAULT_AI_SERVICE_SETTINGS: AIServiceSettings = {
	rootFolder: 'ChatFolder',
	promptFolder: 'A-control/PeakAssistantPrompts',
	uploadFolder: 'ChatFolder/Attachments',
	resourcesSummaryFolder: 'resources-summary-cache',
	defaultModel: {
		provider: 'openai',
		modelId: 'gpt-4o-mini',
	},
	llmProviderConfigs: {},
	profileEnabled: true,
	profileFilePath: 'ChatFolder/User-Profile.md',
	promptRewriteEnabled: false,
};

/**
 * Shape of plugin-level persisted settings.
 */
export interface MyPluginSettings {
	// general folder settings
	scriptFolder: string;
	htmlViewConfigFile: string;
	statisticsDataStoreFolder: string;
	dataStorageFolder: string;

	// core settings
	ai: AIServiceSettings;
	search: SearchSettings;

	// the try to replace other plugins' functions' settings
	commandHidden: CommandHiddenSettings;

	/**
	 * SQLite backend preference.
	 * - 'auto': Automatically detect and use better-sqlite3 if available, otherwise use sql.js
	 * - 'better-sqlite3': Force use better-sqlite3 (requires manual installation)
	 * - 'sql.js': Force use sql.js (default, cross-platform)
	 */
	sqliteBackend?: 'auto' | 'better-sqlite3' | 'sql.js';
}

/**
 * Baseline settings applied when no persisted data exists.
 */
export const DEFAULT_SETTINGS: MyPluginSettings = {
	scriptFolder: 'A-control',
	htmlViewConfigFile: 'A-control/PeakAssistantScript/HtmlViewConfig.json',
	statisticsDataStoreFolder: 'A-control/PeakAssistantDataStore/RepoStatistics',
	dataStorageFolder: '',

	ai: DEFAULT_AI_SERVICE_SETTINGS,
	search: DEFAULT_SEARCH_SETTINGS,

	commandHidden: DEFAULT_COMMAND_HIDDEN_SETTINGS,

	sqliteBackend: 'auto', // Auto-detect: try better-sqlite3 first, fallback to sql.js
};
