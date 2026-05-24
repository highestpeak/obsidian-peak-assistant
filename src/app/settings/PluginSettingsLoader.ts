import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS, DEFAULT_HARNESS_SETTINGS, DEFAULT_SEARCH_SETTINGS, DEFAULT_SETTINGS, HarnessSettings, MyPluginSettings, SearchSettings } from '@/app/settings/types';
import { ProviderConfig, LLMOutputControlSettings } from '@/core/providers/types';
import { DEFAULT_AMBIENT_PUSH_SETTINGS, type AmbientPushSettings } from '@/service/ambient/types';
import { DEFAULT_SDK_SETTINGS } from '@/core/profiles/types';

/**
 * Get string value from source or return default.
 */
function getString(source: unknown, defaultValue: string): string {
	return typeof source === 'string' ? source : defaultValue;
}

/**
 * Get boolean value from source or return default.
 */
function getBoolean(source: unknown, defaultValue: boolean): boolean {
	return typeof source === 'boolean' ? source : defaultValue;
}

/**
 * Normalize AI service settings from raw data.
 */
function normalizeAIServiceSettings(raw: Record<string, unknown>): AIServiceSettings {
	const rawAI = raw?.ai as Partial<AIServiceSettings> | undefined;
	if (!rawAI || typeof rawAI !== 'object') {
		return { ...DEFAULT_AI_SERVICE_SETTINGS };
	}

	const settings = { ...DEFAULT_AI_SERVICE_SETTINGS };

	settings.rootFolder = getString(rawAI.rootFolder, settings.rootFolder);

	// Default model
	if (rawAI.defaultModel && typeof rawAI.defaultModel === 'object') {
		const model = rawAI.defaultModel as { provider?: unknown; modelId?: unknown };
		settings.defaultModel = {
			provider: getString(model.provider, settings.defaultModel.provider),
			modelId: getString(model.modelId, settings.defaultModel.modelId),
		};
	}

	// Analysis model (optional override for AI Analysis prompts)
	if (rawAI.analysisModel && typeof rawAI.analysisModel === 'object') {
		const model = rawAI.analysisModel as { provider?: unknown; modelId?: unknown };
		const provider = typeof model.provider === 'string' ? model.provider : undefined;
		const modelId = typeof model.modelId === 'string' ? model.modelId : undefined;
		if (provider && modelId) {
			settings.analysisModel = { provider, modelId };
		}
	}

	// Provider configs
	if (rawAI.llmProviderConfigs && typeof rawAI.llmProviderConfigs === 'object') {
		settings.llmProviderConfigs = rawAI.llmProviderConfigs as Record<string, ProviderConfig>;
	}

	// Profile settings
	settings.profileEnabled = getBoolean(rawAI.profileEnabled, settings.profileEnabled ?? true);

	// Prompt model map — merge saved entries ON TOP of defaults (so new PromptIds get default models)
	if (rawAI.promptModelMap && typeof rawAI.promptModelMap === 'object') {
		settings.promptModelMap = {
			...settings.promptModelMap,
			...rawAI.promptModelMap as Partial<Record<string, { provider: string; modelId: string }>>,
		};
	}

	// Default output control settings
	if (rawAI.defaultOutputControl && typeof rawAI.defaultOutputControl === 'object') {
		settings.defaultOutputControl = rawAI.defaultOutputControl as LLMOutputControlSettings;
	}

	return settings;
}

/**
 * Normalize search settings from raw data.
 */
