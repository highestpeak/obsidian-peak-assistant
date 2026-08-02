import { Notice, type App } from 'obsidian';
import { CopilotReviewHistoryService } from '@/service/copilot/CopilotReviewHistoryService';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';

/**
 * T11Q (Track B): app-owned composition of the Auto Review history service.
 *
 * The service was a service-layer module singleton that hid an
 * `AppContext.getInstance().app` lookup. After T11Q it is constructed
 * here once at boot, threaded through `AppContext.copilotReviewHistory`,
 * and published on `ServiceContext.copilotReviewHistory` for UI consumers.
 *
 * The folder-created notifier (only firing once when `peak-system/` is
 * materialized) lives in the app layer so the service never imports
 * Obsidian's `Notice`.
 */
export function composeCopilotReviewHistory(
	app: App,
	generatedOutputs?: GeneratedOutputPersistenceRuntime,
): CopilotReviewHistoryService {
	return new CopilotReviewHistoryService(app, (message, durationMs) => {
		new Notice(message, durationMs);
	}, generatedOutputs);
}
