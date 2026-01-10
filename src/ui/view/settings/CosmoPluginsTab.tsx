import React from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { CommandHiddenControlService } from '@/service/CommandHiddenControlService';
import { CollapsibleSettingsSection } from '@/ui/component/shared-ui/CollapsibleSettingsSection';
import { CommandHiddenPlugin } from './component/CommandHiddenPlugin';

interface CosmoPluginsTabProps {
	settings: MyPluginSettings;
	commandHiddenControlService: CommandHiddenControlService | null;
	updateSettings: (updates: Partial<MyPluginSettings>) => Promise<void>;
}


/**
 * Cosmo Plugins settings tab containing various integrated plugins.
 */
export function CosmoPluginsTab({
	settings,
	commandHiddenControlService,
	updateSettings,
}: CosmoPluginsTabProps) {

	return (
		<div className="peak-settings-container">
			{/* Header */}
			<h3 className="pktw-m-0 pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-mb-4">Cosmo Plugins</h3>
			<p className="peak-settings-description pktw-mb-6">
				Manage integrated plugins and their settings. These plugins enhance your Obsidian experience with additional functionality.
			</p>

			{/* Command Hidden Plugin Section */}
			<CollapsibleSettingsSection title="Command Hidden" defaultOpen={false}>
				<CommandHiddenPlugin
					settings={settings}
					commandHiddenControlService={commandHiddenControlService}
					updateSettings={updateSettings}
				/>
			</CollapsibleSettingsSection>
		</div>
	);
}
