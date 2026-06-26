import React, { createContext, useContext, useMemo } from 'react';
import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { EventBus } from '@/core/eventBus';
import { SearchClient } from '@/service/search/SearchClient';
import type { ViewManager } from '@/app/view/ViewManager';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';
import type { CopilotPanelHostBundle } from '@/app/copilot/panels/composeCopilotPanelVault';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { VaultPreviewPort } from '@/service/preview/VaultPreviewPort';
import type { VaultNavigationPort } from '@/service/navigation/VaultNavigationPort';
import type { EditorCommandsPort } from '@/service/editor/EditorCommandsPort';
import type { ChatVaultWriterPort } from '@/service/chat/ports/ChatVaultWriterPort';
import type MyPlugin from 'main';

/**
 * Service context value containing all global services.
 *
 * T6R: `vaultLintRuntime` is exposed here so UI consumers (the Vault
 * X-Ray hook, future scheduled-scan dashboards) can drive scans
 * without reaching into a service-layer singleton.
 *
 * T8: `ambientRuntime` joins the same pattern — the Related Notes
 * panel refresh button and `PushCard` action handlers read the
 * runtime through this context so they never touch a service-layer
 * singleton. Both values are `null` until plugin boot binds them;
 * consumers handle the null case explicitly.
 *
 * T11M: `settings` and `copilotPanelVault` get the same treatment.
 * `settings` is cross-cutting (read by ~15 React components today);
 * `copilotPanelVault` is the named-operation port that Copilot result
 * panels consume via `useCopilotPanelVault()` so they never reach for
 * `AppContext.getInstance().app.vault.*`. Quick-Search-specific
 * accessors stay OUT of this shared context — they live on
 * `useQuickSearchHost()` to avoid bloating the shared surface.
 *
 * T11N: `vaultPreview` / `vaultNavigation` / `editorCommands` /
 * `chatVaultWriter` are grouped narrow ports — each one consolidates
 * exactly one category of vault/editor operation that was previously
 * spread across hover-preview, ambient-card, briefing, chat-message,
 * and history-helper code. Per Codex's correction the ServiceContext
 * **publishes** these ports rather than constructing them — the
 * adapters are built once at boot inside `AppContext` and threaded
 * through `ReactElementFactory`. The legacy `copilotPanelVault`
 * fallback is kept for the rare direct-`<ServiceProvider>` mount
 * (T11M behaviour).
 */
interface ServiceContextValue {
	app: App;
	manager: AIServiceManager;
	eventBus: EventBus;
	searchClient: SearchClient | null;
	viewManager: ViewManager;
	plugin: MyPlugin;
	vaultLintRuntime: VaultLintRuntime | null;
	ambientRuntime: AmbientRuntime | null;
	settings: MyPluginSettings;
	copilotPanelVault: CopilotPanelHostBundle;
	vaultPreview: VaultPreviewPort;
	vaultNavigation: VaultNavigationPort;
	editorCommands: EditorCommandsPort;
	chatVaultWriter: ChatVaultWriterPort;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

/**
 * Provider component that publishes the service context. Every value must
 * be supplied by the caller — there is no longer a `AppContext.getInstance()`
 * fallback chain (T11O Track 5). The single composition point is
 * `@/app/react/ReactElementFactory#createReactElementWithServices`, which
 * threads every port off the app-owned `AppContext`.
 */
export const ServiceProvider: React.FC<{
	children: React.ReactNode;
	app: App;
	manager: AIServiceManager;
	eventBus: EventBus;
	searchClient: SearchClient | null;
	viewManager: ViewManager;
	plugin: MyPlugin;
	vaultLintRuntime: VaultLintRuntime | null;
	ambientRuntime: AmbientRuntime | null;
	settings: MyPluginSettings;
	copilotPanelVault: CopilotPanelHostBundle;
	vaultPreview: VaultPreviewPort;
	vaultNavigation: VaultNavigationPort;
	editorCommands: EditorCommandsPort;
	chatVaultWriter: ChatVaultWriterPort;
}> = ({ children, app, manager, eventBus, searchClient, viewManager, plugin, vaultLintRuntime, ambientRuntime, settings, copilotPanelVault, vaultPreview, vaultNavigation, editorCommands, chatVaultWriter }) => {
	const value = useMemo<ServiceContextValue>(() => ({
		app,
		manager,
		eventBus,
		searchClient,
		viewManager,
		plugin,
		vaultLintRuntime,
		ambientRuntime,
		settings,
		copilotPanelVault,
		vaultPreview,
		vaultNavigation,
		editorCommands,
		chatVaultWriter,
	}), [app, eventBus, manager, plugin, searchClient, viewManager, vaultLintRuntime, ambientRuntime, settings, copilotPanelVault, vaultPreview, vaultNavigation, editorCommands, chatVaultWriter]);

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
