import { normalizePath } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { BusinessError, ErrorCode } from '@/core/errors';
import { ProviderConfig, LLMOutputControlSettings } from '@/core/providers/types';
import type { DocumentType } from '@/core/document/types';
import { PromptId, CONFIGURABLE_PROMPT_IDS, INDEXING_AND_HUB_PROMPT_IDS, SEARCH_AI_ANALYSIS_PROMPT_IDS } from '@/service/prompt/PromptId';
import type { ProfileSettings, RoleConfig } from '@/core/profiles/types';
import type { AmbientPushSettings } from '@/service/ambient/types';
import type { MCPServerConfig } from '@/service/mcp/types';
import type { IndexLevel } from '@/service/search/index/types';

export interface ChunkingSettings {
	maxChunkSize: number;
	chunkOverlap: number;
	minDocumentSizeForChunking: number;
	embeddingModel?: { provider: string; modelId: string };
	rerankModel?: { provider: string; modelId: string };
	/** Replace fenced/indented code blocks before chunking to reduce noisy embeddings. */
	skipCodeBlocksInChunking?: boolean;
	/** Replacement string for omitted fenced blocks. Omit for per-block summaries. */
	codeBlockPlaceholder?: string;
	/** Max chars per code block to keep (0 = omit entirely). */
	maxCodeChunkChars?: number;
}

export const DEFAULT_CHUNKING_SETTINGS: ChunkingSettings = {
	maxChunkSize: 1000,
	chunkOverlap: 200,
	minDocumentSizeForChunking: 1500,
	skipCodeBlocksInChunking: false,
	codeBlockPlaceholder: '\n\n[code omitted]\n\n',
	maxCodeChunkChars: 0,
};

export interface SearchSettings {
	autoIndex: boolean;
	includeDocumentTypes: Record<DocumentType, boolean>;
	chunking: ChunkingSettings;
	/** File/directory ignore patterns (.gitignore style). */
	ignorePatterns: string[];
	aiAnalysisModel?: {
		thoughtAgentModel?: { provider: string; modelId: string };
		searchAgentModel?: { provider: string; modelId: string };
	};
	/** Debounce interval (ms) for search index updates. */
	indexRefreshInterval: number;
	shortSummaryLength: number;
	fullSummaryLength: number;
	/** Word limit for AI analysis session summarization. */
	aiAnalysisSessionSummaryWordCount: number;
	aiAnalysisAutoSaveEnabled: boolean;
	aiAnalysisAutoSaveFolder: string;
	/** Exclude docs under aiAnalysisAutoSaveFolder from local search/graph tools during AI analysis. */
	aiAnalysisExcludeAutoSaveFolderFromSearch: boolean;
	aiAnalysisHistoryLimit: number;
	inspectorLinks?: InspectorLinksSettings;
	/** Controls which enrichment steps run during incremental indexing. */
	indexLevel: IndexLevel;
	/** Timestamp when the user dismissed the index-level upgrade prompt. null = never dismissed. */
	searchUpgradePromptDismissedAt: number | null;
	/** Enable Personalized PageRank graph reranking during text search. Default: true. */
	enablePPR: boolean;
}

export interface InspectorLinksSettings {
	keywordTopN: number;
	tagTopN: number;
	folderGroupingEnabled: boolean;
	folderGroupMinCount: number;
	folderGroupMaxDepth: number;
}

export const DEFAULT_INSPECTOR_LINKS_SETTINGS: InspectorLinksSettings = {
	keywordTopN: 8,
	tagTopN: 8,
	folderGroupingEnabled: true,
	folderGroupMinCount: 6,
	folderGroupMaxDepth: 4,
};

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
	autoIndex: false,
	includeDocumentTypes: {
		markdown: true,
		pdf: true,
		image: true,
		csv: false, json: false, html: false, xml: false, txt: false,
		docx: false, xlsx: false, pptx: false,
		excalidraw: true, canvas: false,
		folder: false, url: false, unknown: false,
	} as Record<DocumentType, boolean>,
	chunking: DEFAULT_CHUNKING_SETTINGS,
	ignorePatterns: [
		'.git/', 'node_modules/', '.obsidian/', 'A-control/',
		'*.tmp', '*.temp', '*.log', '.DS_Store', 'Thumbs.db',
	],
	aiAnalysisModel: {
		thoughtAgentModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
		searchAgentModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
	},
	indexRefreshInterval: 5000,
	shortSummaryLength: 150,
	fullSummaryLength: 2000,
	aiAnalysisSessionSummaryWordCount: 3000,
	aiAnalysisAutoSaveEnabled: true,
	aiAnalysisAutoSaveFolder: 'ChatFolder/AI-Analysis',
	aiAnalysisExcludeAutoSaveFolderFromSearch: true,
	aiAnalysisHistoryLimit: 5,
	inspectorLinks: DEFAULT_INSPECTOR_LINKS_SETTINGS,
	indexLevel: 'fast' as IndexLevel,
	searchUpgradePromptDismissedAt: null,
	enablePPR: true,
};

