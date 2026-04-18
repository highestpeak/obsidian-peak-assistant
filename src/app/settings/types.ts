import { normalizePath } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { BusinessError, ErrorCode } from '@/core/errors';
import { ProviderConfig, LLMOutputControlSettings } from '@/core/providers/types';
import type { DocumentType } from '@/core/document/types';
import { PromptId, CONFIGURABLE_PROMPT_IDS, INDEXING_AND_HUB_PROMPT_IDS, SEARCH_AI_ANALYSIS_PROMPT_IDS } from '@/service/prompt/PromptId';
import {
	DEFAULT_HUB_DISCOVER_SETTINGS,
	type HubDiscoverSettings,
} from '@/service/search/index/helper/hub/types';
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
	/**
	 * When true, fenced/indented code blocks are replaced before chunking to reduce noisy embeddings.
	 */
	skipCodeBlocksInChunking?: boolean;
	/**
	 * When set, replaces each omitted fenced block (maxCodeChunkChars 0) with this exact string.
	 * Omit to use per-block `[code omitted lang=… lines=… chars=… kw=…]` summaries.
	 */
	codeBlockPlaceholder?: string;
	/**
	 * Max characters per code block to keep (0 = omit code entirely, only placeholder).
	 */
	maxCodeChunkChars?: number;
}

/**
 * Default chunking settings.
 */
export const DEFAULT_CHUNKING_SETTINGS: ChunkingSettings = {
	maxChunkSize: 1000,
	chunkOverlap: 200,
	minDocumentSizeForChunking: 1500,
	skipCodeBlocksInChunking: false,
	codeBlockPlaceholder: '\n\n[code omitted]\n\n',
	maxCodeChunkChars: 0,
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
	 * @deprecated
	 */
	searchSummaryModel?: {
		provider: string;
		modelId: string;
	};
	aiAnalysisModel?: {
		thoughtAgentModel?: {
			provider: string;
			modelId: string;
		};
		searchAgentModel?: {
			provider: string;
			modelId: string;
		};
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

	/**
	 * Maximum iterations for multi-agent ReAct loop.
	 * Default: 10
	 */
	maxMultiAgentIterations: number;

	/**
	 * Word limit hint for AI analysis session summarization.
	 * Injected into context when history grows too large. Default: 1200
	 */
	aiAnalysisSessionSummaryWordCount: number;

	/**
	 * Auto-save AI analysis results to a folder in the vault.
	 * Default: true
	 */
	aiAnalysisAutoSaveEnabled: boolean;

	/**
	 * Folder path (relative to vault root) for auto-saving AI analysis results.
	 * Default: "Analysis/AI Searches"
	 */
	aiAnalysisAutoSaveFolder: string;

	/**
	 * When true, exclude docs under aiAnalysisAutoSaveFolder from local search and graph tools during AI analysis.
	 * Default: true
	 */
	aiAnalysisExcludeAutoSaveFolderFromSearch: boolean;

	/**
	 * How many recent AI analysis entries to keep for quick access.
	 * Default: 5
	 */
	aiAnalysisHistoryLimit: number;

	/**
	 * Inspector Links panel: filter tokens and folder grouping.
	 */
	inspectorLinks?: InspectorLinksSettings;

	/**
	 * Hub maintenance: multi-round candidate selection and optional LLM judge.
	 */
	hubDiscover?: HubDiscoverSettings;
}

/** Inspector Links panel settings */
export interface InspectorLinksSettings {
	/** Top N keywords to show as filter chips */
	keywordTopN: number;
	/** Top N tags to show as filter chips */
	tagTopN: number;
	/** Enable folder grouping for display */
	folderGroupingEnabled: boolean;
	/** Min file count to form a folder group (topDownStop) */
	folderGroupMinCount: number;
	/** Max depth for folder grouping */
	folderGroupMaxDepth: number;
}

export const DEFAULT_INSPECTOR_LINKS_SETTINGS: InspectorLinksSettings = {
	keywordTopN: 8,
	tagTopN: 8,
	folderGroupingEnabled: true,
	folderGroupMinCount: 6,
	folderGroupMaxDepth: 4,
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
	aiAnalysisModel: {
		thoughtAgentModel: {
			provider: 'openai',
			modelId: 'gpt-4o-mini',
		},
		searchAgentModel: {
			provider: 'openai',
			modelId: 'gpt-4o-mini',
		},
	},
	indexRefreshInterval: 5000, // 5 seconds

	aiAnalysisWebSearchImplement: 'local_chromium',

	shortSummaryLength: 150,
	fullSummaryLength: 2000,

	maxMultiAgentIterations: 10,

	aiAnalysisSessionSummaryWordCount: 3000,

	aiAnalysisAutoSaveEnabled: true,
	aiAnalysisAutoSaveFolder: 'ChatFolder/AI-Analysis',
	aiAnalysisExcludeAutoSaveFolderFromSearch: true,
	aiAnalysisHistoryLimit: 5,

	inspectorLinks: DEFAULT_INSPECTOR_LINKS_SETTINGS,

	hubDiscover: { ...DEFAULT_HUB_DISCOVER_SETTINGS },
};

/** Subfolder names under rootFolder (Prompts, Attachments, etc.). Only rootFolder is configurable. */
export const AI_PATH_SUBFOLDERS = {
	Prompts: 'Prompts',
	Attachments: 'Attachments',
	ResourcesSummary: 'resources-summary-cache',
	HubSummaries: 'Hub-Summaries',
	/** User-authored hub notes live here; not auto-overwritten by maintenance. */
	ManualHubNotes: 'Manual',
	UserProfile: 'system/User-Profile.md',
} as const;

/**
 * Normalized AI root. Pass `rootFolder` during bootstrap before {@link AppContext} exists; otherwise reads from AppContext.
 */
function aiNormalizedRootFolder(rootFolderOverride?: string): string {
	const raw =
		rootFolderOverride !== undefined
			? rootFolderOverride
			: AppContext.getInstance().settings.ai.rootFolder;
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new BusinessError(ErrorCode.CONFIGURATION_MISSING, 'AI rootFolder is empty; ensure settings are initialized.');
	}
	return normalizePath(trimmed.replace(/\/+$/, ''));
}

