import React from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { InputWithConfirm } from '@/ui/component/mine/input-with-confirm';
import { ProgressBarSlider } from '@/ui/component/mine/ProgressBarSlider';
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
			description:
				'Root folder for AI conversation data (Prompts, Attachments, Hub-Summaries, Hub-Summaries/Manual for user hub notes, etc. are derived automatically).',
			value: settings.ai.rootFolder,
			placeholder: 'Enter chat root folder',
			onChange: (value) => updateAI('rootFolder', value),
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

			{/* Graph Visualization Section */}
			<CollapsibleSettingsSection title="Graph Visualization">
				<div className="pktw-space-y-6">
					<div className="pktw-flex pktw-flex-col pktw-gap-2">
						<label className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1" title="Strength of the force that pulls nodes toward their community center. Lower = looser clusters; higher = tighter clusters.">
							Cluster Force Strength
						</label>
						<p className="pktw-text-xs pktw-text-muted-foreground">
							Controls how strongly nodes are pulled toward their community center (1–15, default 2). Lower values reduce node crowding.
						</p>
						<ProgressBarSlider
							value={Math.round((settings.graphViz?.clusterForceStrength ?? 0.02) * 100)}
							min={1}
							max={15}
							step={1}
							onChange={(value) => update('graphViz', { ...(settings.graphViz ?? {}), clusterForceStrength: value / 100 })}
							showTooltip={false}
							displayPrecision={0}
						/>
					</div>
					<div className="pktw-flex pktw-flex-col pktw-gap-2">
						<label className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1">Physical Node Base Radius</label>
						<p className="pktw-text-xs pktw-text-muted-foreground">
							Base radius for physical nodes (Tag/Concept follow this). Default 6.
						</p>
						<ProgressBarSlider
							value={settings.graphViz?.nodeBaseRadiusPhysical ?? 6}
							min={3}
							max={14}
							step={1}
							onChange={(value) => update('graphViz', { ...(settings.graphViz ?? {}), nodeBaseRadiusPhysical: value })}
							showTooltip={false}
							displayPrecision={0}
						/>
					</div>
					<div className="pktw-flex pktw-flex-col pktw-gap-2">
						<label className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1">Semantic Node Base Radius</label>
						<p className="pktw-text-xs pktw-text-muted-foreground">
							Base radius for semantic nodes. Default 7.
						</p>
						<ProgressBarSlider
							value={settings.graphViz?.nodeBaseRadiusSemantic ?? 7}
							min={3}
							max={14}
							step={1}
							onChange={(value) => update('graphViz', { ...(settings.graphViz ?? {}), nodeBaseRadiusSemantic: value })}
							showTooltip={false}
							displayPrecision={0}
						/>
					</div>
					<div className="pktw-flex pktw-flex-col pktw-gap-2">
						<label className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1">Node Degree Boost</label>
						<p className="pktw-text-xs pktw-text-muted-foreground">
							Extra radius added when node degree goes from min to max. Default 16.
						</p>
						<ProgressBarSlider
							value={settings.graphViz?.nodeDegreeBoost ?? 16}
							min={0}
							max={30}
							step={1}
							onChange={(value) => update('graphViz', { ...(settings.graphViz ?? {}), nodeDegreeBoost: value })}
							showTooltip={false}
							displayPrecision={0}
						/>
					</div>
					<div className="pktw-flex pktw-flex-col pktw-gap-2">
						<label className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1" title="Only treat an edge as branch (MST style) if its smaller subtree has at least this many nodes.">
							Min branch nodes
						</label>
						<p className="pktw-text-xs pktw-text-muted-foreground">
							Edges with smaller subtree &lt; this use original style (not MST). Default 3.
						</p>
						<ProgressBarSlider
							value={settings.graphViz?.skeletonMinBranchNodes ?? 3}
							min={1}
							max={20}
							step={1}
							onChange={(value) => update('graphViz', { ...(settings.graphViz ?? {}), skeletonMinBranchNodes: value })}
							showTooltip={false}
							displayPrecision={0}
						/>
					</div>
				</div>
			</CollapsibleSettingsSection>

		</div>
	);
}
