import React from 'react';
import { ServiceProvider } from '@/ui/context/ServiceContext';
import { AppContext } from '@/app/context/AppContext';

/**
 * Factory function to create React elements wrapped with ServiceProvider
 * This ensures all components have access to global services via useServiceContext.
 *
 * T6R: pulls the Vault Lint runtime out of AppContext (soft form — may
 * be null if the panel mounts before boot binds it) and threads it
 * through the provider so UI hooks do not reach a service-layer
 * singleton.
 * T8: same treatment for the Ambient runtime so the Related Notes
 * panel + `PushCard` action handlers consume it through context.
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
			searchClient: appContext.searchClient,
			viewManager: appContext.viewManager,
			plugin: appContext.plugin!,
			vaultLintRuntime: appContext.runtimeRegistry.tryGetVaultLintRuntime(),
			ambientRuntime: appContext.runtimeRegistry.tryGetAmbientRuntime(),
			children: React.createElement(Component, props as T)
		}
	);
}