function normalizeSearchSettings(raw: Record<string, unknown>): SearchSettings {
	const rawSearch = raw?.search as Partial<SearchSettings> | undefined;
	if (!rawSearch || typeof rawSearch !== 'object') {
		return { ...DEFAULT_SEARCH_SETTINGS };
	}

	const settings = { ...DEFAULT_SEARCH_SETTINGS };

	// Auto index
	settings.autoIndex = getBoolean(rawSearch.autoIndex, settings.autoIndex);

	// Include document types
	if (rawSearch.includeDocumentTypes && typeof rawSearch.includeDocumentTypes === 'object') {
		settings.includeDocumentTypes = {
			...DEFAULT_SEARCH_SETTINGS.includeDocumentTypes,
			...(rawSearch.includeDocumentTypes as Record<string, boolean>),
		};
	}

	// Ignore patterns
	if (Array.isArray(rawSearch.ignorePatterns)) {
		settings.ignorePatterns = rawSearch.ignorePatterns as string[];
	}

	// Chunking settings
	if (rawSearch.chunking && typeof rawSearch.chunking === 'object') {
		const rawChunking = rawSearch.chunking as Partial<typeof DEFAULT_SEARCH_SETTINGS.chunking>;
		settings.chunking = {
			...DEFAULT_SEARCH_SETTINGS.chunking,
			maxChunkSize: typeof rawChunking.maxChunkSize === 'number' ? rawChunking.maxChunkSize : DEFAULT_SEARCH_SETTINGS.chunking.maxChunkSize,
			chunkOverlap: typeof rawChunking.chunkOverlap === 'number' ? rawChunking.chunkOverlap : DEFAULT_SEARCH_SETTINGS.chunking.chunkOverlap,
			minDocumentSizeForChunking: typeof rawChunking.minDocumentSizeForChunking === 'number' ? rawChunking.minDocumentSizeForChunking : DEFAULT_SEARCH_SETTINGS.chunking.minDocumentSizeForChunking,
			skipCodeBlocksInChunking:
				typeof rawChunking.skipCodeBlocksInChunking === 'boolean'
					? rawChunking.skipCodeBlocksInChunking
					: DEFAULT_SEARCH_SETTINGS.chunking.skipCodeBlocksInChunking,
			codeBlockPlaceholder:
				typeof rawChunking.codeBlockPlaceholder === 'string'
					? rawChunking.codeBlockPlaceholder
					: DEFAULT_SEARCH_SETTINGS.chunking.codeBlockPlaceholder,
			maxCodeChunkChars:
				typeof rawChunking.maxCodeChunkChars === 'number'
					? rawChunking.maxCodeChunkChars
					: DEFAULT_SEARCH_SETTINGS.chunking.maxCodeChunkChars,
		};

		// Embedding model
		if (rawChunking.embeddingModel && typeof rawChunking.embeddingModel === 'object') {
			const model = rawChunking.embeddingModel as { provider?: unknown; modelId?: unknown };
			const provider = getString(model.provider, '');
			const modelId = getString(model.modelId, '');
			if (provider && modelId) {
				settings.chunking.embeddingModel = { provider, modelId };
			}
		}
	}

	// AI analysis model
	if (rawSearch.aiAnalysisModel && typeof rawSearch.aiAnalysisModel === 'object') {
		const aiAnalysis = rawSearch.aiAnalysisModel as {
			thoughtAgentModel?: { provider?: unknown; modelId?: unknown };
			searchAgentModel?: { provider?: unknown; modelId?: unknown };
		};

		settings.aiAnalysisModel = {};

		// Thought agent model
		if (aiAnalysis.thoughtAgentModel && typeof aiAnalysis.thoughtAgentModel === 'object') {
			const model = aiAnalysis.thoughtAgentModel as { provider?: unknown; modelId?: unknown };
			const provider = getString(model.provider, '');
			const modelId = getString(model.modelId, '');
			if (provider && modelId) {
				settings.aiAnalysisModel.thoughtAgentModel = { provider, modelId };
			}
		}

		// Search agent model
		if (aiAnalysis.searchAgentModel && typeof aiAnalysis.searchAgentModel === 'object') {
			const model = aiAnalysis.searchAgentModel as { provider?: unknown; modelId?: unknown };
			const provider = getString(model.provider, '');
			const modelId = getString(model.modelId, '');
			if (provider && modelId) {
				settings.aiAnalysisModel.searchAgentModel = { provider, modelId };
			}
		}

		// If no models were set, use default values
		if (!settings.aiAnalysisModel.thoughtAgentModel && !settings.aiAnalysisModel.searchAgentModel) {
			settings.aiAnalysisModel = { ...DEFAULT_SEARCH_SETTINGS.aiAnalysisModel };
		}
	}

	// Index refresh interval
	if (typeof rawSearch.indexRefreshInterval === 'number') {
		settings.indexRefreshInterval = rawSearch.indexRefreshInterval;
	}

	// Summary lengths
	if (typeof rawSearch.shortSummaryLength === 'number') {
		settings.shortSummaryLength = Math.max(50, Math.min(500, rawSearch.shortSummaryLength));
	}
	if (typeof rawSearch.fullSummaryLength === 'number') {
		settings.fullSummaryLength = Math.max(500, Math.min(10000, rawSearch.fullSummaryLength));
	}

	// AI analysis session summary word count
	if (typeof (rawSearch as any).aiAnalysisSessionSummaryWordCount === 'number') {
		settings.aiAnalysisSessionSummaryWordCount = Math.max(200, Math.min(5000, (rawSearch as any).aiAnalysisSessionSummaryWordCount));
	}

	// Auto-save AI analysis results
	if (typeof (rawSearch as any).aiAnalysisAutoSaveEnabled === 'boolean') {
		settings.aiAnalysisAutoSaveEnabled = (rawSearch as any).aiAnalysisAutoSaveEnabled;
	}
	if (typeof (rawSearch as any).aiAnalysisAutoSaveFolder === 'string') {
		settings.aiAnalysisAutoSaveFolder = (rawSearch as any).aiAnalysisAutoSaveFolder;
	}
	if (typeof (rawSearch as any).aiAnalysisExcludeAutoSaveFolderFromSearch === 'boolean') {
		settings.aiAnalysisExcludeAutoSaveFolderFromSearch = (rawSearch as any).aiAnalysisExcludeAutoSaveFolderFromSearch;
	}
	if (typeof (rawSearch as any).aiAnalysisHistoryLimit === 'number') {
		settings.aiAnalysisHistoryLimit = Math.max(1, Math.min(50, (rawSearch as any).aiAnalysisHistoryLimit));
	}

	// indexLevel: restore persisted value or keep default 'fast'
	const rawIndexLevel = (rawSearch as any).indexLevel;
	if (rawIndexLevel === 'fast' || rawIndexLevel === 'semantic' || rawIndexLevel === 'full') {
		settings.indexLevel = rawIndexLevel;
	}

	// searchUpgradePromptDismissedAt: restore persisted value
	const rawDismissed = (rawSearch as any).searchUpgradePromptDismissedAt;
	if (typeof rawDismissed === 'number' || rawDismissed === null) {
		settings.searchUpgradePromptDismissedAt = rawDismissed;
	}

	// enablePPR: restore persisted value or keep default
	settings.enablePPR = getBoolean((rawSearch as any).enablePPR, settings.enablePPR);

	return settings;
}

