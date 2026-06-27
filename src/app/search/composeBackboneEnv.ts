import type { AppContext } from '@/app/context/AppContext';
import type { BackboneEnv } from '@/service/search/index/helper/backbone';

/**
 * T11Q (Track E): app-owned snapshot of the small settings surface the
 * backbone helpers consult, plus the live `Vault` handle. Constructed
 * once per call (or once per agent boot) so service-tier modules never
 * read settings through `AppContext` mid-stream.
 */
export function composeBackboneEnv(appContext: AppContext): BackboneEnv {
	const search = appContext.settings.search;
	const ai = appContext.settings.ai;
	return {
		vault: appContext.app.vault,
		rootFolder: ai.rootFolder,
		autoSaveFolder: search.aiAnalysisAutoSaveFolder,
		excludeAutoSaveFolder: search.aiAnalysisExcludeAutoSaveFolderFromSearch,
		ignorePatterns: search.ignorePatterns,
	};
}
