import React, { createContext, useContext, useMemo } from 'react';
import { AIServiceManager } from '@/service/chat/service-manager';
import { EventBus } from '@/core/eventBus';
import { SearchClient } from '@/service/search/SearchClient';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import type { CopilotActionRuntime } from '@/service/copilot/actions/CopilotActionRuntime';
import type { QuickSearchBackgroundRuntime } from '@/service/search/background/QuickSearchBackgroundRuntime';
import type { AIAnalysisHistoryService } from '@/service/AIAnalysisHistoryService';
import type { AnalysisDocVaultWriterPort } from '@/core/ports/AnalysisDocVaultWriterPort';
import type { ReportSessionPort } from '@/core/ports/ReportSessionPort';
import type { CopilotPanelHostBundle } from '@/core/ports/CopilotPanelPorts';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { VaultPreviewPort } from '@/core/ports/VaultPreviewPort';
import type { VaultNavigationPort } from '@/core/ports/VaultNavigationPort';
import type { WikilinkPort } from '@/core/ports/WikilinkPort';
import type { EditorCommandsPort } from '@/core/ports/EditorCommandsPort';
import type { ChatVaultWriterPort } from '@/core/ports/ChatVaultWriterPort';
import type { ChatNavigationPort } from '@/core/ports/ChatNavigationPort';
import type { VaultStatsPort } from '@/core/ports/VaultStatsPort';
import type { QuickSearchLauncherPort } from '@/core/ports/QuickSearchLauncherPort';
import type { SettingsActions } from '@/core/ports/SettingsActionsPort';
import type { QuickSearchHost } from '@/ui/view/quick-search/hooks/useQuickSearchHost';
import type { CopilotReviewHistoryService } from '@/service/copilot/CopilotReviewHistoryService';
import type { CopilotReviewDeps } from '@/service/copilot/CopilotReviewSession';
import type { IndexService } from '@/service/search/index/indexService';
import type { MCPClientManager } from '@/service/mcp/MCPClientManager';
import type { UsageTrackingService } from '@/service/usage/UsageTrackingService';
import type { UsageOutcomeService } from '@/service/usage/UsageOutcomeService';
import type { UsageOptimizationService } from '@/service/usage/optimization/UsageOptimizationService';
import type { DebugTracePort } from '@/core/debug-trace';
import type { HeadingModeDeps } from '@/core/ports/HeadingModePort';
import type { ResultSubgraphDeps } from '@/service/search/graph/resultSubgraph';
import type MyPlugin from 'main';

/** T13: Usage-telemetry bundle mirrored from `AppRuntimeRegistry.usageServices`. */
export interface UsageServicesCtx {
	tracking: UsageTrackingService;
	outcome: UsageOutcomeService;
	optimization: UsageOptimizationService;
}

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
	/**
	 * Copilot action catalog runtime (registered by the plugin at boot). Null
	 * before composition wires it. UI surfaces (CopilotPickerContent) probe
	 * this and render an empty catalog when absent instead of importing
	 * `@/app/context/AppContext` directly — see T11P / T11Q ui→app floor.
	 */
	copilotActionRuntime: CopilotActionRuntime | null;
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
	/** T13: read-only handle to the app-owned IndexService (may be null before boot). */
	indexService: IndexService | null;
	/** T13: read-only handle to the app-owned MCPClientManager. */
	mcpClientManager: MCPClientManager | null;
	/** T13: read-only handle to the app-owned usage-telemetry bundle. */
	usageServices: UsageServicesCtx | null;
	/**
	 * Debug Trace Infrastructure port. `null` until composition wires the
	 * recorder in `main.ts`. UI surfaces (Copy debug trace affordances,
	 * Advanced tab controls) probe this and no-op when absent.
	 */
	debugTracePort: DebugTracePort | null;
	/**
	 * T5 (2026-07-07 heading-mode UI): app-composed heading-mode data
	 * bundle. Adapts `extractHeadingTree` / `getSectionSnippets` /
	 * `getLinkPositions` to the Obsidian vault reader. Null before
	 * composition wires it (mock harness / early boot).
	 */
	headingMode: HeadingModeDeps | null;
	/**
	 * T4 (2026-07-07 result graph): app-composed `ResultSubgraphDeps`
	 * bundle. Adapts the sqlite mobius node/edge/hub repos to the pure
	 * `buildResultSubgraph` function. Null before composition wires it
	 * (mock harness / early boot); ResultGraphView renders the sparse
	 * fallback banner in that case.
	 */
	resultSubgraph: ResultSubgraphDeps | null;
	/**
	 * Chat-studio L-SEARCH-01/02: narrow app-owned Quick Search handoff.
	 * Null in mock harness / early boot — the left-column button hides itself.
	 */
	quickSearchLauncher: QuickSearchLauncherPort | null;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

/**
 * Provider component that publishes the service context. Every value must
 * be supplied by the caller — there is no longer a `AppContext.getInstance()`
 * fallback chain (T11O Track 5) and no raw `app` field (T11P). The single
 * composition point is
 * `@/app/ui-host/ReactElementFactory#createReactElementWithServices`, which
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
	copilotActionRuntime: CopilotActionRuntime | null;
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
	indexService: IndexService | null;
	mcpClientManager: MCPClientManager | null;
	usageServices: UsageServicesCtx | null;
	debugTracePort?: DebugTracePort | null;
	headingMode?: HeadingModeDeps | null;
	resultSubgraph?: ResultSubgraphDeps | null;
	quickSearchLauncher?: QuickSearchLauncherPort | null;
}> = ({ children, manager, eventBus, searchClient, plugin, vaultLintRuntime, ambientRuntime, vaultReviewRuntime, copilotActionRuntime, quickSearchBackgroundRuntime, aiAnalysisHistoryService, isMockEnv, settings, settingsActions, analysisDocVaultWriter, reportSessionPort, copilotPanelVault, vaultPreview, vaultNavigation, wikilink, editorCommands, chatVaultWriter, chatNavigation, vaultStats, quickSearchHost, copilotReviewHistory, copilotReviewDeps, indexService, mcpClientManager, usageServices, debugTracePort = null, headingMode = null, resultSubgraph = null, quickSearchLauncher = null }) => {
	const value = useMemo<ServiceContextValue>(() => ({
		manager,
		eventBus,
		searchClient,
		plugin,
		vaultLintRuntime,
		ambientRuntime,
		vaultReviewRuntime,
		copilotActionRuntime,
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
		indexService,
		mcpClientManager,
		usageServices,
		debugTracePort,
		headingMode,
		resultSubgraph,
		quickSearchLauncher,
	}), [eventBus, manager, plugin, searchClient, vaultLintRuntime, ambientRuntime, vaultReviewRuntime, copilotActionRuntime, quickSearchBackgroundRuntime, aiAnalysisHistoryService, isMockEnv, settings, settingsActions, analysisDocVaultWriter, reportSessionPort, copilotPanelVault, vaultPreview, vaultNavigation, wikilink, editorCommands, chatVaultWriter, chatNavigation, vaultStats, quickSearchHost, copilotReviewHistory, copilotReviewDeps, indexService, mcpClientManager, usageServices, debugTracePort, headingMode, resultSubgraph, quickSearchLauncher]);

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
