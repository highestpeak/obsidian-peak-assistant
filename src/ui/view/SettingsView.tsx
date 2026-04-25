import React, { useState, useEffect } from 'react';
import { ViewEventType } from '@/core/eventBus';
import { ProfilesTab } from './settings/ProfilesTab';
import { SearchTab } from './settings/SearchTab';
import { GeneralTab } from './settings/GeneralTab';
import { useSettingsUpdate } from './settings/hooks/useSettingsUpdate';
import { useServiceContext } from '@/ui/context/ServiceContext';

type TabId = 'profiles' | 'search' | 'general';

/**
 * Root component for plugin settings with tab navigation.
 */
export function SettingsRoot() {
	const { eventBus, plugin } = useServiceContext();
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

	const tabs: Array<{ id: TabId; label: string }> = [
		{ id: 'profiles', label: 'Profiles' },
		{ id: 'search', label: 'Search & Indexing' },
		{ id: 'general', label: 'General' },
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
				{activeTab === 'profiles' && <ProfilesTab settings={settings} settingsUpdates={settingsUpdates} />}
				{activeTab === 'search' && <SearchTab settings={settings} settingsUpdates={settingsUpdates} />}
				{activeTab === 'general' && <GeneralTab settings={settings} settingsUpdates={settingsUpdates} />}
			</div>
		</div>
	);
}
