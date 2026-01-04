import React from 'react';
import { ServiceProvider } from '@/ui/context/ServiceContext';
import { AppContext } from '@/app/context/AppContext';

/**
 * Factory function to create React elements wrapped with ServiceProvider
 * This ensures all components have access to global services via useServiceContext
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
			children: React.createElement(Component, props as T)
		}
	);
}

