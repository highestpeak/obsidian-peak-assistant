import React from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { InputWithConfirm } from '@/ui/component/mine/input-with-confirm';
import { CollapsibleSettingsSection } from '@/ui/component/shared-ui/CollapsibleSettingsSection';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import { Switch } from '@/ui/component/shared-ui/switch';

interface GeneralTabProps {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
}

interface FolderConfigItem {
	id: string;
	label: string;
	description: string;
	value: string;
	placeholder: string;
	onChange: (value: string) => Promise<void>;
}

/**
 * General settings tab with basic configuration options.
 */
export function GeneralTab({ settings, settingsUpdates }: GeneralTabProps) {
	const { update, updateAI } = settingsUpdates;

	const folderConfigs: FolderConfigItem[] = [
		// database
		{
			id: 'dataStorageFolder',
			label: 'Data Storage Folder',
			description: 'Folder for storing plugin data files (e.g., search database). Leave empty to use plugin directory.',
			value: settings.dataStorageFolder || '',
			placeholder: 'Leave empty for plugin directory',
			onChange: (value) => update('dataStorageFolder', value.trim()),
		},
		// chat
		{
			id: 'rootFolder',
			label: 'Chat Root Folder',
			description: 'Root folder for AI conversation data.',
			value: settings.ai.rootFolder,
			placeholder: 'Enter chat root folder',
			onChange: (value) => updateAI('rootFolder', value),
		},
		{
			id: 'promptFolder',
			label: 'Prompt Folder',
			description: 'Folder containing conversation and summary prompts.',
			value: settings.ai.promptFolder,
			placeholder: 'Enter prompt folder',
			onChange: (value) => updateAI('promptFolder', value),
		},
		{
			id: 'uploadFolder',
			label: 'Upload Folder',
			description: 'Folder for storing uploaded files (PDFs, images, etc.).',
			value: settings.ai.uploadFolder,
			placeholder: 'Enter upload folder',
			onChange: (value) => updateAI('uploadFolder', value),
		},
		{
			id: 'resourcesSummaryFolder',
			label: 'Resources Summary Folder',
			description: 'Folder for storing resource summary notes (relative to chat root folder).',
			value: settings.ai.resourcesSummaryFolder,
			placeholder: 'Enter resources summary folder',
			onChange: (value) => updateAI('resourcesSummaryFolder', value),
		},
		// other support tools
		{
			id: 'scriptFolder',
			label: 'Event Script Folder',
			description: 'Script in this folder will be register to listen to target events.',
			value: settings.scriptFolder,
			placeholder: 'Enter your Folder',
			onChange: (value) => update('scriptFolder', value),
		},
		{
			id: 'htmlViewConfigFile',
			label: 'HTML View Config File',
			description: 'Path to HTML view configuration file.',
			value: settings.htmlViewConfigFile,
			placeholder: 'Enter config file path',
			onChange: (value) => update('htmlViewConfigFile', value),
		},
		{
			id: 'statisticsDataStoreFolder',
			label: 'Statistics Data Store Folder',
			description: 'Folder for storing repository statistics data.',
			value: settings.statisticsDataStoreFolder,
			placeholder: 'Enter statistics folder',
			onChange: (value) => update('statisticsDataStoreFolder', value),
		},
	];


	return (
		<div className="peak-settings-card">
			{/* Folder Configuration Section */}
			<CollapsibleSettingsSection title="Folder Configuration">
				<div className="pktw-space-y-6">
					{folderConfigs.map((config) => (
						<div key={config.id} className="pktw-flex pktw-items-start pktw-gap-4">
							{/* Left side: label and description */}
							<div className="pktw-flex-1 pktw-min-w-0">
								<label className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1">
									{config.label}
								</label>
								{config.description && (
									<p className="pktw-text-xs pktw-text-muted-foreground">{config.description}</p>
								)}
							</div>
							{/* Right side: input */}
							<div className="pktw-flex-shrink-0 pktw-w-64">
								<InputWithConfirm
									type="text"
									placeholder={config.placeholder}
									value={config.value}
									onConfirm={config.onChange}
								/>
							</div>
						</div>
					))}
				</div>
			</CollapsibleSettingsSection>

			{/* Developer Tools Section */}
			<CollapsibleSettingsSection title="Developer Tools">
				<div className="pktw-space-y-6">
					<div className="pktw-flex pktw-items-start pktw-gap-4">
						{/* Left side: label and description */}
						<div className="pktw-flex-1 pktw-min-w-0">
							<label className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1">
								Enable DevTools Graph Inspector
							</label>
							<p className="pktw-text-xs pktw-text-muted-foreground">
								Enable global test interface for graph inspector tools in browser DevTools console.
								Exposes window.testGraphTools object with convenience methods for testing.
							</p>
						</div>
						{/* Right side: switch */}
						<div className="pktw-flex-shrink-0">
							<Switch
								checked={settings.enableDevTools ?? false}
								onChange={(checked) => update('enableDevTools', checked)}
							/>
						</div>
					</div>
				</div>
			</CollapsibleSettingsSection>

		</div>
	);
}
