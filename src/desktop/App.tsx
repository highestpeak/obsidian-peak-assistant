import React from 'react';
import { ServiceProvider } from '@/ui/context/ServiceContext';
import { MockApp } from './mocks/services/MockApp';
import { MockEventBus } from './mocks/services/MockEventBus';
import { MockAIServiceManager } from './mocks/services/MockAIServiceManager';
import { MockViewManager } from './mocks/services/MockViewManager';
import { MockSearchClient } from './mocks/services/MockSearchClient';
import { DesktopRouter } from './DesktopRouter';

// Override EventBus.getInstance to return mock event bus
import { EventBus } from '@/core/eventBus';
const originalGetInstance = EventBus.getInstance;
(EventBus as any).getInstance = (app: any) => {
	return new MockEventBus() as any;
};

/**
 * Main App component for desktop development
 */
export const DesktopApp: React.FC = () => {
	const app = new MockApp() as any;
	const eventBus = new MockEventBus() as any;
	const manager = new MockAIServiceManager(eventBus) as any;
	const viewManager = new MockViewManager() as any;
	const searchClient = new MockSearchClient() as any;

	return (
		<ServiceProvider
			app={app}
			manager={manager}
			searchClient={searchClient}
			viewManager={viewManager}
			eventBus={eventBus}
		>
		<div className="h-screen w-screen flex flex-col" style={{ height: '100vh', width: '100vw', backgroundColor: '#ffffff', color: '#000000', display: 'flex', flexDirection: 'column' }}>
			<DesktopRouter />
		</div>
		</ServiceProvider>
	);
};

