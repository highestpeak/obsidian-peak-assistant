// T11J A2: Pure plugin-settings data shapes/defaults live in
// `@/core/config/settingsTypes`. Pure folder-path helpers live in
// `@/core/config/folderPaths` (rootFolder is required there). This file
// is the app-side shim that:
//   1. Re-exports the core types/defaults verbatim (no duplication).
//   2. Adds backward-compat helper wrappers that default `rootFolder` to
//      `AppContext.getInstance().settings.ai.rootFolder`. Reaching into
//      AppContext.getInstance() is only allowed in the app layer.

export * from '@/core/config/settingsTypes';
export { AI_PATH_SUBFOLDERS, aiNormalizedRootFolder } from '@/core/config/folderPaths';

import * as core from '@/core/config/folderPaths';
import { AppContext } from '@/app/context/AppContext';

function ctxRootFolder(): string {
	return AppContext.getInstance().settings.ai.rootFolder;
}

export function getAIPromptFolder(rootFolder?: string): string {
	return core.getAIPromptFolder(rootFolder ?? ctxRootFolder());
}

export function getAIUploadFolder(rootFolder?: string): string {
	return core.getAIUploadFolder(rootFolder ?? ctxRootFolder());
}

export function getAIResourcesSummaryFolder(rootFolder?: string): string {
	return core.getAIResourcesSummaryFolder(rootFolder ?? ctxRootFolder());
}

export function getAIHubSummaryFolder(rootFolder?: string): string {
	return core.getAIHubSummaryFolder(rootFolder ?? ctxRootFolder());
}

export function getAIManualHubFolder(rootFolder?: string): string {
	return core.getAIManualHubFolder(rootFolder ?? ctxRootFolder());
}

export function getAIProfileFilePath(rootFolder?: string): string {
	return core.getAIProfileFilePath(rootFolder ?? ctxRootFolder());
}
