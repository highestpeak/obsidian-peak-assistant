import React from 'react';
import type { MyPluginSettings } from '@/app/settings/types';
import { InputWithConfirm } from '@/ui/component/mine/input-with-confirm';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import { Switch } from '@/ui/component/shared-ui/switch';
import { SettingCard } from './components/SettingCard';

interface GeneralTabProps {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
}

export function GeneralTab({ settings, settingsUpdates }: GeneralTabProps) {
	const { update, updateAI } = settingsUpdates;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-mt-4">
			<SettingCard
				label="Data Storage Folder"
				description="Folder for storing plugin data files (e.g., search database). Leave empty to use plugin directory."
			>
				<div className="pktw-w-64">
					<InputWithConfirm
						type="text"
						placeholder="Leave empty for plugin directory"
						value={settings.dataStorageFolder || ''}
						onConfirm={(value) => update('dataStorageFolder', value.trim())}
					/>
				</div>
			</SettingCard>

			<SettingCard
				label="Chat Root Folder"
				description="Root folder for AI conversation data (Prompts, Attachments, Hub-Summaries, etc. are derived automatically)."
			>
				<div className="pktw-w-64">
					<InputWithConfirm
						type="text"
						placeholder="Enter chat root folder"
						value={settings.ai.rootFolder}
						onConfirm={(value) => updateAI('rootFolder', value)}
					/>
				</div>
			</SettingCard>

			<SettingCard
				label="Attachment Handling"
				description="How attachments are sent to the model. 'Direct' requires model vision support; 'Degrade to text' uses OCR/parsing for compatibility."
			>
				<select
					className="pktw-text-sm pktw-bg-background pktw-border pktw-border-input pktw-rounded-md pktw-px-2 pktw-py-1 pktw-cursor-pointer"
					value={settings.ai?.attachmentHandlingDefault ?? 'direct'}
					onChange={(e) =>
						updateAI(
							'attachmentHandlingDefault',
							e.target.value as 'direct' | 'degrade_to_text',
						)
					}
				>
					<option value="direct">Direct (send raw)</option>
					<option value="degrade_to_text">Degrade to text (OCR)</option>
				</select>
			</SettingCard>

			<SettingCard
				label="Enable DevTools Graph Inspector"
				description="Exposes window.testGraphTools in browser DevTools console with convenience methods for graph testing."
				labelSuffix={
					<span className="pktw-ml-2 pktw-text-[10px] pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-pk-accent-muted pktw-text-pk-accent">
						Developer
					</span>
				}
			>
				<Switch
					checked={settings.enableDevTools ?? false}
					onChange={(checked) => update('enableDevTools', checked)}
				/>
			</SettingCard>
		</div>
	);
}
