import React, { useCallback, useState, useEffect, useMemo } from 'react';
import type { LLMOutputControlSettings } from '@/core/providers/types';
import { OUTPUT_CONTROL_SETTINGS_ITEMS, DEFAULT_OUTPUT_CONTROL_VALUES } from './constants';
import { ControlSettingItem } from './ControlSettingItem';

export interface OutputControlSettingsListProps {
	settings: LLMOutputControlSettings;
	onChange: (settings: LLMOutputControlSettings) => void;
	/**
	 * Variant style for different use cases
	 * - 'compact': For popover/compact UI
	 * - 'default': For settings page
	 */
	variant?: 'compact' | 'default';
	/**
	 * Whether to use local state management
	 * If true, component manages its own local state and syncs with props
	 * If false, component directly uses props values (controlled mode)
	 */
	useLocalState?: boolean;
}

/**
 * Reusable component for displaying and editing LLM output control settings.
 */
export const OutputControlSettingsList: React.FC<OutputControlSettingsListProps> = ({
	settings,
	onChange,
	variant = 'default',
	useLocalState = false,
}) => {
	const [localSettings, setLocalSettings] = useState<LLMOutputControlSettings>(settings);

	// Ensure all settings have default values if not set (default enabled)
	const effectiveSettings = useMemo(() => {
		const result = { ...settings } as Record<keyof LLMOutputControlSettings, number | string>;
		OUTPUT_CONTROL_SETTINGS_ITEMS.forEach((item) => {
			if (result[item.key] === undefined) {
				result[item.key] = DEFAULT_OUTPUT_CONTROL_VALUES[item.key] as number | string;
			}
		});
		return result as LLMOutputControlSettings;
	}, [settings]);

	// Sync with external changes when using local state
	useEffect(() => {
		if (useLocalState) {
			setLocalSettings(effectiveSettings);
		}
	}, [effectiveSettings, useLocalState]);

	const currentSettings = useLocalState ? localSettings : effectiveSettings;

	const handleUpdateSetting = useCallback(
		(key: keyof LLMOutputControlSettings, value: number | string | undefined) => {
			const newSettings = { ...currentSettings, [key]: value };
			if (useLocalState) {
				setLocalSettings(newSettings);
			}
			onChange(newSettings);
		},
		[currentSettings, onChange, useLocalState]
	);


	return (
		<div className="pktw-flex pktw-flex-col">
			{OUTPUT_CONTROL_SETTINGS_ITEMS.map((item) => {
				const value = currentSettings[item.key];
				// Always enabled (value is always defined due to effectiveSettings)
				const enabled = true;
				return (
					<ControlSettingItem
						key={item.key}
						label={item.label}
						paramName={item.paramName}
						tooltip={item.tooltip}
						icon={item.icon}
						value={value}
						enabled={enabled}
						type={item.type}
						min={item.min}
						max={item.max}
						step={item.step}
						options={item.options}
						onValueChange={(newValue) => handleUpdateSetting(item.key, newValue)}
						onEnabledChange={() => {}} // No-op since always enabled
						variant={variant}
						hideCheckbox={true}
					/>
				);
			})}
		</div>
	);
};

