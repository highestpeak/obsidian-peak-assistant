import {
	AIServiceSettings,
	DEFAULT_AI_SERVICE_SETTINGS,
	DEFAULT_DEBUG_TRACE_SETTINGS,
	DEFAULT_HARNESS_SETTINGS,
	DEFAULT_INDEX_MAINTENANCE_SETTINGS,
	DEFAULT_MODEL_CATALOG_SETTINGS,
	DEFAULT_PRODUCT_MODEL_ROUTING,
	DEFAULT_SEARCH_SETTINGS,
	DEFAULT_SETTINGS,
	DebugTraceSettings,
	HarnessSettings,
	MyPluginSettings,
	SearchSettings,
	normalizeCodeBlockTheme,
} from '@/core/config/settingsTypes';
import { ProviderConfig, LLMOutputControlSettings } from '@/core/providers/types';
import { DEFAULT_AMBIENT_PUSH_SETTINGS, type AmbientPushSettings } from '@/core/types/ambient';
import type { ProfileSettings } from '@/core/profiles/types';
import type {
	PluginCommandCurationFinding,
	PluginCommandGatewaySettings,
	PluginCommandPurpose,
	PluginCommandReview,
	PluginCommandRisk,
} from '@/core/types/plugin-command-gateway';
import { normalizeComposerContentWidth } from '@/core/composer';
import {
	getAIAnalysisFolder,
	getAICustomPromptsFolder,
	getAIDataStoreFolder,
	getAIInboxFolder,
	getAISkillsFolder,
	LEGACY_FOLDER_DEFAULTS,
	resolveFolderSetting,
} from '@/core/config/folderPaths';

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

function ensureIgnoredFolder(patterns: string[], folder: string): string[] {
	const normalized = folder.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
	if (!normalized) return patterns;
	const folderPattern = `${normalized}/`;
	const exists = patterns.some((pattern) => {
		const p = pattern.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
		return p === normalized || p === `${normalized}/**`;
	});
	return exists ? patterns : [...patterns, folderPattern];
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

	// Provider configs
	if (rawAI.llmProviderConfigs && typeof rawAI.llmProviderConfigs === 'object') {
		settings.llmProviderConfigs = rawAI.llmProviderConfigs as Record<string, ProviderConfig>;
	}

	// Profile settings
	settings.profileEnabled = getBoolean(rawAI.profileEnabled, settings.profileEnabled ?? true);
	if (rawAI.attachmentHandlingDefault === 'direct' || rawAI.attachmentHandlingDefault === 'degrade_to_text') {
		settings.attachmentHandlingDefault = rawAI.attachmentHandlingDefault;
	}

	// Default output control settings
	if (rawAI.defaultOutputControl && typeof rawAI.defaultOutputControl === 'object') {
		settings.defaultOutputControl = rawAI.defaultOutputControl as LLMOutputControlSettings;
	}

	// D4 / Task E1 — fal.ai API key + attachment folder + media overrides.
	// Previously silently dropped by normalize; users' saved values were lost
	// on next boot. Compat: absent → default (empty key / default folder).
	if (typeof rawAI.falApiKey === 'string') {
		settings.falApiKey = rawAI.falApiKey;
	}
	if (typeof rawAI.mediaAttachmentFolder === 'string') {
		settings.mediaAttachmentFolder = rawAI.mediaAttachmentFolder;
	}
	if (rawAI.mediaDefaults && typeof rawAI.mediaDefaults === 'object') {
		settings.mediaDefaults = normalizeMediaOverride(rawAI.mediaDefaults as Record<string, unknown>);
	}

	return settings;
}

/**
 * Task E1 — narrow-safe normalize for the media overlay. Silently drops
 * unknown route values / non-string preset ids so a hand-edited data.json
 * cannot break boot. Returns an empty object when every field is invalid;
 * callers treat `undefined`-equivalent shape as "no overrides".
 */
