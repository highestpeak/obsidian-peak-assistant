import { ProviderConfig, LLMOutputControlSettings } from '@/core/providers/types';
import { CommandHiddenSettings, DEFAULT_COMMAND_HIDDEN_SETTINGS } from '@/service/CommandHiddenControlService';
import type { DocumentType } from '@/core/document/types';
import { PromptId, CONFIGURABLE_PROMPT_IDS } from '@/service/prompt/PromptId';

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
	 * File/directory ignore patterns (similar to .gitignore).
	 * Files matching these patterns will not be indexed.
	 */
	ignorePatterns: string[];
	/**
	 * Model configuration for AI search summary generation.
	 * If not provided, will fallback to defaultModel from AI settings.
	 */
	searchSummaryModel?: {
		provider: string;
		modelId: string;
	};
	/**
	 * Index refresh interval in milliseconds for debouncing search index updates.
	 * Default: 5000 (5 seconds)
	 */
	indexRefreshInterval: number;

	/**
	 * which implementation to use for ai analysis if web search is enabled.
	 */
	aiAnalysisWebSearchImplement?: 'perplexity' | 'local_chromium';
	/**
	 * which model to use for ai analysis if perplexity is selected.
	 */
	perplexitySearchModel?: string;

	shortSummaryLength: number;
	fullSummaryLength: number;
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
	ignorePatterns: [
		'.git/',
		'node_modules/',
		'.obsidian/',
		'A-control/',
		'*.tmp',
		'*.temp',
		'*.log',
		'.DS_Store',
		'Thumbs.db',
	],
	searchSummaryModel: {
		provider: 'openai',
		modelId: 'gpt-4o-mini',
	},
	indexRefreshInterval: 5000, // 5 seconds

	aiAnalysisWebSearchImplement: 'local_chromium',

	shortSummaryLength: 150,
	fullSummaryLength: 2000,
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
	/**
	 * Default LLM output control settings for all models.
	 * Can be overridden per conversation in chat interface.
	 */
	defaultOutputControl?: LLMOutputControlSettings;
	/**
	 * Model configuration map for configurable prompt IDs.
	 * Only prompts in CONFIGURABLE_PROMPT_IDS should be included here.
	 * If not configured for a specific prompt, falls back to defaultModel.
	 */
	promptModelMap?: Partial<Record<PromptId, { provider: string; modelId: string }>>;
	/**
	 * Default attachment handling mode.
	 * 'direct': Send attachments directly to model (requires model capabilities)
	 * 'degrade_to_text': Convert attachments to text summaries via OCR/parsing
	 */
	attachmentHandlingDefault?: 'direct' | 'degrade_to_text';
}

/**
 * Default values for AI service settings.
 */
export const DEFAULT_AI_SERVICE_SETTINGS: AIServiceSettings = {
	rootFolder: 'ChatFolder',
	promptFolder: 'ChatFolder/Prompts',
	uploadFolder: 'ChatFolder/Attachments',
	resourcesSummaryFolder: 'ChatFolder/resources-summary-cache',
	defaultModel: {
		provider: 'openai',
		modelId: 'gpt-4o-mini',
	},
	llmProviderConfigs: {},
	profileEnabled: true,
	profileFilePath: 'ChatFolder/system/User-Profile.md',
	promptRewriteEnabled: false,
	// Programmatically initialize promptModelMap with defaultModel only for configurable prompt IDs
	promptModelMap: (() => {
		const defaultModel = { provider: 'openai', modelId: 'gpt-4o-mini' };
		const map: Partial<Record<PromptId, { provider: string; modelId: string }>> = {};
		for (const promptId of CONFIGURABLE_PROMPT_IDS) {
			map[promptId] = { ...defaultModel };
		}
		return map;
	})(),
	attachmentHandlingDefault: 'direct', // Default to direct for user experience.
	defaultOutputControl: {
		temperature: 1.0,
		topP: 0.9,
		topK: 50,
		presencePenalty: 0.0,
		frequencyPenalty: 0.0,
		maxOutputTokens: 4096,
		reasoningEffort: 'medium',
		textVerbosity: 'medium',
		timeoutTotalMs: 300000, // 5 minutes
		timeoutStepMs: 30000, // 30 seconds
	},
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
	scriptFolder: 'A-control/PeakAssistant/Scripts',
	htmlViewConfigFile: 'A-control/PeakAssistant/HtmlViewConfig.json',
	statisticsDataStoreFolder: 'A-control/PeakAssistant/Statistics',
	dataStorageFolder: 'A-control/PeakAssistant/DataStore',

	ai: DEFAULT_AI_SERVICE_SETTINGS,
	search: DEFAULT_SEARCH_SETTINGS,

	commandHidden: DEFAULT_COMMAND_HIDDEN_SETTINGS,

	sqliteBackend: 'auto', // Auto-detect: try better-sqlite3 first, fallback to sql.js
};
