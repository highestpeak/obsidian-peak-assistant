import React, { useCallback } from 'react';
import { MyPluginSettings, AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { Input } from '@/ui/component/shared-ui/input';
import { SettingField } from '@/ui/component/shared-ui/setting-field';
import { CommittedInputField } from '@/ui/component/shared-ui/committed-input';
import { ProviderSettingsComponent } from '@/ui/view/settings/component/ProviderSettings';

interface ChatTabProps {
	settings: MyPluginSettings;
	aiServiceManager: AIServiceManager;
	updateSettings: (updates: Partial<MyPluginSettings>) => Promise<void>;
}

/**
 * Chat settings tab with AI service configuration.
 */
export function ChatTab({ settings, aiServiceManager, updateSettings }: ChatTabProps) {
	const handleRootModeChange = useCallback(
		async (value: 'project-first' | 'conversation-first') => {
			await updateSettings({
				ai: {
					...settings.ai,
					rootMode: value,
				},
			});
		},
		[settings.ai, updateSettings]
	);

	const handleRootFolderCommit = useCallback(
		async (value: string) => {
			const next = value?.trim() || DEFAULT_AI_SERVICE_SETTINGS.rootFolder;
			if (next === settings.ai.rootFolder) {
				return;
			}
			await updateSettings({
				ai: {
					...settings.ai,
					rootFolder: next,
				},
			});
		},
		[settings.ai, updateSettings]
	);

	const handlePromptFolderChange = useCallback(
		async (value: string) => {
			const next = value?.trim() || DEFAULT_AI_SERVICE_SETTINGS.promptFolder;
			await updateSettings({
				ai: {
					...settings.ai,
					promptFolder: next,
				},
			});
		},
		[settings.ai, updateSettings]
	);

	const handleUploadFolderChange = useCallback(
		async (value: string) => {
			const next = value?.trim() || DEFAULT_AI_SERVICE_SETTINGS.uploadFolder;
			await updateSettings({
				ai: {
					...settings.ai,
					uploadFolder: next,
				},
			});
		},
		[settings.ai, updateSettings]
	);

	const handleProviderSettingsUpdate = useCallback(
		async (updates: Partial<AIServiceSettings>) => {
			await updateSettings({
				ai: {
					...settings.ai,
					...updates,
				},
			});
		},
		[settings.ai, updateSettings]
	);

	return (
		<div className="peak-settings-card">
			{/* Chat Root Mode */}
			<SettingField label="Chat Root Mode" description="Choose the default navigation mode">
				<select
					className="pktw-flex pktw-h-10 pktw-w-full pktw-rounded-md pktw-border pktw-border-input pktw-bg-background pktw-px-3 pktw-py-2 pktw-text-sm pktw-ring-offset-background focus-visible:pktw-outline-none focus-visible:pktw-ring-2 focus-visible:pktw-ring-ring focus-visible:pktw-ring-offset-2"
					value={settings.ai.rootMode}
					onChange={(e) => handleRootModeChange(e.target.value as 'project-first' | 'conversation-first')}
				>
					<option value="project-first">Project First</option>
					<option value="conversation-first">Conversation First</option>
				</select>
			</SettingField>

			{/* Chat Root Folder */}
			<CommittedInputField
				label="Chat Root Folder"
				description="Root folder for AI conversation data"
				value={settings.ai.rootFolder}
				onCommit={handleRootFolderCommit}
				placeholder="e.g. ChatFolder"
			/>

			{/* Prompt Folder */}
			<SettingField
				label="Prompt Folder"
				description="Folder containing conversation and summary prompts"
			>
				<Input
					type="text"
					placeholder={DEFAULT_AI_SERVICE_SETTINGS.promptFolder}
					value={settings.ai.promptFolder}
					onChange={(e) => handlePromptFolderChange(e.target.value)}
				/>
			</SettingField>

			{/* Upload Folder */}
			<SettingField
				label="Upload Folder"
				description="Folder for storing uploaded files (PDFs, images, etc.)"
			>
				<Input
					type="text"
					placeholder={DEFAULT_AI_SERVICE_SETTINGS.uploadFolder}
					value={settings.ai.uploadFolder || DEFAULT_AI_SERVICE_SETTINGS.uploadFolder}
					onChange={(e) => handleUploadFolderChange(e.target.value)}
				/>
			</SettingField>

			{/* Provider Settings */}
			<div className="pktw-mt-8">
				<ProviderSettingsComponent
					settings={settings.ai}
					aiServiceManager={aiServiceManager}
					onUpdate={handleProviderSettingsUpdate}
				/>
			</div>
		</div>
	);
}
