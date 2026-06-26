import React from 'react';
import { ServiceProvider } from '@/ui/context/ServiceContext';
import { AppContext } from '@/app/context/AppContext';
import { composeCopilotPanelVault } from '@/app/copilot/panels/composeCopilotPanelVault';
import { SettingsModal } from '@/app/modals/SettingsModal';
import { AppAnalysisDocVaultWriterAdapter } from '@/app/quick-search/AppAnalysisDocVaultWriterAdapter';
import { SearchSessionReportAdapter } from '@/app/quick-search/SearchSessionReportAdapter';

/**
 * Factory function to create React elements wrapped with ServiceProvider.
 *
 * Lives at `src/app/react/` (T11O Track 5): this is **app composition**,
 * not React presentation. It reads runtime ports off `AppContext` and
 * threads them into the React tree so UI components consume injected
 * adapters via `useServiceContext()` instead of static accessors.
 *
 * Provides every published `ServiceContext` field explicitly so the
 * provider has nothing to fall back on. The old `AppContext.getInstance()`
 * fallback chain inside `ServiceProvider` was the last UI -> app static
 * leak inside the React render path.
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
	return React.createElement(
		ServiceProvider,
		{
			app: appContext.app,
			manager: appContext.manager,
			eventBus: appContext.eventBus,
			searchClient: appContext.searchClient,
			viewManager: appContext.viewManager,
			plugin: appContext.plugin!,
			settings: appContext.settings,
			vaultLintRuntime: appContext.runtimeRegistry.tryGetVaultLintRuntime(),
			ambientRuntime: appContext.runtimeRegistry.tryGetAmbientRuntime(),
			vaultReviewRuntime: appContext.runtimeRegistry.tryGetVaultReviewRuntime(),
			quickSearchBackgroundRuntime: appContext.runtimeRegistry.tryGetQuickSearchBackgroundRuntime(),
			aiAnalysisHistoryService: appContext.aiAnalysisHistoryService,
			isMockEnv: appContext.isMockEnv,
			searchAgent: () => appContext.searchAgentFactory(appContext.manager),
			settingsActions: {
				openSettings: () => new SettingsModal(appContext).open(),
			},
			analysisDocVaultWriter: new AppAnalysisDocVaultWriterAdapter(),
			reportSessionPort: new SearchSessionReportAdapter(),
			copilotPanelVault: composeCopilotPanelVault(appContext),
			vaultPreview: appContext.vaultPreview,
			vaultNavigation: appContext.vaultNavigation,
			editorCommands: appContext.editorCommands,
			chatVaultWriter: appContext.chatVaultWriter,
			children: React.createElement(Component, props as T)
		}
	);
}
