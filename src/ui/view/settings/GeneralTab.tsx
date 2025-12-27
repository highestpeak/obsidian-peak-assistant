import React, { useCallback } from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { Input } from '@/ui/component/shared-ui/input';
import { Switch } from '@/ui/component/shared-ui/switch';
import { SettingField } from '@/ui/component/shared-ui/setting-field';
import { NumberInputField } from '@/ui/component/shared-ui/number-input';

interface GeneralTabProps {
	settings: MyPluginSettings;
	updateSettings: (updates: Partial<MyPluginSettings>) => Promise<void>;
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
export function GeneralTab({ settings, updateSettings }: GeneralTabProps) {
	const handleGeneralFolderChange = useCallback(
		(key: keyof MyPluginSettings, value: string) => {
			return updateSettings({ [key]: value } as Partial<MyPluginSettings>);
		},
		[updateSettings]
	);

	const handleAIFolderChange = useCallback(
		(key: keyof typeof settings.ai, value: string) => {
			return updateSettings({
				ai: {
					...settings.ai,
					[key]: value,
				},
			});
		},
		[settings.ai, updateSettings]
	);

	const folderConfigs: FolderConfigItem[] = [
		{
			id: 'scriptFolder',
			label: 'Event Script Folder',
			description: 'Script in this folder will be register to listen to target events.',
			value: settings.scriptFolder,
			placeholder: 'Enter your Folder',
			onChange: (value) => handleGeneralFolderChange('scriptFolder', value),
		},
		{
			id: 'dataStorageFolder',
			label: 'Data Storage Folder',
			description: 'Folder for storing plugin data files (e.g., search database). Leave empty to use plugin directory.',
			value: settings.dataStorageFolder || '',
			placeholder: 'Leave empty for plugin directory',
			onChange: (value) => handleGeneralFolderChange('dataStorageFolder', value.trim()),
		},
		{
			id: 'htmlViewConfigFile',
			label: 'HTML View Config File',
			description: 'Path to HTML view configuration file.',
			value: settings.htmlViewConfigFile,
			placeholder: 'Enter config file path',
			onChange: (value) => handleGeneralFolderChange('htmlViewConfigFile', value),
		},
		{
			id: 'statisticsDataStoreFolder',
			label: 'Statistics Data Store Folder',
			description: 'Folder for storing repository statistics data.',
			value: settings.statisticsDataStoreFolder,
			placeholder: 'Enter statistics folder',
			onChange: (value) => handleGeneralFolderChange('statisticsDataStoreFolder', value),
		},
		{
			id: 'rootFolder',
			label: 'Chat Root Folder',
			description: 'Root folder for AI conversation data.',
			value: settings.ai.rootFolder,
			placeholder: 'Enter chat root folder',
			onChange: (value) => handleAIFolderChange('rootFolder', value),
		},
		{
			id: 'promptFolder',
			label: 'Prompt Folder',
			description: 'Folder containing conversation and summary prompts.',
			value: settings.ai.promptFolder,
			placeholder: 'Enter prompt folder',
			onChange: (value) => handleAIFolderChange('promptFolder', value),
		},
		{
			id: 'uploadFolder',
			label: 'Upload Folder',
			description: 'Folder for storing uploaded files (PDFs, images, etc.).',
			value: settings.ai.uploadFolder,
			placeholder: 'Enter upload folder',
			onChange: (value) => handleAIFolderChange('uploadFolder', value),
		},
		{
			id: 'resourcesSummaryFolder',
			label: 'Resources Summary Folder',
			description: 'Folder for storing resource summary notes (relative to chat root folder).',
			value: settings.ai.resourcesSummaryFolder,
			placeholder: 'Enter resources summary folder',
			onChange: (value) => handleAIFolderChange('resourcesSummaryFolder', value),
		},
	];

	const handleAutoIndexChange = useCallback(
		async (value: boolean) => {
			await updateSettings({
				search: {
					...settings.search,
					autoIndex: value,
				},
			});
		},
		[settings.search, updateSettings]
	);

	const handleDocumentTypeChange = useCallback(
		async (type: 'markdown' | 'pdf' | 'image', value: boolean) => {
			await updateSettings({
				search: {
					...settings.search,
					includeDocumentTypes: {
						...settings.search.includeDocumentTypes,
						[type]: value,
					},
				},
			});
		},
		[settings.search, updateSettings]
	);

	const handleChunkingChange = useCallback(
		async (field: 'maxChunkSize' | 'chunkOverlap', value: number) => {
			if (!settings.search.chunking) return;
			await updateSettings({
				search: {
					...settings.search,
					chunking: {
						...settings.search.chunking,
						[field]: value,
					},
				},
			});
		},
		[settings.search, updateSettings]
	);

	return (
		<div className="peak-settings-card">
			{/* Folder Configuration Section */}
			<div className="pktw-mb-8">
				<h3 className="pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-mb-4">Folder Configuration</h3>
				
				<div className="pktw-space-y-4">
					{folderConfigs.map((config) => (
						<SettingField key={config.id} label={config.label} description={config.description}>
							<Input
								type="text"
								placeholder={config.placeholder}
								value={config.value}
								onChange={(e) => config.onChange(e.target.value)}
							/>
						</SettingField>
					))}
				</div>
			</div>

			{/* Auto Index on Startup */}
			<SettingField
				label="Auto Index on Startup"
				description={"Automatically index files when Obsidian opens. If disabled, you can manually trigger indexing via command palette (Command+P: \"Index Search\")."}
			>
				<Switch checked={settings.search.autoIndex} onChange={handleAutoIndexChange} />
			</SettingField>

			{/* Index Document Types */}
			<SettingField
				label="Index Document Types"
				description="Select which file types to include in search index."
			>
				<div className="pktw-space-y-3">
					<div className="pktw-flex pktw-items-center pktw-justify-between">
						<span className="pktw-text-sm pktw-text-foreground">Markdown files</span>
						<Switch
							checked={settings.search.includeDocumentTypes.markdown}
							onChange={(checked) => handleDocumentTypeChange('markdown', checked)}
						/>
					</div>
					<div className="pktw-flex pktw-items-center pktw-justify-between">
						<span className="pktw-text-sm pktw-text-foreground">PDF files</span>
						<Switch
							checked={settings.search.includeDocumentTypes.pdf}
							onChange={(checked) => handleDocumentTypeChange('pdf', checked)}
						/>
					</div>
					<div className="pktw-flex pktw-items-center pktw-justify-between">
						<span className="pktw-text-sm pktw-text-foreground">Image files</span>
						<Switch
							checked={settings.search.includeDocumentTypes.image}
							onChange={(checked) => handleDocumentTypeChange('image', checked)}
						/>
					</div>
				</div>
			</SettingField>

			{/* Document Chunking Settings */}
			<NumberInputField
				label="Max Chunk Size"
				description="Maximum characters per chunk. Default: 1000"
				value={settings.search.chunking?.maxChunkSize ?? 1000}
				onChange={(value) => handleChunkingChange('maxChunkSize', value)}
				min={1}
				placeholder="1000"
			/>

			<NumberInputField
				label="Chunk Overlap"
				description="Characters of overlap between chunks. Default: 200"
				value={settings.search.chunking?.chunkOverlap ?? 200}
				onChange={(value) => handleChunkingChange('chunkOverlap', value)}
				min={0}
				placeholder="200"
			/>
		</div>
	);
}
