// T11J A2: Pure plugin-settings data shapes + defaults. The app-side
// `src/app/settings/types.ts` re-exports these and adds backward-compat
// helper wrappers that read `AppContext.getInstance()`; nothing in core or
// service may import `AppContext` to read settings.

import { ProviderConfig, LLMOutputControlSettings } from '@/core/providers/types';
import type { DocumentType } from '@/core/document/types';
import { PromptId, CONFIGURABLE_PROMPT_IDS, INDEXING_AND_HUB_PROMPT_IDS, SEARCH_AI_ANALYSIS_PROMPT_IDS } from '@/core/types/prompt';
import type { ProfileSettings, RoleConfig } from '@/core/profiles/types';
import type { AmbientPushSettings } from '@/core/types/ambient';
import type { MCPServerConfig } from '@/core/types/mcp';
import type { IndexLevel } from '@/core/search/indexTypes';
import {
	DEFAULT_AI_ROOT_FOLDER,
	getAIAnalysisFolder,
	getAICustomPromptsFolder,
	getAIDataStoreFolder,
	getAIInboxFolder,
	getAISkillsFolder,
} from '@/core/config/folderPaths';

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
	/**
	 * Opt-in scheduled Hub Curation runs. When true, HubCurationScheduler runs
	 * the Curator agent every `hubCurationIntervalDays` days at startup.
	 * See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 10.
	 */
	hubCurationSchedulerEnabled: boolean;
	/** Interval (days) between scheduled Hub Curation runs. Default: 7. */
	hubCurationIntervalDays: number;
	/**
	 * Compile natural-language search queries into Hyper Search syntax via
	 * an LLM before running the retriever pipeline. Off by default — adds
	 * a fast-role LLM round-trip; falls back to raw text on any failure so
	 * search never breaks. See `src/service/search/query/aiQueryParser.ts`.
	 */
	useAiQueryParser: boolean;
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
		'.git/', 'node_modules/', '.obsidian/',
		`${getAIDataStoreFolder(DEFAULT_AI_ROOT_FOLDER)}/`,
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
	aiAnalysisAutoSaveFolder: getAIAnalysisFolder(DEFAULT_AI_ROOT_FOLDER),
	aiAnalysisExcludeAutoSaveFolderFromSearch: true,
	aiAnalysisHistoryLimit: 5,
	inspectorLinks: DEFAULT_INSPECTOR_LINKS_SETTINGS,
	indexLevel: 'fast' as IndexLevel,
	searchUpgradePromptDismissedAt: null,
	enablePPR: true,
	hubCurationSchedulerEnabled: false,
	hubCurationIntervalDays: 7,
	useAiQueryParser: false,
};

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
	/**
	 * fal.ai API key for the D4 Multimodal Media Ring (TTS + image + video).
	 * See docs/superpowers/plans/2026-07-03-full-backlog-execution-plan.md §D4.
	 */
	falApiKey?: string;
	/** Vault-relative folder where MediaRingService writes generated attachments. Default: `_attachments/media`. */
	mediaAttachmentFolder?: string;
}

export const DEFAULT_AI_SERVICE_SETTINGS: AIServiceSettings = {
	rootFolder: DEFAULT_AI_ROOT_FOLDER,
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
	falApiKey: '',
	mediaAttachmentFolder: '_attachments/media',
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
 * - 'auto'    — prefer self-hosted harness. All Vault Search / Continue
 *               Analysis rounds now route through `runAgentLoop`.
 * - 'harness' — always use the self-hosted loop (local models).
 *
 * The `'claude-agent-sdk'` backend was retired in 2026-07 alongside the
 * Chat/Agent/Plan mode picker (spec: docs/superpowers/specs/2026-07-03-cloud-sdk-and-mode-choice-audit.md).
 * The SDK stays imported as a library for one-shot LLM callers and the
 * in-process MCP tool plumbing (`vaultMcpServer`, `webSearchTool`, etc.),
 * but the Vault Search main path no longer touches `queryWithProfile` —
 * see docs/superpowers/specs/2026-07-04-vault-search-harness-native-migration.md.
 */
export type AgentBackend = 'auto' | 'harness';

/**
 * Closed enum of alert rule kinds shipped in the mock Budget & Alerts surface.
 * Each kind maps to a distinct carrier (notification / inline chat / receipt /
 * per-message pip), with `threshold` interpreted per kind.
 */
export type BudgetAlertRuleKind =
	| 'budget_threshold'      // notify when monthly spend ≥ threshold (% of budget)
	| 'context_compact'        // suggest compact when context ratio ≥ threshold (0..1)
	| 'agent_receipt'          // post-task receipt when call cost ≥ threshold (USD) or tokens ≥ tokenThreshold
	| 'silence_low_cost_pip';  // hide per-message pip when call cost < threshold (USD)

export interface BudgetAlertRule {
	kind: BudgetAlertRuleKind;
	enabled: boolean;
	threshold: number;
	tokenThreshold?: number;
}

export interface BudgetSettings {
	/** Monthly spending target in USD. 0 = no budget (pace bar hidden). Default 40. */
	monthlyUsd: number;
	/** Day-of-month the budget cycle resets. 1..28. Default 1. */
	resetDayOfMonth: number;
	/** Alert rules surfaced in the dashboard "What users will see" preview. */
	alertRules: BudgetAlertRule[];
}

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
	monthlyUsd: 40,
	resetDayOfMonth: 1,
	alertRules: [
		{ kind: 'budget_threshold', enabled: true, threshold: 0.4 },
		{ kind: 'context_compact', enabled: true, threshold: 0.7 },
		{ kind: 'agent_receipt', enabled: true, threshold: 0.15, tokenThreshold: 50_000 },
		{ kind: 'silence_low_cost_pip', enabled: false, threshold: 0.0005 },
	],
};

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
	/** Monthly budget + alert rule guardrails driving the Budget & Alerts dashboard surface. */
	budget: BudgetSettings;
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
	budget: { ...DEFAULT_BUDGET_SETTINGS, alertRules: DEFAULT_BUDGET_SETTINGS.alertRules.map((r) => ({ ...r })) },
};

