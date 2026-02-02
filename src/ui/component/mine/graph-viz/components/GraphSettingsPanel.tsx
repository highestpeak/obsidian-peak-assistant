import React from 'react';
import { createPortal } from 'react-dom';
import { ProgressBarSlider } from '@/ui/component/mine/ProgressBarSlider';
import { Button } from '@/ui/component/shared-ui/button';
import type { GraphConfig } from '../config';
import { DEFAULT_CONFIG, SLIDER_CONFIGS } from '../config';

export interface GraphSettingsPanelProps {
	config: GraphConfig;
	onConfigChange: (config: GraphConfig) => void;
	onReset: () => void;
	position: { top: number; right: number } | null;
	show: boolean;
}

export const GraphSettingsPanel: React.FC<GraphSettingsPanelProps> = ({
	config,
	onConfigChange,
	onReset,
	position,
	show,
}) => {
	if (!show) return null;

	return createPortal(
		<div
			className="pktw-fixed pktw-z-[9999] pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-shadow-lg pktw-p-4 pktw-min-w-[240px]"
			style={position ? { top: position.top, right: position.right } : { top: 56, right: 12 }}
		>
			<div className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338] pktw-mb-3">Graph Settings</div>
			<div className="pktw-mb-4">
				<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
					Link Distance: {config.linkDistance}
				</label>
				<ProgressBarSlider
					value={config.linkDistance}
					min={SLIDER_CONFIGS.linkDistance.min}
					max={SLIDER_CONFIGS.linkDistance.max}
					step={SLIDER_CONFIGS.linkDistance.step}
					onChange={(value) => onConfigChange({ ...config, linkDistance: value })}
					showTooltip={false}
				/>
			</div>
			<div className="pktw-mb-4">
				<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
					Repulsion: {config.chargeStrength}
				</label>
				<ProgressBarSlider
					value={config.chargeStrength}
					min={SLIDER_CONFIGS.chargeStrength.min}
					max={SLIDER_CONFIGS.chargeStrength.max}
					step={SLIDER_CONFIGS.chargeStrength.step}
					onChange={(value) => onConfigChange({ ...config, chargeStrength: value })}
					showTooltip={false}
				/>
			</div>
			<div className="pktw-mb-3">
				<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
					Collision Radius: {config.collisionRadius}
				</label>
				<ProgressBarSlider
					value={config.collisionRadius}
					min={SLIDER_CONFIGS.collisionRadius.min}
					max={SLIDER_CONFIGS.collisionRadius.max}
					step={SLIDER_CONFIGS.collisionRadius.step}
					onChange={(value) => onConfigChange({ ...config, collisionRadius: value })}
					showTooltip={false}
				/>
			</div>
			<Button
				onClick={() => {
					onConfigChange(DEFAULT_CONFIG);
					onReset();
				}}
			>
				Reset to Default
			</Button>
		</div>,
		document.body
	);
};
