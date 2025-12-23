import { RootMode } from '@/service/chat/types';
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
	 * If not provided, will fallback to defaultModelId from AI settings.
	 */
	searchSummaryModel?: {
		provider: string;
		modelId: string;
	};
}

/**
 * Shape of plugin-level persisted settings.
 */
export interface MyPluginSettings {
	mySetting: string;
	scriptFolder: string;
	htmlViewConfigFile: string;
	statisticsDataStoreFolder: string;
	dataStorageFolder: string;
	ai: AIServiceSettings;
	commandHidden: CommandHiddenSettings;
	search: SearchSettings;
}

/**
 * AI service configuration settings.
 */
export interface AIServiceSettings {
	rootFolder: string;
	rootMode: RootMode;
	promptFolder: string;
	uploadFolder: string;
	defaultModelId: string;
	llmProviderConfigs: Record<string, ProviderConfig>;
}

/**
 * Default values for AI service settings.
 */
export const DEFAULT_AI_SERVICE_SETTINGS: AIServiceSettings = {
	rootFolder: 'ChatFolder',
	rootMode: 'conversation-first',
	promptFolder: 'A-control/PeakAssistantPrompts',
	uploadFolder: 'ChatFolder/Attachments',
	defaultModelId: 'gpt-4.1-mini',
	llmProviderConfigs: {},
};

/**
 * Default chunking settings.
 */
export const DEFAULT_CHUNKING_SETTINGS: ChunkingSettings = {
	maxChunkSize: 1000,
	chunkOverlap: 200,
	minDocumentSizeForChunking: 1500,
};

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
		excalidraw: false,
		canvas: false,
		dataloom: false,
		folder: false,
		url: false,
		unknown: false,
	} as Record<DocumentType, boolean>,
	chunking: DEFAULT_CHUNKING_SETTINGS,
};

/**
 * Baseline settings applied when no persisted data exists.
 */
export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	scriptFolder: 'A-control',
	htmlViewConfigFile: 'A-control/PeakAssistantScript/HtmlViewConfig.json',
	statisticsDataStoreFolder: 'A-control/PeakAssistantDataStore/RepoStatistics',
	dataStorageFolder: '',
	ai: DEFAULT_AI_SERVICE_SETTINGS,
	commandHidden: DEFAULT_COMMAND_HIDDEN_SETTINGS,
	search: DEFAULT_SEARCH_SETTINGS,
};
