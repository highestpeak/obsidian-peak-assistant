import React, { useState } from 'react';
import type MyPlugin from 'main';
import { EventBus } from '@/core/eventBus';
import { usePluginSettings } from './settings/usePluginSettings';
import { GeneralTab } from './settings/GeneralTab';
import { ChatTab } from './settings/ChatTab';
import { CommandHiddenTab } from './settings/CommandHiddenTab';
import { ModelConfigurationTab } from './settings/ModelConfigurationTab';

interface SettingsRootProps {
	plugin: MyPlugin;
	eventBus: EventBus;
}

type TabId = 'general' | 'ai-models' | 'model-config' | 'command-hidden';

/**
 * Root component for plugin settings with tab navigation.
 */
export function SettingsRoot({ plugin, eventBus }: SettingsRootProps) {
	const [activeTab, setActiveTab] = useState<TabId>('general');
	const { updateSettings } = usePluginSettings(plugin, eventBus);

	const tabs: Array<{ id: TabId; label: string }> = [
		{ id: 'general', label: 'General' },
		{ id: 'ai-models', label: 'Chat' },
		{ id: 'model-config', label: 'Model Config' },
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
					<GeneralTab settings={plugin.settings} updateSettings={updateSettings} />
				)}
				{activeTab === 'ai-models' && (
					<ChatTab
						settings={plugin.settings}
						aiServiceManager={plugin.aiServiceManager}
						updateSettings={updateSettings}
					/>
				)}
				{activeTab === 'model-config' && (
					<ModelConfigurationTab
						settings={plugin.settings}
						aiServiceManager={plugin.aiServiceManager}
						updateSettings={updateSettings}
					/>
				)}
				{activeTab === 'command-hidden' && (
					<CommandHiddenTab
						settings={plugin.settings}
						commandHiddenControlService={plugin.commandHiddenControlService}
						updateSettings={updateSettings}
					/>
				)}
			</div>
		</div>
	);
}
