import React, { useState, useCallback } from 'react';
import { MyPluginSettings } from '@/app/settings/types';
import { CommandHiddenControlService } from '@/service/CommandHiddenControlService';
import { cn } from '@/ui/react/lib/utils';
import { VisibilityToggle } from '@/ui/component/shared-ui/visibility-toggle';
import { SettingField } from './setting-field';

type MenuTypeId = 'slash-commands' | 'command-palette' | 'ribbon-icons';

interface MenuType {
	id: MenuTypeId;
	label: string;
	desc: string;
}

const menuTypes: MenuType[] = [
	{ id: 'slash-commands', label: 'Slash Commands', desc: 'Slash commands (/) in markdown editor' },
	{ id: 'command-palette', label: 'Command Palette', desc: 'Commands in Command Palette (Cmd/Ctrl+P)' },
	{ id: 'ribbon-icons', label: 'Ribbon Icons', desc: 'Icons in the left sidebar ribbon' },
];

/**
 * Check if a menu item title is "Delete" (case-insensitive)
 */
function isDeleteItem(title: string): boolean {
	if (!title) return false;
	const norm = title.trim().toLowerCase();
	return norm === 'delete';
}

interface CommandHiddenPluginProps {
	settings: MyPluginSettings;
	commandHiddenControlService: CommandHiddenControlService | null;
	updateSettings: (updates: Partial<MyPluginSettings>) => Promise<void>;
}

/**
 * Command Hidden Plugin component for managing command visibility
 */
export function CommandHiddenPlugin({
	settings,
	commandHiddenControlService,
	updateSettings,
}: CommandHiddenPluginProps) {
	const [activeMenuType, setActiveMenuType] = useState<MenuTypeId>('slash-commands');
	const [isListCollapsed, setIsListCollapsed] = useState(true);
	const [, forceUpdate] = useState(0);

	// Force re-render when settings change
	const refresh = useCallback(() => {
		forceUpdate((n) => n + 1);
	}, []);

	const handleRefresh = useCallback(() => {
		refresh();
	}, [refresh]);

	const discovered = commandHiddenControlService?.getDiscovered(activeMenuType) || [];
	const hiddenByType = settings.commandHidden.hiddenMenuItems;
	const hiddenMap = hiddenByType[activeMenuType] || {};

	const handleToggleVisibility = useCallback(
		async (title: string, nextHidden: boolean) => {
			const categoryId = activeMenuType;
			const updatedHidden = { ...hiddenByType };
			if (!updatedHidden[categoryId]) {
				updatedHidden[categoryId] = {};
			}

			if (nextHidden) {
				updatedHidden[categoryId][title] = true;
			} else {
				delete updatedHidden[categoryId][title];
				if (Object.keys(updatedHidden[categoryId]).length === 0) {
					delete updatedHidden[categoryId];
				}
			}

			await updateSettings({
				commandHidden: {
					...settings.commandHidden,
					hiddenMenuItems: updatedHidden,
				},
			});

			commandHiddenControlService?.updateSettings({
				...settings.commandHidden,
				hiddenMenuItems: updatedHidden,
			});
		},
		[activeMenuType, hiddenByType, settings.commandHidden, updateSettings, commandHiddenControlService]
	);

	const handleHideAll = useCallback(async () => {
		const updatedHidden = { ...hiddenByType };
		if (!updatedHidden[activeMenuType]) {
			updatedHidden[activeMenuType] = {};
		}

		discovered.forEach((title) => {
			// Exclude "Delete" item from hide all operation
			if (title && !isDeleteItem(title)) {
				updatedHidden[activeMenuType][title] = true;
			}
		});

		await updateSettings({
			commandHidden: {
				...settings.commandHidden,
				hiddenMenuItems: updatedHidden,
			},
		});

		commandHiddenControlService?.updateSettings({
			...settings.commandHidden,
			hiddenMenuItems: updatedHidden,
		});
	}, [activeMenuType, discovered, hiddenByType, settings.commandHidden, updateSettings, commandHiddenControlService]);

	const handleShowAll = useCallback(async () => {
		const updatedHidden = { ...hiddenByType };
		if (updatedHidden[activeMenuType]) {
			discovered.forEach((title) => {
				if (title) delete updatedHidden[activeMenuType][title];
			});
			if (Object.keys(updatedHidden[activeMenuType]).length === 0) {
				delete updatedHidden[activeMenuType];
			}
		}

		await updateSettings({
			commandHidden: {
				...settings.commandHidden,
				hiddenMenuItems: updatedHidden,
			},
		});

		commandHiddenControlService?.updateSettings({
			...settings.commandHidden,
			hiddenMenuItems: updatedHidden,
		});
	}, [activeMenuType, discovered, hiddenByType, settings.commandHidden, updateSettings, commandHiddenControlService]);

	return (
		<>
			<div className="peak-settings-description pktw-mb-4">
				Control which commands are hidden. Items are automatically discovered. Click the eye icon to toggle visibility.
			</div>

			{/* Refresh Button */}
			<SettingField
				label="Refresh Menu Items"
				description="Click to manually refresh discovered menu items. You can also right-click in different contexts to automatically discover items."
			>
				<button
					className="pktw-px-4 pktw-py-2 pktw-bg-accent pktw-text-white pktw-rounded-md pktw-text-sm pktw-font-medium hover:pktw-opacity-90 pktw-transition-opacity"
					onClick={handleRefresh}
				>
					Refresh Now
				</button>
			</SettingField>

			{/* Sub Tabs */}
			<div className="peak-ui-control-tabs">
				{menuTypes.map((menuType) => (
					<button
						key={menuType.id}
						className={cn(
							'peak-ui-control-tab',
							activeMenuType === menuType.id && 'is-active'
						)}
						onClick={() => setActiveMenuType(menuType.id)}
					>
						{menuType.label}
					</button>
				))}
			</div>

			{/* Tab Content */}
			<div className="peak-ui-control-tab-content">
				<p className="peak-settings-description">{menuTypes.find((m) => m.id === activeMenuType)?.desc}</p>

				{/* Bulk Actions */}
				<div className="peak-bulk-actions-wrapper">
					<div className="peak-bulk-actions-info">
						<div className="peak-bulk-actions-name">Bulk Actions</div>
						<div className="peak-bulk-actions-desc">Control visibility of all commands and icons</div>
					</div>
					<div className="peak-bulk-actions">
						<button className="peak-bulk-action hide-all" onClick={handleHideAll}>
							Hide All
						</button>
						<button className="peak-bulk-action show-all" onClick={handleShowAll}>
							Display All
						</button>
						{isListCollapsed ? (
							<button
								className="peak-bulk-action expand-list"
								onClick={() => setIsListCollapsed(false)}
							>
								Expand List
							</button>
						) : (
							<button
								className="peak-bulk-action collapse-list"
								onClick={() => setIsListCollapsed(true)}
							>
								Collapse List
							</button>
						)}
					</div>
				</div>

				{/* List Container */}
				<div className={cn('peak-menu-list-container', isListCollapsed && 'is-collapsed')}>
					{discovered.length === 0 ? (
						<div className="peak-empty-state">No items discovered yet. They will appear once detected.</div>
					) : (
						<div className="peak-menu-section">
							<div className="peak-menu-items-list">
								{discovered.map((title) => {
									const isHidden = hiddenMap[title] === true;
									const currentHidden = isHidden;

									return (
										<div key={title} className="peak-menu-item-row">
											<span className="peak-menu-item-title">{title}</span>
											<VisibilityToggle
												isHidden={currentHidden}
												onToggle={() => void handleToggleVisibility(title, !currentHidden)}
											/>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	);
}