function normalizeMediaOverride(raw: Record<string, unknown>): AIServiceSettings['mediaDefaults'] {
	const out: NonNullable<AIServiceSettings['mediaDefaults']> = {};
	const route = raw.defaultRoute;
	if (route === 'auto' || route === 'native' || route === 'fal') {
		out.defaultRoute = route;
	}
	if (typeof raw.nativeProfileId === 'string' && raw.nativeProfileId.trim().length > 0) {
		out.nativeProfileId = raw.nativeProfileId.trim();
	}
	if (raw.defaultPresetIds && typeof raw.defaultPresetIds === 'object') {
		const src = raw.defaultPresetIds as Record<string, unknown>;
		const dst: Record<string, string> = {};
		for (const kind of ['image', 'video', 'music', 'tts'] as const) {
			const value = src[kind];
			if (typeof value === 'string' && value.trim().length > 0) dst[kind] = value.trim();
		}
		if (Object.keys(dst).length > 0) out.defaultPresetIds = dst as NonNullable<typeof out.defaultPresetIds>;
	}
	if (raw.presetOverrides && typeof raw.presetOverrides === 'object') {
		const src = raw.presetOverrides as Record<string, unknown>;
		const dst: NonNullable<typeof out.presetOverrides> = {};
		for (const kind of ['image', 'video', 'music', 'tts'] as const) {
			const val = src[kind];
			if (!val || typeof val !== 'object') continue;
			const v = val as Record<string, unknown>;
			const entry: NonNullable<NonNullable<typeof out.presetOverrides>['image']> = {};
			if (typeof v.model === 'string' && v.model.trim().length > 0) entry.model = v.model.trim();
			if (typeof v.aspectRatio === 'string') entry.aspectRatio = v.aspectRatio;
			if (typeof v.quantity === 'number' && v.quantity > 0) entry.quantity = Math.max(1, Math.min(16, Math.floor(v.quantity)));
			if (typeof v.durationSeconds === 'number' && v.durationSeconds > 0) entry.durationSeconds = v.durationSeconds;
			if (typeof v.maxDurationSeconds === 'number' && v.maxDurationSeconds > 0) entry.maxDurationSeconds = v.maxDurationSeconds;
			if (typeof v.voice === 'string' && v.voice.trim().length > 0) entry.voice = v.voice.trim();
			if (Object.keys(entry).length > 0) dst[kind] = entry;
		}
		if (Object.keys(dst).length > 0) out.presetOverrides = dst;
	}
	if (typeof raw.lastValidatedAt === 'number' && Number.isFinite(raw.lastValidatedAt)) {
		out.lastValidatedAt = raw.lastValidatedAt;
	}
	return out;
}

/**
 * Normalize search settings from raw data.
 */
