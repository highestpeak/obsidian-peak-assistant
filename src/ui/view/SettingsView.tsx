import React, { useState, useEffect, useCallback } from 'react';
import type MyPlugin from 'main';
import { EventBus, ViewEventType, SettingsUpdatedEvent } from '@/core/eventBus';
import { GeneralTab } from './settings/GeneralTab';
import { ModelConfigTab } from './settings/ModelConfigTab';
import { CommandHiddenTab } from './settings/CommandHiddenTab';
import { SearchSettingsTab } from './settings/SearchSettingsTab';
import { useSettingsUpdate } from './settings/hooks/useSettingsUpdate';
import type { MyPluginSettings } from '@/app/settings/types';

interface SettingsRootProps {
	plugin: MyPlugin;
	eventBus: EventBus;
}

type TabId = 'general' | 'ai-models' | 'search' | 'command-hidden';

/**
 * Root component for plugin settings with tab navigation.
 */
export function SettingsRoot({ plugin, eventBus }: SettingsRootProps) {
	const [activeTab, setActiveTab] = useState<TabId>('general');

	// Keep a React state copy so controlled inputs rerender immediately when settings change
	const [settings, setSettings] = useState<MyPluginSettings>(plugin.settings);

	// Sync settings state when SettingsUpdatedEvent is dispatched
	useEffect(() => {
		const unsubscribe = eventBus.on(ViewEventType.SETTINGS_UPDATED, () => {
			setSettings({ ...plugin.settings });
		});
		return unsubscribe;
	}, [eventBus, plugin]);

	// Get update functions from hook (handles all side effects internally)
	const settingsUpdates = useSettingsUpdate(plugin, eventBus, settings);

	// Wrapper that syncs React state for controlled components
	const updateSettingsAndSync = useCallback(
		async (updates: Partial<MyPluginSettings>) => {
			await settingsUpdates.updateSettings(updates);
			// Force rerender for controlled components (checkbox/input) by updating state
			setSettings({ ...plugin.settings });
		},
		[settingsUpdates, plugin]
	);

	const tabs: Array<{ id: TabId; label: string }> = [
		{ id: 'general', label: 'General' },
		{ id: 'ai-models', label: 'Model Config' },
		{ id: 'search', label: 'Search Settings' },
		{ id: 'command-hidden', label: 'Command Hidden' },
	];

	return (
		<div className="peak-settings-tab">
			{/* Tab Navigation */}
			<div className="peak-settings-tabs">
				{tabs.map((tab) => (
					<div
						key={tab.id}
						className={`peak-settings-tab-item ${activeTab === tab.id ? 'is-active' : ''}`}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</div>
				))}
			</div>

			{/* Tab Content */}
			<div className="peak-settings-content">
				{activeTab === 'general' && (
					<GeneralTab settings={settings} settingsUpdates={settingsUpdates} />
				)}
				{activeTab === 'ai-models' && (
					<ModelConfigTab
						settings={settings}
						aiServiceManager={plugin.aiServiceManager}
						settingsUpdates={settingsUpdates}
						eventBus={eventBus}
					/>
				)}
				{activeTab === 'search' && (
					<SearchSettingsTab settings={settings} settingsUpdates={settingsUpdates} />
				)}
				{activeTab === 'command-hidden' && (
					<CommandHiddenTab
						settings={settings}
						commandHiddenControlService={plugin.commandHiddenControlService}
						updateSettings={updateSettingsAndSync}
					/>
				)}
			</div>
		</div>
	);
}