/** `{root}/Prompts` — vault-relative, normalized. */
export function getAIPromptFolder(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Prompts}`);
}

/** `{root}/Attachments` — vault-relative, normalized. */
export function getAIUploadFolder(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Attachments}`);
}

/** `{root}/resources-summary-cache` — vault-relative, normalized. */
export function getAIResourcesSummaryFolder(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ResourcesSummary}`);
}

/** `{root}/Hub-Summaries` — vault-relative, normalized. */
export function getAIHubSummaryFolder(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.HubSummaries}`);
}

/** `{root}/Hub-Summaries/Manual` — user-authored hub notes; vault-relative, normalized. */
export function getAIManualHubFolder(rootFolder?: string): string {
	return normalizePath(`${getAIHubSummaryFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ManualHubNotes}`);
}

/** `{root}/system/User-Profile.md` — vault-relative, normalized. */
export function getAIProfileFilePath(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.UserProfile}`);
}

/**
 * AI service configuration settings.
 * Only rootFolder is configurable; Prompts, Attachments, etc. use getters such as {@link getAIPromptFolder}.
 */
export interface AIServiceSettings {
	rootFolder: string;
	defaultModel: {
		provider: string;
		modelId: string;
	};
	/**
	 * Optional model override for AI Analysis (search analysis, report generation).
	 * When set, all AiAnalysis* prompts use this model instead of defaultModel.
	 * Enables using providers like OpenRouter for parallel API calls.
	 */
	analysisModel?: {
		provider: string;
		modelId: string;
	};
	llmProviderConfigs: Record<string, ProviderConfig>;
	/**
	 * Enable profile mode (auto-update user profile)
	 */
	profileEnabled?: boolean;
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
	 * Model configuration map for prompt IDs shown in Model Configuration UI.
	 * Includes general configurable prompts, Search AI Analysis, and Indexing & Hub prompts.
	 * If not configured for a specific prompt, falls back to defaultModel (see PromptService fallbacks).
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
	defaultModel: {
		provider: 'openai',
		modelId: 'gpt-4o-mini',
	},
	llmProviderConfigs: {},
	profileEnabled: true,
	promptRewriteEnabled: false,
	// Programmatically initialize promptModelMap with defaultModel for all prompts
	// (Previously AI Analysis prompts used OpenRouter, but that breaks for users without OpenRouter configured)
	promptModelMap: (() => {
		const defaultModel = { provider: 'openai', modelId: 'gpt-4o-mini' };
		const map: Partial<Record<PromptId, { provider: string; modelId: string }>> = {};
		for (const promptId of [...CONFIGURABLE_PROMPT_IDS, ...INDEXING_AND_HUB_PROMPT_IDS, ...SEARCH_AI_ANALYSIS_PROMPT_IDS]) {
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

	/**
	 * SQLite backend preference. Only better-sqlite3 is supported.
	 * - 'auto': Use better-sqlite3 (must be available)
	 * - 'better-sqlite3': Use better-sqlite3
	 */
	sqliteBackend?: 'auto' | 'better-sqlite3';

	/**
	 * Enable development tools for testing graph inspector tools in DevTools console.
	 * When enabled, exposes window.testGraphTools global object.
	 */
	enableDevTools?: boolean;

	/** Graph visualization settings (default cluster force strength, node size, MST, etc.). */
	graphViz?: {
		clusterForceStrength?: number;
		nodeBaseRadiusPhysical?: number;
		nodeBaseRadiusSemantic?: number;
		nodeDegreeBoost?: number;
		mstPruneDepth?: number;
		skeletonBackboneOnly?: boolean;
		skeletonMinBranchNodes?: number;
		mstLeafOpacity?: number;
		mstLeafWidthScale?: number;
	};

	/**
	 * Vault Search (Claude Agent SDK).
	 */
	vaultSearch?: {
		sdkProfile?: {
			kind?: 'anthropic-direct' | 'openrouter' | 'litellm' | 'custom';
			baseUrl?: string;
			apiKey?: string | null;
			authToken?: string | null;
			primaryModel?: string;
			fastModel?: string;
			customHeaders?: Record<string, string>;
		};
	};
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

	sqliteBackend: 'auto',

	enableDevTools: false, // Disabled by default for security

	graphViz: {
		clusterForceStrength: 0.02,
		nodeBaseRadiusPhysical: 6,
		nodeBaseRadiusSemantic: 7,
		nodeDegreeBoost: 16,
		mstPruneDepth: 2,
		skeletonBackboneOnly: false,
		skeletonMinBranchNodes: 3,
		mstLeafOpacity: 0.25,
		mstLeafWidthScale: 0.6,
	},

	vaultSearch: {
		sdkProfile: {
			kind: 'anthropic-direct',
			baseUrl: 'https://api.anthropic.com',
			primaryModel: 'claude-opus-4-6',
			fastModel: 'claude-haiku-4-5',
			// apiKey / authToken are user-provided at runtime
		},
	},
};
