import React, { useState, useEffect } from 'react';
import { ServiceProvider } from '@/ui/context/ServiceContext';
import { MockApp } from './mocks/services/MockApp';
import { MockEventBus } from './mocks/services/MockEventBus';
import { MockAIServiceManager } from './mocks/services/MockAIServiceManager';
import { MockViewManager } from './mocks/services/MockViewManager';
import { MockSearchClient } from './mocks/services/MockSearchClient';
import { MockPlugin } from './mocks/services/MockPlugin';
import { DesktopRouter } from './DesktopRouter';
import { AIServiceManager } from '@/service/chat/service-manager';
import { normalizePluginSettings } from '@/app/settings/PluginSettingsLoader';

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
	const [useMockAI, setUseMockAI] = useState(true); // Start with mock AI by default
	const [realSettings, setRealSettings] = useState<any>(null);
	const [loading, setLoading] = useState(true);

	// Load real settings from data.json
	useEffect(() => {
		const loadSettings = async () => {
			try {
				const response = await fetch('/data.json');
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}
				const settings = await response.json();
				setRealSettings(settings);
			} catch (error) {
				console.error('Failed to load data.json:', error);
				// Fallback to empty settings

				setRealSettings({});
			} finally {
				setLoading(false);
			}
		};
		loadSettings();
	}, []);

	const app = new MockApp() as any;
	const eventBus = new MockEventBus() as any;
	const viewManager = new MockViewManager() as any;
	const searchClient = new MockSearchClient() as any;
	const plugin = new MockPlugin() as any;

	// Normalize settings when loaded
	const realConfig = realSettings ? normalizePluginSettings(realSettings) : null;

	// Create managers based on toggle state
	const manager = useMockAI
		? (new MockAIServiceManager(eventBus) as any as AIServiceManager)
		: (realConfig ? new AIServiceManager(app, realConfig.ai) : (new MockAIServiceManager(eventBus) as any as AIServiceManager));

	// Initialize real AI manager if using real AI
	React.useEffect(() => {
		if (!useMockAI && manager instanceof AIServiceManager && realConfig) {
			manager.init().catch(console.error);
		}
	}, [manager, useMockAI, realConfig]);

	// Show loading state while settings are being loaded
	if (loading) {
		return (
			<div className="h-screen w-screen flex items-center justify-center" style={{ height: '100vh', width: '100vw', backgroundColor: '#ffffff', color: '#000000' }}>
				<div>Loading configuration...</div>
			</div>
		);
	}

	return (
		<ServiceProvider
			app={app}
			manager={manager}
			searchClient={searchClient}
			viewManager={viewManager}
			eventBus={eventBus}
			plugin={plugin}
		>
		<div className="h-screen w-screen flex flex-col" style={{ height: '100vh', width: '100vw', backgroundColor: '#ffffff', color: '#000000', display: 'flex', flexDirection: 'column' }}>
			<DesktopRouter useMockAI={useMockAI} onToggleMockAI={() => setUseMockAI(!useMockAI)} />
		</div>
		</ServiceProvider>
	);
};