export interface MyPluginSettings {
	dataStorageFolder: string;
	ai: AIServiceSettings;
	search: SearchSettings;
	sqliteBackend?: 'auto' | 'better-sqlite3';
	enableDevTools?: boolean;
	/** Syntax colour palette used by fenced code blocks in rich AI messages. */
	codeBlockTheme?: CodeBlockThemeId;
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

	/** Vault folder for user-defined skills. Defaults under ai.rootFolder. */
	skillsFolder?: string;

	/** Vault folder for quick-captured notes. Defaults under ai.rootFolder. */
	inboxFolder?: string;

	/** Vault folder for user-defined custom prompts. Defaults under ai.rootFolder. */
	customPromptsFolder?: string;

	/** Self-hosted agent harness configuration. */
	harnessSettings?: HarnessSettings;

	/** Debug Trace Infrastructure (see docs/superpowers/specs/debug-trace-infrastructure.md). */
	debugTrace?: DebugTraceSettings;

}

/**
 * Debug Trace Infrastructure settings. Default: recorder off. Users opt in
 * from Settings → Advanced → Developer → Debug traces.
 *
 * Retention is a numeric ring-buffer size; `'session'` maps to
 * `Number.POSITIVE_INFINITY` in the recorder (no automatic eviction until
 * `Clear all debug traces` or plugin restart).
 */
export interface DebugTraceSettings {
	mode: 'off' | 'redacted' | 'raw';
	retention: 20 | 100 | 'session';
	copyFormat: 'markdown' | 'json' | 'both';
	/**
	 * Only meaningful when `mode='raw'`. When true, the Copy affordance
	 * renders the raw payloads inline; when false, only excerpts.
	 */
	includeRawContent: boolean;
}

export const DEFAULT_DEBUG_TRACE_SETTINGS: DebugTraceSettings = {
	mode: 'off',
	retention: 20,
	copyFormat: 'markdown',
	includeRawContent: false,
};

/**
 * Curated Shiki themes exposed by Settings. Code blocks intentionally use one
 * explicit dark palette in both app themes so Obsidian's theme and the OS
 * colour scheme cannot select different syntax colours for the same message.
 */
export const CODE_BLOCK_THEME_IDS = [
	'github-dark',
	'one-dark-pro',
	'nord',
	'dracula',
	'vitesse-dark',
] as const;

export type CodeBlockThemeId = typeof CODE_BLOCK_THEME_IDS[number];

export const DEFAULT_CODE_BLOCK_THEME: CodeBlockThemeId = 'github-dark';

export function normalizeCodeBlockTheme(value: unknown): CodeBlockThemeId {
	if (typeof value !== 'string') return DEFAULT_CODE_BLOCK_THEME;
	if ((CODE_BLOCK_THEME_IDS as readonly string[]).includes(value)) return value as CodeBlockThemeId;
	return DEFAULT_CODE_BLOCK_THEME;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	dataStorageFolder: getAIDataStoreFolder(DEFAULT_AI_SERVICE_SETTINGS.rootFolder),
	ai: DEFAULT_AI_SERVICE_SETTINGS,
	search: DEFAULT_SEARCH_SETTINGS,
	sqliteBackend: 'auto',
	enableDevTools: false,
	codeBlockTheme: DEFAULT_CODE_BLOCK_THEME,
	ambientPush: undefined,
	harnessSettings: { ...DEFAULT_HARNESS_SETTINGS },
	debugTrace: { ...DEFAULT_DEBUG_TRACE_SETTINGS },
	graphViz: {
		mstPruneDepth: 2,
		skeletonBackboneOnly: false,
		mstLeafOpacity: 0.25,
		mstLeafWidthScale: 0.6,
	},
	usageTrackingEnabled: true,
	usageDetailRetentionDays: 30,
	usagePreviewEnabled: true,
	skillsFolder: getAISkillsFolder(DEFAULT_AI_SERVICE_SETTINGS.rootFolder),
	inboxFolder: getAIInboxFolder(DEFAULT_AI_SERVICE_SETTINGS.rootFolder),
	customPromptsFolder: getAICustomPromptsFolder(DEFAULT_AI_SERVICE_SETTINGS.rootFolder),
};