function normalizeSearchSettings(raw: Record<string, unknown>, rootFolder: string, dataStorageFolder: string): SearchSettings {
	const defaults: SearchSettings = {
		...DEFAULT_SEARCH_SETTINGS,
		aiAnalysisAutoSaveFolder: getAIAnalysisFolder(rootFolder),
	};
	const rawSearch = raw?.search as Partial<SearchSettings> | undefined;
	if (!rawSearch || typeof rawSearch !== 'object') {
		return {
			...defaults,
			ignorePatterns: ensureIgnoredFolder(defaults.ignorePatterns, dataStorageFolder),
		};
	}

	const settings = { ...defaults };

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
	if (Array.isArray(rawSearch.includeFolders)) {
		settings.includeFolders = rawSearch.includeFolders.filter((value): value is string => typeof value === 'string');
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

	// Personalized PageRank reranking was retired. Do not revive a legacy
	// persisted toggle during migration.
	settings.enablePPR = false;

	const rawMaintenance = rawSearch.maintenance;
	if (rawMaintenance && typeof rawMaintenance === 'object') {
		const source = rawMaintenance as Partial<typeof DEFAULT_INDEX_MAINTENANCE_SETTINGS>;
		settings.maintenance = {
			changeDebounceMs: typeof source.changeDebounceMs === 'number'
				? Math.max(0, Math.min(60_000, source.changeDebounceMs))
				: typeof (rawSearch as any).indexRefreshInterval === 'number'
					? Math.max(0, Math.min(60_000, (rawSearch as any).indexRefreshInterval))
					: DEFAULT_INDEX_MAINTENANCE_SETTINGS.changeDebounceMs,
			onStartup: source.onStartup === 'prompt' || source.onStartup === 'nothing'
				? source.onStartup
				: 'changed-files',
			largeChangeSetThreshold: typeof source.largeChangeSetThreshold === 'number'
				? Math.max(1, Math.floor(source.largeChangeSetThreshold))
				: DEFAULT_INDEX_MAINTENANCE_SETTINGS.largeChangeSetThreshold,
			batchSize: typeof source.batchSize === 'number'
				? Math.max(1, Math.min(500, Math.floor(source.batchSize)))
				: DEFAULT_INDEX_MAINTENANCE_SETTINGS.batchSize,
			retryAttempts: typeof source.retryAttempts === 'number'
				? Math.max(0, Math.min(10, Math.floor(source.retryAttempts)))
				: DEFAULT_INDEX_MAINTENANCE_SETTINGS.retryAttempts,
		};
	}

	settings.ignorePatterns = ensureIgnoredFolder(settings.ignorePatterns, dataStorageFolder);

	return settings;
}

function normalizeModelRouting(raw: unknown): MyPluginSettings['modelRouting'] {
	const defaults = DEFAULT_PRODUCT_MODEL_ROUTING;
	if (!raw || typeof raw !== 'object') {
		return {
			...defaults,
			automatic: { ...defaults.automatic },
			assignments: {},
			advancedControls: {},
		};
	}
	const source = raw as Record<string, unknown>;
	const automaticSource = source.automatic && typeof source.automatic === 'object'
		? source.automatic as Record<string, unknown>
		: {};
	const optimizeFor = automaticSource.optimizeFor === 'lower-cost' || automaticSource.optimizeFor === 'higher-quality'
		? automaticSource.optimizeFor
		: 'recommended';
	const processingLocation = automaticSource.processingLocation === 'prefer-local' || automaticSource.processingLocation === 'local-only'
		? automaticSource.processingLocation
		: 'cloud-and-local';
	const assignments: MyPluginSettings['modelRouting']['assignments'] = {};
	if (source.assignments && typeof source.assignments === 'object') {
		for (const [key, value] of Object.entries(source.assignments as Record<string, unknown>)) {
			if (!value || typeof value !== 'object') continue;
			const assignment = value as Record<string, unknown>;
			if (assignment.mode === 'automatic') assignments[key] = { mode: 'automatic' };
			if (assignment.mode !== 'fixed' || !assignment.config || typeof assignment.config !== 'object') continue;
			const config = assignment.config as Record<string, unknown>;
			if (typeof config.profileId !== 'string' || typeof config.modelId !== 'string') continue;
			assignments[key] = { mode: 'fixed', config: { profileId: config.profileId, modelId: config.modelId } };
		}
	}
	const advancedControls = source.advancedControls && typeof source.advancedControls === 'object'
		? source.advancedControls as MyPluginSettings['modelRouting']['advancedControls']
		: {};
	return {
		automatic: { optimizeFor, processingLocation },
		assignments,
		advancedControls,
	};
}

function normalizeModelCatalog(raw: unknown): MyPluginSettings['modelCatalog'] {
	if (!raw || typeof raw !== 'object') {
		return { ...DEFAULT_MODEL_CATALOG_SETTINGS, hiddenModels: [], aliases: {} };
	}
	const source = raw as Record<string, unknown>;
	const aliases: Record<string, string> = {};
	if (source.aliases && typeof source.aliases === 'object') {
		for (const [key, value] of Object.entries(source.aliases as Record<string, unknown>)) {
			if (typeof value === 'string' && value.trim()) aliases[key] = value.trim();
		}
	}
	return {
		hiddenModels: Array.isArray(source.hiddenModels)
			? source.hiddenModels.filter((value): value is string => typeof value === 'string')
			: [],
		aliases,
		openRouterCatalogUrl: typeof source.openRouterCatalogUrl === 'string' ? source.openRouterCatalogUrl : '',
		lastCheckedAt: typeof source.lastCheckedAt === 'number' ? source.lastCheckedAt : null,
		lastModified: typeof source.lastModified === 'string' ? source.lastModified : null,
		etag: typeof source.etag === 'string' ? source.etag : null,
		lastError: typeof source.lastError === 'string' ? source.lastError : null,
		cachedOpenRouterCatalog: normalizeCachedOpenRouterCatalog(source.cachedOpenRouterCatalog),
	};
}

function normalizeCachedOpenRouterCatalog(raw: unknown): MyPluginSettings['modelCatalog']['cachedOpenRouterCatalog'] {
	if (!raw || typeof raw !== 'object') return null;
	const source = raw as Record<string, unknown>;
	if (source.schemaVersion !== 1 || source.provider !== 'openrouter' || !source.models || typeof source.models !== 'object' || Array.isArray(source.models)) return null;
	return {
		schemaVersion: 1,
		provider: 'openrouter',
		models: source.models as Record<string, unknown>,
		catalogVersion: typeof source.catalogVersion === 'string' ? source.catalogVersion : undefined,
	};
}

function normalizeOnboarding(raw: unknown): MyPluginSettings['onboarding'] {
	const fallback = DEFAULT_SETTINGS.onboarding;
	if (!raw || typeof raw !== 'object') return { ...fallback, models: { ...fallback.models } };
	const source = raw as Record<string, unknown>;
	const validSteps = new Set(['connect-ai', 'core-models', 'prepare-vault', 'system-check', 'try-peak']);
	const models = source.models && typeof source.models === 'object' ? source.models as Record<string, unknown> : {};
	const role = (value: unknown): MyPluginSettings['onboarding']['models']['conversation'] => {
		if (!value || typeof value !== 'object') return { mode: 'automatic' };
		const candidate = value as Record<string, unknown>;
		if (candidate.mode === 'automatic') return { mode: 'automatic' };
		if (candidate.mode === 'fixed' && candidate.config && typeof candidate.config === 'object') {
			const config = candidate.config as Record<string, unknown>;
			if (typeof config.profileId === 'string' && typeof config.modelId === 'string') {
				return { mode: 'fixed', config: { profileId: config.profileId, modelId: config.modelId } };
			}
		}
		// Migrate the pre-explicit draft shape without turning a legacy null into
		// an ambiguous state.
		if (typeof candidate.profileId === 'string' && typeof candidate.modelId === 'string') {
			return { mode: 'fixed', config: { profileId: candidate.profileId, modelId: candidate.modelId } };
		}
		return { mode: 'automatic' };
	};
	return {
		step: validSteps.has(String(source.step)) ? source.step as MyPluginSettings['onboarding']['step'] : fallback.step,
		selectedProfileId: typeof source.selectedProfileId === 'string' ? source.selectedProfileId : null,
		models: {
			conversation: role(models.conversation),
			knowledge: role(models.knowledge),
			agent: role(models.agent),
		},
		updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : 0,
		completedAt: typeof source.completedAt === 'number' ? source.completedAt : null,
		firstSuccessAt: typeof source.firstSuccessAt === 'number' ? source.firstSuccessAt : null,
		firstSuccessTarget: ['chat-studio', 'vault-search', 'file-atlas', 'recent-note', 'composer'].includes(String(source.firstSuccessTarget))
			? source.firstSuccessTarget as MyPluginSettings['onboarding']['firstSuccessTarget']
			: null,
	};
}

/**
 * Load and normalize plugin settings from persisted data.
 * Only extracts needed fields, ignoring legacy/unused fields.
 */
export function normalizePluginSettings(data: unknown): MyPluginSettings {
	const raw = (data ?? {}) as Record<string, unknown>;
	const ai = normalizeAIServiceSettings(raw);
	const dataStorageFolder = resolveFolderSetting(
		raw?.dataStorageFolder,
		getAIDataStoreFolder(ai.rootFolder),
		LEGACY_FOLDER_DEFAULTS.dataStorageFolder,
	);

	// Build settings object explicitly, only extracting needed fields
	const settings: MyPluginSettings = {
		// General folder settings
		dataStorageFolder,

		// Core settings (normalized)
		ai,
		search: normalizeSearchSettings(raw, ai.rootFolder, dataStorageFolder),
		usageTrackingEnabled: DEFAULT_SETTINGS.usageTrackingEnabled,
		usageDetailRetentionDays: DEFAULT_SETTINGS.usageDetailRetentionDays,
		usagePreviewEnabled: DEFAULT_SETTINGS.usagePreviewEnabled,
		codeBlockTheme: normalizeCodeBlockTheme(raw?.codeBlockTheme),
		modelRouting: normalizeModelRouting(raw?.modelRouting),
		modelCatalog: normalizeModelCatalog(raw?.modelCatalog),
		onboarding: normalizeOnboarding(raw?.onboarding),
		composer: {
			defaultDocumentView:
				(raw?.composer as { defaultDocumentView?: unknown } | undefined)?.defaultDocumentView === 'composer'
					? 'composer'
					: 'markdown',
			contentWidth: normalizeComposerContentWidth(
				(raw?.composer as { contentWidth?: unknown } | undefined)?.contentWidth,
			),
			intelligenceManualOpen:
				(raw?.composer as { intelligenceManualOpen?: unknown } | undefined)?.intelligenceManualOpen === true,
		},
		pluginCommandGateway: normalizePluginCommandGatewaySettings(raw?.pluginCommandGateway),
	};

	if (raw?.commandCenter && typeof raw.commandCenter === 'object') {
		settings.commandCenter = raw.commandCenter as MyPluginSettings['commandCenter'];
	}

	settings.skillsFolder = resolveFolderSetting(
		raw?.skillsFolder,
		getAISkillsFolder(ai.rootFolder),
		LEGACY_FOLDER_DEFAULTS.skillsFolder,
	);
	settings.inboxFolder = resolveFolderSetting(
		raw?.inboxFolder,
		getAIInboxFolder(ai.rootFolder),
		LEGACY_FOLDER_DEFAULTS.inboxFolder,
	);
	settings.customPromptsFolder = resolveFolderSetting(
		raw?.customPromptsFolder,
		getAICustomPromptsFolder(ai.rootFolder),
		LEGACY_FOLDER_DEFAULTS.customPromptsFolder,
	);

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
		};
	}

	// Profile v2: load existing profileSettings or initialize empty.
	const rawProfileSettings = raw?.profileSettings;
	if (rawProfileSettings && typeof rawProfileSettings === 'object') {
		const profileSettings = rawProfileSettings as ProfileSettings;
		settings.profileSettings = profileSettings;
		// Migrate legacy authToken → apiKey (authToken field was removed)
		for (const p of profileSettings.profiles) {
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
		};
	}

	// Usage tracking settings
	settings.usageTrackingEnabled = getBoolean(raw?.usageTrackingEnabled, DEFAULT_SETTINGS.usageTrackingEnabled);
	settings.usageDetailRetentionDays = typeof raw?.usageDetailRetentionDays === 'number'
		? Math.max(1, raw.usageDetailRetentionDays)
		: DEFAULT_SETTINGS.usageDetailRetentionDays;
	settings.usagePreviewEnabled = getBoolean(raw?.usagePreviewEnabled, DEFAULT_SETTINGS.usagePreviewEnabled ?? true);

	// Harness settings (M5)
	const rawHarness = raw?.harnessSettings as Partial<HarnessSettings> | undefined;
	if (rawHarness && typeof rawHarness === 'object') {
		const d = DEFAULT_HARNESS_SETTINGS;
		settings.harnessSettings = {
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
			defaultPermissionMode: (rawHarness.defaultPermissionMode === 'read' || rawHarness.defaultPermissionMode === 'ask' || rawHarness.defaultPermissionMode === 'acceptEdits' || rawHarness.defaultPermissionMode === 'bypassPermissions')
				? rawHarness.defaultPermissionMode
				: d.defaultPermissionMode,
			executionModel: rawHarness.executionModel && typeof rawHarness.executionModel === 'object'
				? rawHarness.executionModel
				: d.executionModel,
			tools: {
				webAccess: getBoolean(rawHarness.tools?.webAccess, d.tools.webAccess),
				mcp: getBoolean(rawHarness.tools?.mcp, d.tools.mcp),
				skills: getBoolean(rawHarness.tools?.skills, d.tools.skills),
				obsidianCommands: getBoolean(rawHarness.tools?.obsidianCommands, d.tools.obsidianCommands),
				externalPluginCommands: getBoolean(rawHarness.tools?.externalPluginCommands, d.tools.externalPluginCommands),
			},
			permissions: {
				readVault: getBoolean(rawHarness.permissions?.readVault, d.permissions.readVault),
				writeVault: getBoolean(rawHarness.permissions?.writeVault, d.permissions.writeVault),
				localCommands: normalizePermissionScope(rawHarness.permissions?.localCommands, d.permissions.localCommands),
				networkAccess: normalizePermissionScope(rawHarness.permissions?.networkAccess, d.permissions.networkAccess),
				rememberedApprovals: getBoolean(rawHarness.permissions?.rememberedApprovals, d.permissions.rememberedApprovals),
			},
			budget: sanitizeBudget((rawHarness as { budget?: unknown }).budget),
		};
	} else {
		settings.harnessSettings = {
			...DEFAULT_HARNESS_SETTINGS,
			budget: {
				...DEFAULT_HARNESS_SETTINGS.budget,
				alertRules: DEFAULT_HARNESS_SETTINGS.budget.alertRules.map((r) => ({ ...r })),
			},
		};
	}

	settings.debugTrace = sanitizeDebugTrace(raw?.debugTrace);

	return settings;
}