/** Subfolder names under rootFolder. Only rootFolder is configurable. */
export const AI_PATH_SUBFOLDERS = {
	Prompts: 'Prompts',
	Attachments: 'Attachments',
	ResourcesSummary: 'resources-summary-cache',
	HubSummaries: 'Hub-Summaries',
	ManualHubNotes: 'Manual',
	UserProfile: 'system/User-Profile.md',
} as const;

function aiNormalizedRootFolder(rootFolderOverride?: string): string {
	const raw = rootFolderOverride !== undefined
		? rootFolderOverride
		: AppContext.getInstance().settings.ai.rootFolder;
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new BusinessError(ErrorCode.CONFIGURATION_MISSING, 'AI rootFolder is empty; ensure settings are initialized.');
	}
	return normalizePath(trimmed.replace(/\/+$/, ''));
}

export function getAIPromptFolder(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Prompts}`);
}

export function getAIUploadFolder(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Attachments}`);
}

export function getAIResourcesSummaryFolder(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ResourcesSummary}`);
}

export function getAIHubSummaryFolder(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.HubSummaries}`);
}

export function getAIManualHubFolder(rootFolder?: string): string {
	return normalizePath(`${getAIHubSummaryFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.ManualHubNotes}`);
}

export function getAIProfileFilePath(rootFolder?: string): string {
	return normalizePath(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.UserProfile}`);
}

export interface AIServiceSettings {
	rootFolder: string;
	defaultModel: { provider: string; modelId: string };
	/** Override model for AI Analysis (search analysis, report generation). */
	analysisModel?: { provider: string; modelId: string };
	llmProviderConfigs: Record<string, ProviderConfig>;
	profileEnabled?: boolean;
	defaultOutputControl?: LLMOutputControlSettings;
	/** Model config per prompt ID. Falls back to defaultModel (see PromptService). */
	promptModelMap?: Partial<Record<PromptId, { provider: string; modelId: string }>>;
	/** 'direct': send attachments to model; 'degrade_to_text': convert via OCR/parsing. */
	attachmentHandlingDefault?: 'direct' | 'degrade_to_text';
}

export const DEFAULT_AI_SERVICE_SETTINGS: AIServiceSettings = {
	rootFolder: 'ChatFolder',
	defaultModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
	llmProviderConfigs: {},
	profileEnabled: true,
	promptModelMap: (() => {
		const defaultModel = { provider: 'openai', modelId: 'gpt-4o-mini' };
		const map: Partial<Record<PromptId, { provider: string; modelId: string }>> = {};
		for (const promptId of [...CONFIGURABLE_PROMPT_IDS, ...INDEXING_AND_HUB_PROMPT_IDS, ...SEARCH_AI_ANALYSIS_PROMPT_IDS]) {
			map[promptId] = { ...defaultModel };
		}
		return map;
	})(),
	attachmentHandlingDefault: 'direct',
	defaultOutputControl: {
		temperature: 1.0,
		topP: 0.9,
		topK: 50,
		presencePenalty: 0.0,
		frequencyPenalty: 0.0,
		reasoningEffort: 'medium',
		textVerbosity: 'medium',
		timeoutTotalMs: 300000,
		timeoutStepMs: 30000,
	},
};

/**
 * Configuration for the self-hosted agent harness (M5).
 *
 * All fields are optional with safe defaults — see DEFAULT_HARNESS_SETTINGS.
 * The three tier RoleConfig fields map to ProfileRegistry role configs so the
 * same profiles/models already configured by the user can be reused.
 */
/**
 * Which backend runs agent loops:
 * - 'auto'              — prefer self-hosted harness; fall back to SDK only for agents that hard-code it (VaultSearchAgentSDK).
 * - 'harness'           — always use the self-hosted loop (local models). VaultSearchAgentSDK still uses SDK regardless (HITL coupling).
 * - 'claude-agent-sdk'  — route migrated agents through Claude Agent SDK (highest quality, requires Anthropic API key).
 */
export type AgentBackend = 'auto' | 'harness' | 'claude-agent-sdk';

export interface HarnessSettings {
	/** Which backend runs agent loops. Default 'auto'. */
	agentBackend: AgentBackend;
	/** local-fast tier profile+model (e.g. Ollama Qwen3-14B). null = disabled. */
	localFastConfig: RoleConfig | null;
	/** local-deep tier profile+model (e.g. Ollama Qwen3-32B). null = disabled. */
	localDeepConfig: RoleConfig | null;
	/** online tier profile+model (e.g. Anthropic Claude). null = inherit from active chat config. */
	onlineConfig: RoleConfig | null;
	/** Allow automatic tier escalation when self-score drops below threshold. Default true. */
	allowEscalation: boolean;
	/** Hard cap on automatic tier upgrades per loop. Range 1-3. Default 3. */
	maxEscalationsPerLoop: number;
	/** Score threshold below which auto-escalation triggers. Range 0-1. Default 0.4. */
	autoEscalateScoreBelow: number;
	/** Enable user-defined hooks (pre_tool_use / post_tool_use etc.). Default false. */
	hooksEnabled: boolean;
	/** Default permission mode for agent actions. Default 'acceptEdits'. */
	defaultPermissionMode: 'read' | 'acceptEdits' | 'bypassPermissions';
}

export const DEFAULT_HARNESS_SETTINGS: HarnessSettings = {
	agentBackend: 'auto',
	localFastConfig: null,
	localDeepConfig: null,
	onlineConfig: null,
	allowEscalation: true,
	maxEscalationsPerLoop: 3,
	autoEscalateScoreBelow: 0.4,
	hooksEnabled: false,
	defaultPermissionMode: 'acceptEdits',
};

export interface MyPluginSettings {
	dataStorageFolder: string;
	ai: AIServiceSettings;
	search: SearchSettings;
	sqliteBackend?: 'auto' | 'better-sqlite3';
	enableDevTools?: boolean;
	graphViz?: {
		mstPruneDepth?: number;
		skeletonBackboneOnly?: boolean;
		mstLeafOpacity?: number;
		mstLeafWidthScale?: number;
	};
	profileSettings?: ProfileSettings;
	ambientPush?: AmbientPushSettings;
	usageTrackingEnabled: boolean;
	usageDetailRetentionDays: number;
	/**
	 * Whether dashboard surfaces (e.g. History "What was this about" panel) may
	 * render the prompt / response previews captured in `usage_log.metadata_json`.
	 * Default true. Spec §11.7 — users who want raw audit data only can flip
	 * this off; the underlying preview fields stay in DB but the UI suppresses
	 * them.
	 */
	usagePreviewEnabled?: boolean;

	/** External MCP server connections (stdio/SSE). */
	mcpServers?: MCPServerConfig[];

	/** Vault folder for user-defined skills (default: _skills). */
	skillsFolder?: string;

	/** Vault folder for quick-captured notes (default: _inbox). */
	inboxFolder?: string;

	/** Vault folder for user-defined custom prompts (default: _prompts). */
	customPromptsFolder?: string;

	/** Self-hosted agent harness configuration. */
	harnessSettings?: HarnessSettings;

	vaultSearch?: {
		sdkProfile?: {
			kind?: 'anthropic' | 'openai' | 'google' | 'perplexity' | 'ollama' | 'openrouter' | 'litellm' | 'custom';
			baseUrl?: string;
			apiKey?: string | null;
			primaryModel?: string;
			fastModel?: string;
			customHeaders?: Record<string, string>;
		};
	};
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	dataStorageFolder: 'A-control/PeakAssistant/DataStore',
	ai: DEFAULT_AI_SERVICE_SETTINGS,
	search: DEFAULT_SEARCH_SETTINGS,
	sqliteBackend: 'auto',
	enableDevTools: false,
	ambientPush: undefined,
	harnessSettings: { ...DEFAULT_HARNESS_SETTINGS },
	graphViz: {
		mstPruneDepth: 2,
		skeletonBackboneOnly: false,
		mstLeafOpacity: 0.25,
		mstLeafWidthScale: 0.6,
	},
	usageTrackingEnabled: true,
	usageDetailRetentionDays: 30,
	usagePreviewEnabled: true,
	vaultSearch: {
		sdkProfile: {
			kind: 'anthropic',
			baseUrl: 'https://api.anthropic.com',
			primaryModel: 'claude-sonnet-4-6',
			fastModel: 'claude-haiku-4-5',
		},
	},
};
