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
import { composeHeadingModeDeps } from '@/app/search/composeHeadingModeDeps';
import { composeResultSubgraphDeps } from '@/app/search/composeResultSubgraphDeps';
import { openQuickSearch } from '@/app/commands/PeakCommandActions';
import type { QuickSearchLauncherPort } from '@/core/ports/QuickSearchLauncherPort';

/**
 * chat-studio L-SEARCH-01/02: narrow Quick Search handoff. The hotkey hint
 * comes from the REAL command binding (Obsidian hotkeyManager) — no
 * hardcoded ⌘K badges when the user has no binding.
 */
function composeQuickSearchLauncher(appContext: AppContext): QuickSearchLauncherPort {
	return {
		open: () => openQuickSearch(),
		hotkeyHint: () => resolveQuickSearchHotkeyHint(appContext.plugin, 'peak-quick-search'),
	};
}

function resolveQuickSearchHotkeyHint(plugin: unknown, commandLocalId: string): string | null {
	try {
		const p = plugin as { app?: any; manifest?: { id: string } };
		const hotkeyManager: any = p?.app?.hotkeyManager;
		if (!hotkeyManager) return null;
		const fullId = `${p.manifest?.id}:${commandLocalId}`;
		const record = hotkeyManager.getHotkeys?.(fullId) ?? hotkeyManager.getDefaultHotkeys?.(fullId);
		const first = Array.isArray(record) ? record[0] : null;
		if (!first || !first.key) return null;
		const mods: string[] = Array.isArray(first.modifiers) ? first.modifiers : String(first.modifiers ?? '').split(',');
		return formatHotkeyHint(mods, first.key);
	} catch {
		return null;
	}
}

function formatHotkeyHint(mods: string[], key: string): string {
	const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
	const symbolMap: Record<string, string> = isMac
		? { Mod: '⌘', Meta: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }
		: { Mod: 'Ctrl', Meta: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
	const parts = mods.filter(Boolean).map((m) => symbolMap[m] ?? m);
	parts.push(key.toUpperCase());
	return isMac ? parts.join('') : parts.join('+');
}

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
			copilotActionRuntime: appContext.runtimeRegistry.tryGetCopilotActionRuntime(),
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
			// T13: thread the three de-singletoned runtimes through the
			// React ServiceContext so UI consumers never reach into
			// `AppContext.getInstance()` for them.
			indexService: appContext.runtimeRegistry.tryGetIndexService(),
			mcpClientManager: appContext.runtimeRegistry.tryGetMcpClientManager(),
			usageServices: appContext.runtimeRegistry.tryGetUsageServices(),
			debugTracePort: appContext.runtimeRegistry.tryGetDebugTracePort(),
			headingMode: composeHeadingModeDeps(appContext),
			resultSubgraph: composeResultSubgraphDeps(),
			quickSearchLauncher: composeQuickSearchLauncher(appContext),
			children: React.createElement(Component, props as T)
		}
	);
}
