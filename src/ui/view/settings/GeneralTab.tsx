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

function SettingRow({
	label,
	description,
	control,
}: {
	label: string;
	description?: string;
	control: React.ReactNode;
}) {
	return (
		<div className="pktw-flex pktw-items-start pktw-gap-4">
			<div className="pktw-flex-1 pktw-min-w-0">
				<span className="pktw-block pktw-text-sm pktw-font-medium pktw-mb-1">{label}</span>
				{description && (
					<span className="pktw-block pktw-text-xs pktw-text-muted-foreground">{description}</span>
				)}
			</div>
			<div className="pktw-flex-shrink-0">{control}</div>
		</div>
	);
}

/**
 * General settings tab with basic configuration options.
 */
export function GeneralTab({ settings, settingsUpdates }: GeneralTabProps) {
	const { update, updateAI } = settingsUpdates;

	return (
		<div className="peak-settings-card pktw-space-y-4">
			{/* Folders Section */}
			<CollapsibleSettingsSection title="Folders">
				<div className="pktw-space-y-6">
					<SettingRow
						label="Data Storage Folder"
						description="Folder for storing plugin data files (e.g., search database). Leave empty to use plugin directory."
						control={
							<div className="pktw-w-64">
								<InputWithConfirm
									type="text"
									placeholder="Leave empty for plugin directory"
									value={settings.dataStorageFolder || ''}
									onConfirm={(value) => update('dataStorageFolder', value.trim())}
								/>
							</div>
						}
					/>
					<SettingRow
						label="Chat Root Folder"
						description="Root folder for AI conversation data (Prompts, Attachments, Hub-Summaries, etc. are derived automatically)."
						control={
							<div className="pktw-w-64">
								<InputWithConfirm
									type="text"
									placeholder="Enter chat root folder"
									value={settings.ai.rootFolder}
									onConfirm={(value) => updateAI('rootFolder', value)}
								/>
							</div>
						}
					/>
				</div>
			</CollapsibleSettingsSection>

			{/* Behavior Section */}
			<CollapsibleSettingsSection title="Behavior">
				<div className="pktw-space-y-6">
					<SettingRow
						label="Attachment Handling"
						description="How attachments are sent to the model. 'Direct' requires model vision support; 'Degrade to text' uses OCR/parsing for compatibility."
						control={
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
						}
					/>
				</div>
			</CollapsibleSettingsSection>

			{/* Developer Section */}
			<CollapsibleSettingsSection title="Developer">
				<div className="pktw-space-y-6">
					<SettingRow
						label="Enable DevTools Graph Inspector"
						description="Exposes window.testGraphTools in browser DevTools console with convenience methods for graph testing."
						control={
							<Switch
								checked={settings.enableDevTools ?? false}
								onChange={(checked) => update('enableDevTools', checked)}
							/>
						}
					/>

					{/* Graph Visualization subsection */}
					<details className="pktw-group">
						<summary className="pktw-cursor-pointer pktw-select-none pktw-text-sm pktw-font-medium pktw-text-muted-foreground pktw-list-none pktw-flex pktw-items-center pktw-gap-1 pktw-mb-4">
							<span className="pktw-transition-transform group-open:pktw-rotate-90">▶</span>
							<span>Graph Visualization Tuning</span>
						</summary>
						<div className="pktw-space-y-6 pktw-pl-4 pktw-border-l pktw-border-border">
							<div className="pktw-flex pktw-flex-col pktw-gap-2">
								<span
									className="pktw-text-sm pktw-font-medium"
									title="Strength of the force that pulls nodes toward their community center. Lower = looser clusters; higher = tighter clusters."
								>
									Cluster Force Strength
								</span>
								<span className="pktw-text-xs pktw-text-muted-foreground">
									Controls how strongly nodes are pulled toward their community center (1–15, default 2).
								</span>
								<ProgressBarSlider
									value={Math.round((settings.graphViz?.clusterForceStrength ?? 0.02) * 100)}
									min={1}
									max={15}
									step={1}
									onChange={(value) =>
										update('graphViz', { ...(settings.graphViz ?? {}), clusterForceStrength: value / 100 })
									}
									showTooltip={false}
									displayPrecision={0}
								/>
							</div>
							<div className="pktw-flex pktw-flex-col pktw-gap-2">
								<span className="pktw-text-sm pktw-font-medium">Physical Node Base Radius</span>
								<span className="pktw-text-xs pktw-text-muted-foreground">
									Base radius for physical nodes (Tag/Concept follow this). Default 6.
								</span>
								<ProgressBarSlider
									value={settings.graphViz?.nodeBaseRadiusPhysical ?? 6}
									min={3}
									max={14}
									step={1}
									onChange={(value) =>
										update('graphViz', { ...(settings.graphViz ?? {}), nodeBaseRadiusPhysical: value })
									}
									showTooltip={false}
									displayPrecision={0}
								/>
							</div>
							<div className="pktw-flex pktw-flex-col pktw-gap-2">
								<span className="pktw-text-sm pktw-font-medium">Semantic Node Base Radius</span>
								<span className="pktw-text-xs pktw-text-muted-foreground">
									Base radius for semantic nodes. Default 7.
								</span>
								<ProgressBarSlider
									value={settings.graphViz?.nodeBaseRadiusSemantic ?? 7}
									min={3}
									max={14}
									step={1}
									onChange={(value) =>
										update('graphViz', { ...(settings.graphViz ?? {}), nodeBaseRadiusSemantic: value })
									}
									showTooltip={false}
									displayPrecision={0}
								/>
							</div>
							<div className="pktw-flex pktw-flex-col pktw-gap-2">
								<span className="pktw-text-sm pktw-font-medium">Node Degree Boost</span>
								<span className="pktw-text-xs pktw-text-muted-foreground">
									Extra radius added when node degree goes from min to max. Default 16.
								</span>
								<ProgressBarSlider
									value={settings.graphViz?.nodeDegreeBoost ?? 16}
									min={0}
									max={30}
									step={1}
									onChange={(value) =>
										update('graphViz', { ...(settings.graphViz ?? {}), nodeDegreeBoost: value })
									}
									showTooltip={false}
									displayPrecision={0}
								/>
							</div>
							<div className="pktw-flex pktw-flex-col pktw-gap-2">
								<span
									className="pktw-text-sm pktw-font-medium"
									title="Only treat an edge as branch (MST style) if its smaller subtree has at least this many nodes."
								>
									Min Branch Nodes
								</span>
								<span className="pktw-text-xs pktw-text-muted-foreground">
									Edges with smaller subtree &lt; this use original style (not MST). Default 3.
								</span>
								<ProgressBarSlider
									value={settings.graphViz?.skeletonMinBranchNodes ?? 3}
									min={1}
									max={20}
									step={1}
									onChange={(value) =>
										update('graphViz', { ...(settings.graphViz ?? {}), skeletonMinBranchNodes: value })
									}
									showTooltip={false}
									displayPrecision={0}
								/>
							</div>
						</div>
					</details>
				</div>
			</CollapsibleSettingsSection>

		</div>
	);
}
