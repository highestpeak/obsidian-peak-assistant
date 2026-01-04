import React, { createContext, useContext } from 'react';
import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { EventBus } from '@/core/eventBus';
import { SearchClient } from '@/service/search/SearchClient';
import { ViewManager } from '@/app/view/ViewManager';

/**
 * Service context value containing all global services
 */
interface ServiceContextValue {
	app: App;
	manager: AIServiceManager;
	eventBus: EventBus;
	searchClient: SearchClient | null;
	viewManager: ViewManager;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

/**
 * Provider component that wraps React components with service context
 */
export const ServiceProvider: React.FC<{
	children: React.ReactNode;
	app: App;
	manager: AIServiceManager;
	searchClient?: SearchClient | null;
	viewManager: ViewManager;
}> = ({ children, app, manager, searchClient = null, viewManager }) => {
	const eventBus = EventBus.getInstance(app);

	return (
		<ServiceContext.Provider value={{ app, manager, eventBus, searchClient, viewManager }}>
			{children}
		</ServiceContext.Provider>
	);
};

/**
 * Hook to access service context
 * @throws Error if used outside ServiceProvider
 */
export const useServiceContext = () => {
	const context = useContext(ServiceContext);
	if (!context) {
		throw new Error('useServiceContext must be used within ServiceProvider');
	}
	return context;
};

