import type { AppContext } from '@/app/context/AppContext';
import type { CopilotReviewDeps } from '@/service/copilot/CopilotReviewSession';

/**
 * T11Q (Track C): app-owned factory that gathers the live deps
 * `runCopilotReview` needs — vault `App`, plugin id, AI analysis history,
 * and (best-effort) the user profile markdown — so UI no longer reaches
 * into `AppContext` from the session module itself.
 *
 * Loading the user profile is best-effort: errors are swallowed and the
 * field stays unset, matching the pre-T11Q behavior.
 */
export function composeCopilotReviewDeps(appContext: AppContext): () => Promise<CopilotReviewDeps> {
	return async () => {
		let userProfileText: string | undefined;
		try {
			const profileService = appContext.manager.getProfileService();
			if (profileService) {
				const text = await profileService.getProfileAsMarkdown();
				userProfileText = text.trim() || undefined;
			}
		} catch (err) {
			console.warn('[composeCopilotReviewDeps] failed to load user profile', err);
		}
		return {
			app: appContext.app,
			pluginId: appContext.plugin.manifest.id,
			analysisHistory: appContext.aiAnalysisHistoryService,
			searchClient: appContext.searchClient,
			pluginCommandGateway:
				appContext.runtimeRegistry.tryGetPluginCommandGatewayRuntime(),
			debugTrace: appContext.runtimeRegistry.tryGetDebugTracePort(),
			userProfileText,
		};
	};
}
