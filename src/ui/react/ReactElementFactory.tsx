import React from 'react';
import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { ServiceProvider } from '@/ui/context/ServiceContext';
import { SearchClient } from '@/service/search/SearchClient';

/**
 * Factory function to create React elements wrapped with ServiceProvider
 * This ensures all components have access to global services via useServiceContext
 */
export function createReactElementWithServices<T extends Record<string, any>>(
	Component: React.ComponentType<T>,
	props: Omit<T, 'app' | 'manager' | 'searchClient'>,
	app: App,
	manager: AIServiceManager,
	searchClient?: SearchClient | null
): React.ReactElement {
	return React.createElement(
		ServiceProvider,
		{ app, manager, searchClient, children: React.createElement(Component, props as T) }
	);
}

