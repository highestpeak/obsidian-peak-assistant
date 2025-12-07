import React from 'react';
import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { ServiceProvider } from '@/ui/context/ServiceContext';

/**
 * Factory function to create React elements wrapped with ServiceProvider
 * This ensures all components have access to global services via useServiceContext
 */
export function createReactElementWithServices<T extends Record<string, any>>(
	Component: React.ComponentType<T>,
	props: Omit<T, 'app' | 'manager'>,
	app: App,
	manager: AIServiceManager
): React.ReactElement {
	return React.createElement(
		ServiceProvider,
		{ app, manager, children: React.createElement(Component, props as T) }
	);
}

