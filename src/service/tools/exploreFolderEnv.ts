import type { AIServiceManager } from '@/service/chat/service-manager';
import type { ExploreFolderEnv } from './search-graph-inspector/explore-folder';

/**
 * T11Q (Track F): pure resolver that builds the explore-folder env from the
 * deps an agent already has — `app` (via `manager.getApp()`) + the search /
 * AI settings snapshot (via `manager.getSearchSettings()` for search keys,
 * and a manager-supplied accessor for `ai.rootFolder`).
 *
 * Lives under `service/tools/` because every agent that constructs an
 * `exploreFolderTool` is in the service tier; the helper centralises the
 * tiny env mapping so agents do not duplicate it.
 */
export function exploreFolderEnvFromManager(manager: AIServiceManager): ExploreFolderEnv {
	const app = manager.getApp();
	const search = manager.getSearchSettings();
	const rootFolder = manager.getChatRootFolder();
	return {
		vault: app.vault,
		rootFolder,
		autoSaveFolder: search.aiAnalysisAutoSaveFolder,
		excludeAutoSaveFolder: search.aiAnalysisExcludeAutoSaveFolderFromSearch,
		templateManagerFallback: () => manager.getTemplateManager?.(),
	};
}
