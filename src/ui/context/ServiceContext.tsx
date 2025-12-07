import React, { createContext, useContext } from 'react';
import { App } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';
import { EventBus } from '@/core/eventBus';

/**
 * Service context value containing all global services
 */
interface ServiceContextValue {
	app: App;
	manager: AIServiceManager;
	eventBus: EventBus;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

/**
 * Provider component that wraps React components with service context
 */
export const ServiceProvider: React.FC<{
	children: React.ReactNode;
	app: App;
	manager: AIServiceManager;
}> = ({ children, app, manager }) => {
	const eventBus = EventBus.getInstance(app);

	return (
		<ServiceContext.Provider value={{ app, manager, eventBus }}>
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

