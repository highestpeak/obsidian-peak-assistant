import React, { createContext, useContext, useMemo } from 'react';
import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { EventBus } from '@/core/eventBus';
import { SearchClient } from '@/service/search/SearchClient';
import { ViewManager } from '@/app/view/ViewManager';
import { AppContext } from '@/app/context/AppContext';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type MyPlugin from 'main';

/**
 * Service context value containing all global services.
 *
 * T6R: `vaultLintRuntime` is exposed here so UI consumers (the Vault
 * X-Ray hook, future scheduled-scan dashboards) can drive scans
 * without reaching into a service-layer singleton. The value is
 * `null` until plugin boot binds the runtime; consumers handle that
 * case explicitly.
 */
interface ServiceContextValue {
	app: App;
	manager: AIServiceManager;
	eventBus: EventBus;
	searchClient: SearchClient | null;
	viewManager: ViewManager;
	plugin: MyPlugin;
	vaultLintRuntime: VaultLintRuntime | null;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

/**
 * Provider component that reads dependencies from AppContext singleton.
 */
export const ServiceProvider: React.FC<{
	children: React.ReactNode;
	app?: App;
	manager?: AIServiceManager;
	eventBus?: EventBus;
	searchClient?: SearchClient | null;
	viewManager?: ViewManager;
	plugin?: MyPlugin;
	vaultLintRuntime?: VaultLintRuntime | null;
}> = ({ children, app, manager, eventBus, searchClient, viewManager, plugin, vaultLintRuntime }) => {
	const value = useMemo<ServiceContextValue>(() => {
		return {
			app: app ?? AppContext.getApp(),
			manager: manager ?? AppContext.getManager(),
			eventBus: eventBus ?? AppContext.getEventBus(),
			searchClient: searchClient ?? AppContext.getSearchClient() ?? null,
			viewManager: viewManager ?? AppContext.getViewManager(),
			plugin: plugin ?? AppContext.getPlugin(),
			vaultLintRuntime: vaultLintRuntime ?? AppContext.tryGetVaultLintRuntime(),
		};
	}, [app, eventBus, manager, plugin, searchClient, viewManager, vaultLintRuntime]);

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