/**
 * Load and normalize plugin settings from persisted data.
 * Only extracts needed fields, ignoring legacy/unused fields.
 */
export function normalizePluginSettings(data: unknown): MyPluginSettings {
	const raw = (data ?? {}) as Record<string, unknown>;

	// Build settings object explicitly, only extracting needed fields
	const settings: MyPluginSettings = {
		// General folder settings
		dataStorageFolder: getString(raw?.dataStorageFolder, DEFAULT_SETTINGS.dataStorageFolder),

		// Core settings (normalized)
		ai: normalizeAIServiceSettings(raw),
		search: normalizeSearchSettings(raw),
	};

	// SQLite backend setting
	const sqliteBackend = raw?.sqliteBackend;
	if (sqliteBackend === 'auto' || sqliteBackend === 'better-sqlite3') {
		settings.sqliteBackend = sqliteBackend;
	}

	// Dev tools setting
	settings.enableDevTools = getBoolean(raw?.enableDevTools, false);

	// Ambient Push settings
	const rawAmbient = raw?.ambientPush as Partial<AmbientPushSettings> | undefined;
	if (rawAmbient && typeof rawAmbient === 'object') {
		settings.ambientPush = {
			enabled: getBoolean(rawAmbient.enabled, DEFAULT_AMBIENT_PUSH_SETTINGS.enabled),
			triggerCooldownMs:
				typeof rawAmbient.triggerCooldownMs === 'number'
					? Math.max(1000, rawAmbient.triggerCooldownMs)
					: DEFAULT_AMBIENT_PUSH_SETTINGS.triggerCooldownMs,
			docSwitchCooldownMs:
				typeof rawAmbient.docSwitchCooldownMs === 'number'
					? Math.max(1000, rawAmbient.docSwitchCooldownMs)
					: DEFAULT_AMBIENT_PUSH_SETTINGS.docSwitchCooldownMs,
			writingPauseMs:
				typeof rawAmbient.writingPauseMs === 'number'
					? Math.max(1000, rawAmbient.writingPauseMs)
					: DEFAULT_AMBIENT_PUSH_SETTINGS.writingPauseMs,
			minCharDelta:
				typeof rawAmbient.minCharDelta === 'number'
					? Math.max(1, rawAmbient.minCharDelta)
					: DEFAULT_AMBIENT_PUSH_SETTINGS.minCharDelta,
			maxPushItems:
				typeof rawAmbient.maxPushItems === 'number'
					? Math.max(1, Math.min(20, rawAmbient.maxPushItems))
					: DEFAULT_AMBIENT_PUSH_SETTINGS.maxPushItems,
			showStatusBar: getBoolean(rawAmbient.showStatusBar, DEFAULT_AMBIENT_PUSH_SETTINGS.showStatusBar),
			graphExpansionHops:
				typeof rawAmbient.graphExpansionHops === 'number'
					? rawAmbient.graphExpansionHops
					: DEFAULT_AMBIENT_PUSH_SETTINGS.graphExpansionHops,
			feedbackLearning:
				typeof rawAmbient.feedbackLearning === 'boolean'
					? rawAmbient.feedbackLearning
					: DEFAULT_AMBIENT_PUSH_SETTINGS.feedbackLearning,
			enableLlmExplanation: getBoolean(rawAmbient.enableLlmExplanation, DEFAULT_AMBIENT_PUSH_SETTINGS.enableLlmExplanation),
			llmExplanationCooldownMs:
				typeof rawAmbient.llmExplanationCooldownMs === 'number'
					? rawAmbient.llmExplanationCooldownMs
					: DEFAULT_AMBIENT_PUSH_SETTINGS.llmExplanationCooldownMs,
			enableSerendipityGutter: getBoolean(rawAmbient.enableSerendipityGutter, DEFAULT_AMBIENT_PUSH_SETTINGS.enableSerendipityGutter),
			enableMorningBriefing: getBoolean(rawAmbient.enableMorningBriefing, DEFAULT_AMBIENT_PUSH_SETTINGS.enableMorningBriefing),
			autoOpenedPanel: getBoolean(rawAmbient.autoOpenedPanel, DEFAULT_AMBIENT_PUSH_SETTINGS.autoOpenedPanel),
		};
	}

	// Profile v2: load existing profileSettings or initialize empty.
	const rawProfileSettings = raw?.profileSettings;
	if (rawProfileSettings && typeof rawProfileSettings === 'object') {
		settings.profileSettings = rawProfileSettings as any;
		// Migrate legacy authToken → apiKey (authToken field was removed)
		for (const p of settings.profileSettings.profiles) {
			if ((p as any).authToken && !p.apiKey) {
				p.apiKey = (p as any).authToken;
			}
			delete (p as any).authToken;
		}
	} else {
		settings.profileSettings = {
			profiles: [],
			activeAgentConfig: null,
			activeAgentFastConfig: null,
			activeChatConfig: null,
			activeCopilotConfig: null,
			activeEmbeddingConfig: null,
			activeWebSearchConfig: null,
			sdkSettings: DEFAULT_SDK_SETTINGS,
		};
	}

	// Usage tracking settings
	settings.usageTrackingEnabled = getBoolean(raw?.usageTrackingEnabled, DEFAULT_SETTINGS.usageTrackingEnabled);
	settings.usageDetailRetentionDays = typeof raw?.usageDetailRetentionDays === 'number'
		? Math.max(1, raw.usageDetailRetentionDays)
		: DEFAULT_SETTINGS.usageDetailRetentionDays;

	// Harness settings (M5)
	const rawHarness = raw?.harnessSettings as Partial<HarnessSettings> | undefined;
	if (rawHarness && typeof rawHarness === 'object') {
		const d = DEFAULT_HARNESS_SETTINGS;
		settings.harnessSettings = {
			agentBackend: (rawHarness.agentBackend === 'auto' || rawHarness.agentBackend === 'harness' || rawHarness.agentBackend === 'claude-agent-sdk')
				? rawHarness.agentBackend
				: d.agentBackend,
			localFastConfig: rawHarness.localFastConfig ?? d.localFastConfig,
			localDeepConfig: rawHarness.localDeepConfig ?? d.localDeepConfig,
			onlineConfig: rawHarness.onlineConfig ?? d.onlineConfig,
			allowEscalation: typeof rawHarness.allowEscalation === 'boolean' ? rawHarness.allowEscalation : d.allowEscalation,
			maxEscalationsPerLoop: typeof rawHarness.maxEscalationsPerLoop === 'number'
				? Math.max(1, Math.min(3, rawHarness.maxEscalationsPerLoop))
				: d.maxEscalationsPerLoop,
			autoEscalateScoreBelow: typeof rawHarness.autoEscalateScoreBelow === 'number'
				? Math.max(0, Math.min(1, rawHarness.autoEscalateScoreBelow))
				: d.autoEscalateScoreBelow,
			hooksEnabled: typeof rawHarness.hooksEnabled === 'boolean' ? rawHarness.hooksEnabled : d.hooksEnabled,
			defaultPermissionMode: (rawHarness.defaultPermissionMode === 'read' || rawHarness.defaultPermissionMode === 'acceptEdits' || rawHarness.defaultPermissionMode === 'bypassPermissions')
				? rawHarness.defaultPermissionMode
				: d.defaultPermissionMode,
		};
	} else {
		settings.harnessSettings = { ...DEFAULT_HARNESS_SETTINGS };
	}

	return settings;
}