function normalizePermissionScope(value: unknown, fallback: 'deny' | 'ask' | 'allow'): 'deny' | 'ask' | 'allow' {
	if (value === 'deny' || value === 'ask' || value === 'allow') return value;
	return fallback;
}

const PLUGIN_COMMAND_RISKS = new Set<PluginCommandRisk>([
	'read',
	'edit',
	'destructive',
	'unknown',
]);
const PLUGIN_COMMAND_PURPOSES = new Set<PluginCommandPurpose>([
	'navigation',
	'capture',
	'planning',
	'tasks',
	'query',
	'formatting',
	'system',
	'other',
]);

function normalizePluginCommandGatewaySettings(raw: unknown): PluginCommandGatewaySettings {
	if (!raw || typeof raw !== 'object') return { reviews: {}, findings: {} };
	const source = raw as Record<string, unknown>;
	const reviews: Record<string, PluginCommandReview> = {};
	const findings: Record<string, PluginCommandCurationFinding> = {};

	if (source.reviews && typeof source.reviews === 'object') {
		for (const [commandId, value] of Object.entries(source.reviews as Record<string, unknown>)) {
			if (!value || typeof value !== 'object') continue;
			const row = value as Record<string, unknown>;
			if (row.decision !== 'allow' && row.decision !== 'deny') continue;
			if (!PLUGIN_COMMAND_RISKS.has(row.risk as PluginCommandRisk)) continue;
			if (!PLUGIN_COMMAND_PURPOSES.has(row.purpose as PluginCommandPurpose)) continue;
			if (
				typeof row.sourceHash !== 'string' ||
				typeof row.curationHash !== 'string' ||
				typeof row.reviewedAt !== 'number'
			) continue;
			reviews[commandId] = {
				decision: row.decision,
				risk: row.risk as PluginCommandRisk,
				purpose: row.purpose as PluginCommandPurpose,
				sourceHash: row.sourceHash,
				curationHash: row.curationHash,
				reviewedAt: row.reviewedAt,
			};
		}
	}

	if (source.findings && typeof source.findings === 'object') {
		for (const [commandId, value] of Object.entries(source.findings as Record<string, unknown>)) {
			if (!value || typeof value !== 'object') continue;
			const row = value as Record<string, unknown>;
			if (row.commandId !== commandId) continue;
			if (typeof row.sourceHash !== 'string') continue;
			if (typeof row.recommend !== 'boolean') continue;
			if (!PLUGIN_COMMAND_RISKS.has(row.risk as PluginCommandRisk)) continue;
			if (!PLUGIN_COMMAND_PURPOSES.has(row.purpose as PluginCommandPurpose)) continue;
			if (typeof row.summary !== 'string' || !Array.isArray(row.evidence)) continue;
			if (typeof row.curatedAt !== 'number') continue;
			const interaction =
				row.interaction === 'direct' || row.interaction === 'modal' || row.interaction === 'unknown'
					? row.interaction
					: 'unknown';
			const expectedObservation =
				row.expectedObservation === 'workspace' ||
				row.expectedObservation === 'vault' ||
				row.expectedObservation === 'modal' ||
				row.expectedObservation === 'none' ||
				row.expectedObservation === 'unknown'
					? row.expectedObservation
					: 'unknown';
			const confirmation =
				row.confirmation === 'none' ||
				row.confirmation === 'per-run' ||
				row.confirmation === 'always'
					? row.confirmation
					: 'always';
			findings[commandId] = {
				commandId,
				sourceHash: row.sourceHash,
				recommend: row.recommend,
				risk: row.risk as PluginCommandRisk,
				purpose: row.purpose as PluginCommandPurpose,
				summary: row.summary,
				evidence: row.evidence.filter((entry): entry is string => typeof entry === 'string'),
				requiresActiveEditor: row.requiresActiveEditor === true,
				interaction,
				expectedObservation,
				toolDescription: typeof row.toolDescription === 'string' ? row.toolDescription : row.summary,
				confirmation,
				skillName: typeof row.skillName === 'string' ? row.skillName : commandId,
				skillDescription: typeof row.skillDescription === 'string' ? row.skillDescription : row.summary,
				skillInstructions: typeof row.skillInstructions === 'string' ? row.skillInstructions : row.summary,
				curatedAt: row.curatedAt,
			};
		}
	}

	return { reviews, findings };
}

