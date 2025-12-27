import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS, DEFAULT_SEARCH_SETTINGS, DEFAULT_SETTINGS, MyPluginSettings, SearchSettings } from '@/app/settings/types';
import { ProviderConfig } from '@/core/providers/types';
import { DEFAULT_COMMAND_HIDDEN_SETTINGS } from '@/service/CommandHiddenControlService';

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
 * Get object value from source with type check.
 */
function getObject<T>(source: unknown, defaultValue: T): T {
	return (source && typeof source === 'object') ? (source as T) : defaultValue;
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

	// Simple string fields
	settings.rootFolder = getString(rawAI.rootFolder, settings.rootFolder);
	settings.promptFolder = getString(rawAI.promptFolder, settings.promptFolder);
	settings.uploadFolder = getString(rawAI.uploadFolder, settings.uploadFolder);
	settings.resourcesSummaryFolder = getString(rawAI.resourcesSummaryFolder, settings.resourcesSummaryFolder);

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
	settings.profileFilePath = getString(rawAI.profileFilePath, settings.profileFilePath ?? '');
	settings.promptRewriteEnabled = getBoolean(rawAI.promptRewriteEnabled, settings.promptRewriteEnabled ?? false);

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

	// Chunking settings
	if (rawSearch.chunking && typeof rawSearch.chunking === 'object') {
		settings.chunking = {
			...DEFAULT_SEARCH_SETTINGS.chunking,
			...rawSearch.chunking,
		};
	}

	// Search summary model
	if (rawSearch.searchSummaryModel && typeof rawSearch.searchSummaryModel === 'object') {
		const model = rawSearch.searchSummaryModel as { provider?: unknown; modelId?: unknown };
		const provider = getString(model.provider, '');
		const modelId = getString(model.modelId, '');
		if (provider && modelId) {
			settings.searchSummaryModel = { provider, modelId };
		}
	}

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
		scriptFolder: getString(raw?.scriptFolder, DEFAULT_SETTINGS.scriptFolder),
		htmlViewConfigFile: getString(raw?.htmlViewConfigFile, DEFAULT_SETTINGS.htmlViewConfigFile),
		statisticsDataStoreFolder: getString(raw?.statisticsDataStoreFolder, DEFAULT_SETTINGS.statisticsDataStoreFolder),
		dataStorageFolder: getString(raw?.dataStorageFolder, DEFAULT_SETTINGS.dataStorageFolder),

		// Core settings (normalized)
		ai: normalizeAIServiceSettings(raw),
		search: normalizeSearchSettings(raw),

		// Command hidden settings
		commandHidden: (() => {
			const source = raw?.commandHidden;
			if (source && typeof source === 'object') {
				return { ...DEFAULT_COMMAND_HIDDEN_SETTINGS, ...source };
			}
			return DEFAULT_COMMAND_HIDDEN_SETTINGS;
		})(),
	};

	// SQLite backend setting
	const sqliteBackend = raw?.sqliteBackend;
	if (sqliteBackend === 'auto' || sqliteBackend === 'better-sqlite3' || sqliteBackend === 'sql.js') {
		settings.sqliteBackend = sqliteBackend;
	}

	return settings;
}

