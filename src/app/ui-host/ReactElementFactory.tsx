import React from 'react';
import { ServiceProvider } from '@/ui/context/ServiceContext';
import { AppContext } from '@/app/context/AppContext';
import { composeCopilotPanelVault } from '@/app/copilot/panels/composeCopilotPanelVault';
import { AppAnalysisDocVaultWriterAdapter } from '@/app/search/AppAnalysisDocVaultWriterAdapter';
import { SearchSessionReportAdapter } from '@/app/search/SearchSessionReportAdapter';
import { composeSettingsActions } from '@/app/commands/composeSettingsActions';
import { createChatNavigation } from '@/ui/view/chat-view/chatNavigation';
import { composeQuickSearchHost } from '@/app/search/composeQuickSearchHost';
import { composeCopilotReviewDeps } from '@/app/copilot/composeCopilotReviewDeps';

/**
 * Factory function to create React elements wrapped with ServiceProvider.
 *
 * Lives at `src/app/react/` (T11O Track 5): this is **app composition**,
 * not React presentation. It reads runtime ports off `AppContext` and
 * threads them into the React tree so UI components consume injected
 * adapters via `useServiceContext()` instead of static accessors.
 *
 * T11P: ServiceContext no longer publishes raw `app` or `viewManager`.
 * Everything UI used to take off `app` is now a named port (chatNavigation,
 * settingsActions, vaultNavigation, wikilink, vaultStats…). The factory
 * composes each port from `AppContext` once at boot.
 *
 * Runtime ports (vault lint, ambient, copilot panel vault, vault preview,
 * vault navigation, editor commands, chat vault writer) are passed even
 * when null — null means "runtime is still booting" and downstream
 * consumers handle that case explicitly.
 */
export function createReactElementWithServices<T extends Record<string, any>>(
	Component: React.ComponentType<T>,
	props: Omit<T, 'app' | 'manager' | 'searchClient' | 'viewManager'>,
	appContext: AppContext
): React.ReactElement {
	const chatNavigation = createChatNavigation({
		manager: appContext.manager,
		viewManager: appContext.viewManager,
		eventBus: appContext.eventBus,
	});
	const reportSessionPort = new SearchSessionReportAdapter();

	return React.createElement(
		ServiceProvider,
		{
			manager: appContext.manager,
			eventBus: appContext.eventBus,
			searchClient: appContext.searchClient,
			plugin: appContext.plugin!,
			settings: appContext.settings,
			vaultLintRuntime: appContext.runtimeRegistry.tryGetVaultLintRuntime(),
			ambientRuntime: appContext.runtimeRegistry.tryGetAmbientRuntime(),
			vaultReviewRuntime: appContext.runtimeRegistry.tryGetVaultReviewRuntime(),
			quickSearchBackgroundRuntime: appContext.runtimeRegistry.tryGetQuickSearchBackgroundRuntime(),
			aiAnalysisHistoryService: appContext.aiAnalysisHistoryService,
			isMockEnv: appContext.isMockEnv,
			settingsActions: composeSettingsActions(appContext),
			analysisDocVaultWriter: new AppAnalysisDocVaultWriterAdapter(),
			reportSessionPort: reportSessionPort,
			copilotPanelVault: composeCopilotPanelVault(appContext),
			vaultPreview: appContext.vaultPreview,
			vaultNavigation: appContext.vaultNavigation,
			wikilink: appContext.wikilink,
			editorCommands: appContext.editorCommands,
			chatVaultWriter: appContext.chatVaultWriter,
			chatNavigation,
			vaultStats: appContext.vaultStats,
			quickSearchHost: composeQuickSearchHost(appContext, reportSessionPort),
			copilotReviewHistory: appContext.copilotReviewHistory,
			copilotReviewDeps: composeCopilotReviewDeps(appContext),
			children: React.createElement(Component, props as T)
		}
	);
}
