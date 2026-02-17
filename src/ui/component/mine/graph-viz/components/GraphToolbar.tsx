import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, Settings, Copy, ChevronDown, Check, SlidersHorizontal, RotateCw, Route, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { Switch } from '@/ui/component/shared-ui/switch';
import type { GraphCopyFormat, GraphConfig } from '../config';

export interface GraphToolbarProps {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFitToView: () => void;
	onRelayout?: () => void;
	onToggleSettings: () => void;
	onToggleTools?: () => void;
	onCopy: (format: GraphCopyFormat) => void;
	copyFormat: GraphCopyFormat;
	setCopyFormat: (format: GraphCopyFormat) => void;
	copyMenuOpen: boolean;
	setCopyMenuOpen: (open: boolean) => void;
	copiedTick: number;
	showCopy?: boolean;
	showZoom?: boolean;
	showSettings?: boolean;
	showTools?: boolean;
	settingsButtonRef?: React.RefObject<HTMLButtonElement | null>;
	toolsButtonRef?: React.RefObject<HTMLButtonElement | null>;
	/** Analysis (Hubs, MST, Hulls) and path controls in toolbar. */
	config?: GraphConfig;
	onConfigChange?: (config: GraphConfig) => void;
	pathMode?: boolean;
	pathSelectMode?: boolean;
	onTogglePathSelectMode?: () => void;
	onClearPath?: () => void;
	hasPathSelection?: boolean;
}

export const GraphToolbar: React.FC<GraphToolbarProps> = ({
	onZoomIn,
	onZoomOut,
	onFitToView,
	onRelayout,
	onToggleSettings,
	onToggleTools,
	onCopy,
	copyFormat,
	setCopyFormat,
	copyMenuOpen,
	setCopyMenuOpen,
	copiedTick,
	showCopy = true,
	showZoom = true,
	showSettings = true,
	showTools = true,
	settingsButtonRef,
	toolsButtonRef,
	config,
	onConfigChange,
	pathMode = false,
	pathSelectMode = false,
	onTogglePathSelectMode,
	onClearPath,
	hasPathSelection = false,
}) => {
	const [analysisMenuOpen, setAnalysisMenuOpen] = React.useState(false);
	return (
	<div className="pktw-absolute pktw-top-2 pktw-right-2 pktw-z-10 pktw-flex pktw-gap-1">
		{showCopy && (
			<div
				className="pktw-relative"
				onMouseEnter={() => setCopyMenuOpen(true)}
				onMouseLeave={() => setCopyMenuOpen(false)}
			>
				<Button
					onClick={() => onCopy(copyFormat)}
					className="pktw-group pktw-shadow-none"
					size="sm"
					variant="ghost"
					title={`Copy (${copyFormat})`}
				>
					{copiedTick > 0 ? (
						<Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600 group-hover:pktw-text-white" />
					) : (
						<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
					)}
					<ChevronDown className="pktw-absolute -pktw-right-1 -pktw-bottom-1 pktw-p-0 pktw-w-4 pktw-h-4 pktw-text-[#6c757d] group-hover:pktw-text-white" />
				</Button>
				{copyMenuOpen ? (
					<div className="pktw-absolute pktw-top-9 pktw-right-0 pktw-z-30 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-shadow-lg pktw-overflow-hidden">
						{(['markdown', 'json', 'mermaid'] as const).map((fmt) => (
							<Button
								key={fmt}
								variant="ghost"
								className="pktw-shadow-none pktw-block pktw-w-full pktw-text-left pktw-px-3 pktw-py-2 pktw-text-xs pktw-text-[#2e3338]"
								onClick={() => {
									setCopyFormat(fmt);
									setCopyMenuOpen(false);
									onCopy(fmt);
								}}
							>
								{fmt.toUpperCase()}
							</Button>
						))}
					</div>
				) : null}
			</div>
		)}
		{onRelayout && (
			<Button onClick={onRelayout} size="sm" variant="ghost" title="Relayout" className="pktw-group">
				<RotateCw className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
			</Button>
		)}
		{config && onConfigChange && (
			<div
				className="pktw-relative"
				onMouseEnter={() => setAnalysisMenuOpen(true)}
				onMouseLeave={() => setAnalysisMenuOpen(false)}
			>
				<Button
					size="sm"
					variant="ghost"
					title="Analysis (Hubs, MST, Hulls)"
					className="pktw-group"
				>
					<SlidersHorizontal className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
					<ChevronDown className="pktw-absolute -pktw-right-1 -pktw-bottom-1 pktw-p-0 pktw-w-4 pktw-h-4 pktw-text-[#6c757d] group-hover:pktw-text-white" />
				</Button>
				{analysisMenuOpen ? (
					<div className="pktw-absolute pktw-top-9 pktw-right-0 pktw-z-30 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-shadow-lg pktw-overflow-hidden pktw-min-w-[140px]">
						<div className="pktw-px-2 pktw-py-1.5 pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-tracking-wide pktw-text-[#9ca3af]">
							Analysis
						</div>
						<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-text-xs pktw-text-[#2e3338] hover:pktw-bg-[#f9fafb]">
							<Switch
								size="sm"
								checked={config.highlightHubs}
								onChange={(v) => onConfigChange({ ...config, highlightHubs: v })}
							/>
							<span>Hubs</span>
						</label>
						<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-text-xs pktw-text-[#2e3338] hover:pktw-bg-[#f9fafb]">
							<Switch
								size="sm"
								checked={config.skeletonMode}
								onChange={(v) => onConfigChange({ ...config, skeletonMode: v })}
							/>
							<span>MST</span>
						</label>
						<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-text-xs pktw-text-[#2e3338] hover:pktw-bg-[#f9fafb]">
							<Switch
								size="sm"
								checked={config.communityMode}
								onChange={(v) => onConfigChange({ ...config, communityMode: v })}
							/>
							<span>Hulls</span>
						</label>
					</div>
				) : null}
			</div>
		)}
		{pathMode && onTogglePathSelectMode && (
			<Button
				size="sm"
				variant={pathSelectMode ? 'secondary' : 'ghost'}
				title="Click two nodes to set start/end and highlight the shortest path."
				className="pktw-group"
				onClick={onTogglePathSelectMode}
			>
				<Route className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
			</Button>
		)}
		{hasPathSelection && onClearPath && (
			<Button size="sm" variant="ghost" title="Clear path" className="pktw-group" onClick={onClearPath}>
				<X className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
			</Button>
		)}
		{showZoom && (
			<>
				<Button onClick={onZoomIn} size="sm" variant="ghost" title="Zoom In" className="pktw-group">
					<ZoomIn className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
				</Button>
				<Button onClick={onZoomOut} size="sm" variant="ghost" title="Zoom Out" className="pktw-group">
					<ZoomOut className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
				</Button>
				<Button onClick={onFitToView} size="sm" variant="ghost" title="Fit to View" className="pktw-group">
					<Maximize2 className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
				</Button>
			</>
		)}
		{showSettings && (
			<Button
				ref={settingsButtonRef as React.RefObject<HTMLButtonElement>}
				onClick={onToggleSettings}
				size="sm"
				variant="ghost"
				title="Settings"
				className="pktw-group"
			>
				<Settings className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
			</Button>
		)}
		{showTools && onToggleTools && (
			<Button
				ref={toolsButtonRef as React.RefObject<HTMLButtonElement>}
				onClick={onToggleTools}
				size="sm"
				variant="ghost"
				title="Tools"
				className="pktw-group"
			>
				<SlidersHorizontal className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d] group-hover:pktw-text-white" />
			</Button>
		)}
	</div>
	);
};