function sanitizeDebugTrace(raw: unknown): DebugTraceSettings {
	const def = DEFAULT_DEBUG_TRACE_SETTINGS;
	if (!raw || typeof raw !== 'object') return { ...def };
	const r = raw as Partial<DebugTraceSettings>;
	const mode: DebugTraceSettings['mode'] =
		r.mode === 'off' || r.mode === 'redacted' || r.mode === 'raw' ? r.mode : def.mode;
	const retention: DebugTraceSettings['retention'] =
		r.retention === 20 || r.retention === 100 || r.retention === 'session'
			? r.retention
			: def.retention;
	const copyFormat: DebugTraceSettings['copyFormat'] =
		r.copyFormat === 'markdown' || r.copyFormat === 'json' || r.copyFormat === 'both'
			? r.copyFormat
			: def.copyFormat;
	const includeRawContent =
		typeof r.includeRawContent === 'boolean' ? r.includeRawContent : def.includeRawContent;
	return { mode, retention, copyFormat, includeRawContent };
}

const ALERT_RULE_KINDS: ReadonlySet<string> = new Set([
	'budget_threshold',
	'context_compact',
	'agent_receipt',
	'silence_low_cost_pip',
]);

/**
 * Sanitize the persisted budget block. Always returns a fully populated
 * BudgetSettings — missing or malformed fields fall back to DEFAULT_BUDGET_SETTINGS
 * so the dashboard never has to handle undefined slots at render time.
 */
