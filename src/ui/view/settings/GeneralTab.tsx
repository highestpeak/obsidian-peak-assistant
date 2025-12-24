import React, { useState, useCallback } from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { Input } from '@/ui/component/shared-ui/input';
import { Switch } from '@/ui/component/shared-ui/switch';
import { SettingField } from '@/ui/component/shared-ui/setting-field';
import { NumberInputField } from '@/ui/component/shared-ui/number-input';

interface GeneralTabProps {
	settings: MyPluginSettings;
	updateSettings: (updates: Partial<MyPluginSettings>) => Promise<void>;
}

/**
 * General settings tab with basic configuration options.
 */
export function GeneralTab({ settings, updateSettings }: GeneralTabProps) {
	const [scriptFolder, setScriptFolder] = useState(settings.scriptFolder);
	const [dataStorageFolder, setDataStorageFolder] = useState(settings.dataStorageFolder || '');

	const handleScriptFolderChange = useCallback(
		async (value: string) => {
			setScriptFolder(value);
			await updateSettings({ scriptFolder: value });
		},
		[updateSettings]
	);

	const handleDataStorageFolderChange = useCallback(
		async (value: string) => {
			const trimmed = value.trim();
			setDataStorageFolder(trimmed);
			await updateSettings({ dataStorageFolder: trimmed });
		},
		[updateSettings]
	);

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
			{/* Event Script Folder */}
			<SettingField
				label="EventScriptFolder"
				description="Script in this folder will be register to listen to target events."
			>
				<Input
					type="text"
					placeholder="Enter your Folder"
					value={scriptFolder}
					onChange={(e) => handleScriptFolderChange(e.target.value)}
				/>
			</SettingField>

			{/* Data Storage Folder */}
			<SettingField
				label="Data Storage Folder"
				description="Folder for storing plugin data files (e.g., search database). Leave empty to use plugin directory."
			>
				<Input
					type="text"
					placeholder="Leave empty for plugin directory"
					value={dataStorageFolder}
					onChange={(e) => handleDataStorageFolderChange(e.target.value)}
				/>
			</SettingField>

			{/* Auto Index on Startup */}
			<SettingField
				label="Auto Index on Startup"
				description="Automatically index files when Obsidian opens. If disabled, you can manually trigger indexing via command palette (Command+P: \"Index Search\")."
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
