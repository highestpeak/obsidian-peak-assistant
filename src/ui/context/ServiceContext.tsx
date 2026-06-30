import React, { createContext, useContext, useMemo } from 'react';
import { AIServiceManager } from '@/service/chat/service-manager';
import { EventBus } from '@/core/eventBus';
import { SearchClient } from '@/service/search/SearchClient';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import type { QuickSearchBackgroundRuntime } from '@/service/search/background/QuickSearchBackgroundRuntime';
import type { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import type { AnalysisDocVaultWriterPort } from '@/service/search/ports/AnalysisDocVaultWriterPort';
import type { ReportSessionPort } from '@/service/agents/report/ReportSessionPort';
import type { CopilotPanelHostBundle } from '@/service/copilot/panels/CopilotPanelPorts';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { VaultPreviewPort } from '@/service/preview/VaultPreviewPort';
import type { VaultNavigationPort } from '@/service/navigation/VaultNavigationPort';
import type { WikilinkPort } from '@/service/navigation/WikilinkPort';
import type { EditorCommandsPort } from '@/service/editor/EditorCommandsPort';
import type { ChatVaultWriterPort } from '@/service/chat/ports/ChatVaultWriterPort';
import type { ChatNavigationPort } from '@/service/chat/navigation/ChatNavigationPort';
import type { VaultStatsPort } from '@/service/stats/VaultStatsPort';
import type { SettingsActions } from '@/service/settings/SettingsActionsPort';
import type { QuickSearchHost } from '@/ui/view/quick-search/hooks/useQuickSearchHost';
import type { CopilotReviewHistoryService } from '@/service/copilot/CopilotReviewHistoryService';
import type { CopilotReviewDeps } from '@/service/copilot/CopilotReviewSession';
import type MyPlugin from 'main';

/**
 * T11P (Tracks A–J): Service context now publishes only narrow ports —
 * `app` and `viewManager` are gone. Every UI surface consumes a named
 * action / accessor (`vaultNavigation`, `wikilink`, `vaultStats`,
 * `chatNavigation`, `settingsActions`, …); the app composes them once at
 * boot inside `ReactElementFactory`. UI components do not import from
 * `@/app/**` anywhere.
 *
 * T11N — historic note kept for context: `vaultLintRuntime`,
 * `ambientRuntime`, `settings`, `copilotPanelVault`, `vaultPreview`,
 * `vaultNavigation`, `editorCommands`, `chatVaultWriter` were grouped
 * narrow ports introduced earlier. They keep the same shape; what changed
 * in T11P is that ServiceContext no longer publishes raw `app` and the
 * `CopilotPanelHostBundle` type now lives in
 * `service/copilot/panels/CopilotPanelPorts.ts`.
 */
interface ServiceContextValue {
	manager: AIServiceManager;
	eventBus: EventBus;
	searchClient: SearchClient | null;
	plugin: MyPlugin;
	vaultLintRuntime: VaultLintRuntime | null;
	ambientRuntime: AmbientRuntime | null;
	vaultReviewRuntime: VaultReviewRuntime | null;
	quickSearchBackgroundRuntime: QuickSearchBackgroundRuntime | null;
	aiAnalysisHistoryService: AIAnalysisHistoryService;
	isMockEnv: boolean;
	settings: MyPluginSettings;
	settingsActions: SettingsActions;
	analysisDocVaultWriter: AnalysisDocVaultWriterPort;
	reportSessionPort: ReportSessionPort;
	copilotPanelVault: CopilotPanelHostBundle;
	vaultPreview: VaultPreviewPort;
	vaultNavigation: VaultNavigationPort;
	wikilink: WikilinkPort;
	editorCommands: EditorCommandsPort;
	chatVaultWriter: ChatVaultWriterPort;
	chatNavigation: ChatNavigationPort;
	vaultStats: VaultStatsPort;
	quickSearchHost: QuickSearchHost;
	/** T11Q (Track B): app-owned Auto Review history service. */
	copilotReviewHistory: CopilotReviewHistoryService;
	/**
	 * T11Q (Track C): factory the auto-review modal uses to gather the
	 * live deps (`app`, `pluginId`, `analysisHistory`, `userProfileText`)
	 * for `runCopilotReview`. Composed in the app layer so the session
	 * module no longer imports `AppContext`.
	 */
	copilotReviewDeps: () => Promise<CopilotReviewDeps>;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

/**
 * Provider component that publishes the service context. Every value must
 * be supplied by the caller — there is no longer a `AppContext.getInstance()`
 * fallback chain (T11O Track 5) and no raw `app` field (T11P). The single
 * composition point is
 * `@/app/react/ReactElementFactory#createReactElementWithServices`, which
 * threads every port off the app-owned `AppContext`.
 */
export const ServiceProvider: React.FC<{
	children: React.ReactNode;
	manager: AIServiceManager;
	eventBus: EventBus;
	searchClient: SearchClient | null;
	plugin: MyPlugin;
	vaultLintRuntime: VaultLintRuntime | null;
	ambientRuntime: AmbientRuntime | null;
	vaultReviewRuntime: VaultReviewRuntime | null;
	quickSearchBackgroundRuntime: QuickSearchBackgroundRuntime | null;
	aiAnalysisHistoryService: AIAnalysisHistoryService;
	isMockEnv: boolean;
	settings: MyPluginSettings;
	settingsActions: SettingsActions;
	analysisDocVaultWriter: AnalysisDocVaultWriterPort;
	reportSessionPort: ReportSessionPort;
	copilotPanelVault: CopilotPanelHostBundle;
	vaultPreview: VaultPreviewPort;
	vaultNavigation: VaultNavigationPort;
	wikilink: WikilinkPort;
	editorCommands: EditorCommandsPort;
	chatVaultWriter: ChatVaultWriterPort;
	chatNavigation: ChatNavigationPort;
	vaultStats: VaultStatsPort;
	quickSearchHost: QuickSearchHost;
	copilotReviewHistory: CopilotReviewHistoryService;
	copilotReviewDeps: () => Promise<CopilotReviewDeps>;
}> = ({ children, manager, eventBus, searchClient, plugin, vaultLintRuntime, ambientRuntime, vaultReviewRuntime, quickSearchBackgroundRuntime, aiAnalysisHistoryService, isMockEnv, settings, settingsActions, analysisDocVaultWriter, reportSessionPort, copilotPanelVault, vaultPreview, vaultNavigation, wikilink, editorCommands, chatVaultWriter, chatNavigation, vaultStats, quickSearchHost, copilotReviewHistory, copilotReviewDeps }) => {
	const value = useMemo<ServiceContextValue>(() => ({
		manager,
		eventBus,
		searchClient,
		plugin,
		vaultLintRuntime,
		ambientRuntime,
		vaultReviewRuntime,
		quickSearchBackgroundRuntime,
		aiAnalysisHistoryService,
		isMockEnv,
		settings,
		settingsActions,
		analysisDocVaultWriter,
		reportSessionPort,
		copilotPanelVault,
		vaultPreview,
		vaultNavigation,
		wikilink,
		editorCommands,
		chatVaultWriter,
		chatNavigation,
		vaultStats,
		quickSearchHost,
		copilotReviewHistory,
		copilotReviewDeps,
	}), [eventBus, manager, plugin, searchClient, vaultLintRuntime, ambientRuntime, vaultReviewRuntime, quickSearchBackgroundRuntime, aiAnalysisHistoryService, isMockEnv, settings, settingsActions, analysisDocVaultWriter, reportSessionPort, copilotPanelVault, vaultPreview, vaultNavigation, wikilink, editorCommands, chatVaultWriter, chatNavigation, vaultStats, quickSearchHost, copilotReviewHistory, copilotReviewDeps]);

	return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
};

/**
 * Hook to access service context.
 * @throws Error if used outside ServiceProvider
 */
export const useServiceContext = () => {
	const context = useContext(ServiceContext);
	if (!context) {
		throw new Error('useServiceContext must be used within ServiceProvider');
	}
	return context;
};