function sanitizeBudget(raw: unknown): HarnessSettings['budget'] {
	const def = DEFAULT_HARNESS_SETTINGS.budget;
	const fallback = {
		...def,
		alertRules: def.alertRules.map((r) => ({ ...r })),
	};
	if (!raw || typeof raw !== 'object') return fallback;
	const r = raw as Record<string, unknown>;
	const monthlyUsd = typeof r.monthlyUsd === 'number' && Number.isFinite(r.monthlyUsd) && r.monthlyUsd >= 0
		? r.monthlyUsd
		: def.monthlyUsd;
	const resetDayOfMonth = typeof r.resetDayOfMonth === 'number' && r.resetDayOfMonth >= 1 && r.resetDayOfMonth <= 28
		? Math.floor(r.resetDayOfMonth)
		: def.resetDayOfMonth;
	const rawRules = Array.isArray(r.alertRules) ? r.alertRules : null;
	const alertRules = rawRules
		? def.alertRules.map((defRule) => {
			const match = rawRules.find((x) => (x as { kind?: unknown }).kind === defRule.kind) as
				| { enabled?: unknown; threshold?: unknown; tokenThreshold?: unknown }
				| undefined;
			if (!match || !ALERT_RULE_KINDS.has(defRule.kind)) return { ...defRule };
			return {
				kind: defRule.kind,
				enabled: typeof match.enabled === 'boolean' ? match.enabled : defRule.enabled,
				threshold: typeof match.threshold === 'number' && Number.isFinite(match.threshold)
					? match.threshold
					: defRule.threshold,
				tokenThreshold: typeof match.tokenThreshold === 'number' && Number.isFinite(match.tokenThreshold)
					? match.tokenThreshold
					: defRule.tokenThreshold,
			};
		})
		: def.alertRules.map((rule) => ({ ...rule }));
	return { monthlyUsd, resetDayOfMonth, alertRules };
}
