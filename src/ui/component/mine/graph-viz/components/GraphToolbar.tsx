import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, Settings, Copy, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { GraphCopyFormat } from '../config';

export interface GraphToolbarProps {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFitToView: () => void;
	onToggleSettings: () => void;
	onCopy: (format: GraphCopyFormat) => void;
	copyFormat: GraphCopyFormat;
	setCopyFormat: (format: GraphCopyFormat) => void;
	copyMenuOpen: boolean;
	setCopyMenuOpen: (open: boolean) => void;
	copiedTick: number;
	showCopy?: boolean;
	showZoom?: boolean;
	showSettings?: boolean;
	settingsButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export const GraphToolbar: React.FC<GraphToolbarProps> = ({
	onZoomIn,
	onZoomOut,
	onFitToView,
	onToggleSettings,
	onCopy,
	copyFormat,
	setCopyFormat,
	copyMenuOpen,
	setCopyMenuOpen,
	copiedTick,
	showCopy = true,
	showZoom = true,
	showSettings = true,
	settingsButtonRef,
}) => (
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
	</div>
);
