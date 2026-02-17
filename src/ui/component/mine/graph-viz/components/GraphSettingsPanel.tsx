import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ProgressBarSlider } from '@/ui/component/mine/ProgressBarSlider';
import { Button } from '@/ui/component/shared-ui/button';
import { Switch } from '@/ui/component/shared-ui/switch';
import type { GraphConfig, SemanticEdgeStyle } from '../config';
import { DEFAULT_CONFIG, SLIDER_CONFIGS, FORCE_SLIDER_SCALE } from '../config';

/** Collapsible section: clickable header with chevron, content when expanded. */
function CollapsibleSection({
	title,
	open,
	onToggle,
	children,
}: {
	title: string;
	open: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}) {
	return (
		<div className="pktw-mb-2">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={onToggle}
				className="pktw-w-full pktw-flex pktw-items-center pktw-justify-start pktw-gap-1.5"
			>
				{open ? <ChevronDown className="pktw-w-4 pktw-h-4" /> : <ChevronRight className="pktw-w-4 pktw-h-4" />}
				<span>{title}</span>
			</Button>
			{open && <div className="pktw-mt-2">{children}</div>}
		</div>
	);
}

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
	const [displayOpen, setDisplayOpen] = useState(false);
	const [forcesOpen, setForcesOpen] = useState(false);
	const [nodesOpen, setNodesOpen] = useState(false);
	const [edgesOpen, setEdgesOpen] = useState(false);
	const [colorsOpen, setColorsOpen] = useState(false);
	const [hubsOpen, setHubsOpen] = useState(false);
	const [mstOpen, setMstOpen] = useState(false);
	const [pathOpen, setPathOpen] = useState(false);

	if (!show) return null;

	const top = position?.top ?? 56;
	const right = position?.right ?? 12;
	const panelStyle: React.CSSProperties = {
		position: 'fixed',
		top,
		right,
		zIndex: 9999,
		minWidth: 240,
		maxHeight: `calc(100vh - ${top + 12}px)`,
		overflowY: 'auto',
		overflowX: 'hidden',
		WebkitOverflowScrolling: 'touch',
	};

	return createPortal(
		<div
			className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-shadow-lg pktw-p-4 pktw-min-w-[240px]"
			style={panelStyle}
		>
			<CollapsibleSection title="Display" open={displayOpen} onToggle={() => setDisplayOpen((o) => !o)}>
				<div className="pktw-space-y-2 pktw-mb-3">
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Show tag nodes and their edges. When off, tags and isolated nodes are hidden.">
						<Switch size="sm" checked={config.showTags} onChange={(v) => onConfigChange({ ...config, showTags: v })} />
						<span>Tags</span>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Show AI-inferred semantic edges in the graph.">
						<Switch size="sm" checked={config.showSemanticEdges} onChange={(v) => onConfigChange({ ...config, showSemanticEdges: v })} />
						<span>Semantic edges</span>
					</label>
				</div>
			</CollapsibleSection>
			<CollapsibleSection title="Forces" open={forcesOpen} onToggle={() => setForcesOpen((o) => !o)}>
				<div className="pktw-mb-4" title="Pulls nodes toward the center of the graph. Higher = stronger pull.">
					<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
						Center force: {Math.round(config.centerStrength * FORCE_SLIDER_SCALE)}
					</label>
					<ProgressBarSlider
						value={config.centerStrength * FORCE_SLIDER_SCALE}
						min={SLIDER_CONFIGS.centerStrength.min}
						max={SLIDER_CONFIGS.centerStrength.max}
						step={SLIDER_CONFIGS.centerStrength.step}
						onChange={(value) => onConfigChange({ ...config, centerStrength: value / FORCE_SLIDER_SCALE })}
						showTooltip={false}
						displayPrecision={0}
					/>
				</div>
				<div className="pktw-mb-4" title="Repulsion between nodes. More negative = nodes spread apart more.">
					<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
						Repel force: {config.chargeStrength}
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
				<div className="pktw-mb-4" title="Strength of links pulling connected nodes together.">
					<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
						Link force: {Math.round(config.linkStrength * FORCE_SLIDER_SCALE)}
					</label>
					<ProgressBarSlider
						value={config.linkStrength * FORCE_SLIDER_SCALE}
						min={SLIDER_CONFIGS.linkStrength.min}
						max={SLIDER_CONFIGS.linkStrength.max}
						step={SLIDER_CONFIGS.linkStrength.step}
						onChange={(value) => onConfigChange({ ...config, linkStrength: value / FORCE_SLIDER_SCALE })}
						showTooltip={false}
						displayPrecision={0}
					/>
				</div>
				<div className="pktw-mb-4" title="Preferred distance between connected nodes (pixels).">
					<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
						Link distance: {config.linkDistance}
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
				<div className="pktw-mb-4" title="Extra padding added to node radius to prevent overlap.">
					<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
						Collision radius: {config.collisionRadius}
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
				<div className="pktw-mb-3" title="When cluster layout is on, how strongly nodes are pulled toward their community center.">
					<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
						Cluster force: {Math.round(config.clusterForceStrength * 100)}
					</label>
					<ProgressBarSlider
						value={config.clusterForceStrength * 100}
						min={SLIDER_CONFIGS.clusterForceStrength.min}
						max={SLIDER_CONFIGS.clusterForceStrength.max}
						step={SLIDER_CONFIGS.clusterForceStrength.step}
						onChange={(value) => onConfigChange({ ...config, clusterForceStrength: value / 100 })}
						showTooltip={false}
						displayPrecision={0}
					/>
				</div>
			</CollapsibleSection>
			<CollapsibleSection title="Nodes" open={nodesOpen} onToggle={() => setNodesOpen((o) => !o)}>
				<div className="pktw-space-y-2 pktw-mb-3">
					<div className="pktw-mb-4" title="Base radius for physical nodes (Tag/Concept follow this).">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Physical base: {config.nodeBaseRadiusPhysical}
						</label>
						<ProgressBarSlider
							value={config.nodeBaseRadiusPhysical}
							min={SLIDER_CONFIGS.nodeBaseRadiusPhysical.min}
							max={SLIDER_CONFIGS.nodeBaseRadiusPhysical.max}
							step={SLIDER_CONFIGS.nodeBaseRadiusPhysical.step}
							onChange={(value) => onConfigChange({ ...config, nodeBaseRadiusPhysical: value })}
							showTooltip={false}
							displayPrecision={0}
						/>
					</div>
					<div className="pktw-mb-4" title="Base radius for semantic nodes.">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Semantic base: {config.nodeBaseRadiusSemantic}
						</label>
						<ProgressBarSlider
							value={config.nodeBaseRadiusSemantic}
							min={SLIDER_CONFIGS.nodeBaseRadiusSemantic.min}
							max={SLIDER_CONFIGS.nodeBaseRadiusSemantic.max}
							step={SLIDER_CONFIGS.nodeBaseRadiusSemantic.step}
							onChange={(value) => onConfigChange({ ...config, nodeBaseRadiusSemantic: value })}
							showTooltip={false}
							displayPrecision={0}
						/>
					</div>
					<div className="pktw-mb-3" title="Extra radius when degree goes from min to max.">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Degree boost: {config.nodeDegreeBoost}
						</label>
						<ProgressBarSlider
							value={config.nodeDegreeBoost}
							min={SLIDER_CONFIGS.nodeDegreeBoost.min}
							max={SLIDER_CONFIGS.nodeDegreeBoost.max}
							step={SLIDER_CONFIGS.nodeDegreeBoost.step}
							onChange={(value) => onConfigChange({ ...config, nodeDegreeBoost: value })}
							showTooltip={false}
							displayPrecision={0}
						/>
					</div>
				</div>
			</CollapsibleSection>
			<CollapsibleSection title="Edges" open={edgesOpen} onToggle={() => setEdgesOpen((o) => !o)}>
				<div className="pktw-space-y-2 pktw-mb-3">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Line style for semantic (AI-inferred) edges.">
						<span className="pktw-w-24">Semantic</span>
						<div className="pktw-flex pktw-rounded pktw-border pktw-border-[#e5e7eb] pktw-overflow-hidden">
							{(['solid', 'dashed', 'dotted'] as const).map((style) => (
								<Button
									key={style}
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => onConfigChange({ ...config, semanticEdgeStyle: style })}
									className={`pktw-px-2 pktw-py-1 pktw-text-xs pktw-capitalize pktw-rounded-none ${config.semanticEdgeStyle === style
											? 'pktw-bg-[#e5e7eb] pktw-text-[#374151]'
											: 'pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#f3f4f6]'
										}`}
								>
									{style}
								</Button>
							))}
						</div>
					</div>
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Line style for physical (file-based) edges.">
						<span className="pktw-w-24">Physical</span>
						<div className="pktw-flex pktw-rounded pktw-border pktw-border-[#e5e7eb] pktw-overflow-hidden">
							{(['solid', 'dashed', 'dotted'] as const).map((style) => (
								<Button
									key={style}
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => onConfigChange({ ...config, physicalEdgeStyle: style })}
									className={`pktw-px-2 pktw-py-1 pktw-text-xs pktw-capitalize pktw-rounded-none ${config.physicalEdgeStyle === style
										? 'pktw-bg-[#e5e7eb] pktw-text-[#374151]'
										: 'pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#f3f4f6]'
									}`}
								>
									{style}
								</Button>
							))}
						</div>
					</div>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Opacity of semantic edges.">
						<span className="pktw-w-24">Semantic opacity</span>
						<input
							type="range"
							min={0}
							max={1}
							step={0.05}
							value={config.semanticEdgeOpacity}
							onChange={(e) => onConfigChange({ ...config, semanticEdgeOpacity: parseFloat(e.target.value) })}
							className="pktw-flex-1"
						/>
						<span className="pktw-w-8">{Math.round(config.semanticEdgeOpacity * 100)}%</span>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Width scale of semantic edges.">
						<span className="pktw-w-24">Semantic width</span>
						<input
							type="range"
							min={0.5}
							max={6}
							step={0.1}
							value={config.semanticEdgeWidthScale}
							onChange={(e) => onConfigChange({ ...config, semanticEdgeWidthScale: parseFloat(e.target.value) })}
							className="pktw-flex-1"
						/>
						<span className="pktw-w-8">{config.semanticEdgeWidthScale.toFixed(1)}</span>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Opacity of physical edges.">
						<span className="pktw-w-24">Physical opacity</span>
						<input
							type="range"
							min={0}
							max={1}
							step={0.05}
							value={config.physicalEdgeOpacity}
							onChange={(e) => onConfigChange({ ...config, physicalEdgeOpacity: parseFloat(e.target.value) })}
							className="pktw-flex-1"
						/>
						<span className="pktw-w-8">{Math.round(config.physicalEdgeOpacity * 100)}%</span>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Width scale of physical edges.">
						<span className="pktw-w-24">Physical width</span>
						<input
							type="range"
							min={0.5}
							max={6}
							step={0.1}
							value={config.physicalEdgeWidthScale}
							onChange={(e) => onConfigChange({ ...config, physicalEdgeWidthScale: parseFloat(e.target.value) })}
							className="pktw-flex-1"
						/>
						<span className="pktw-w-8">{config.physicalEdgeWidthScale.toFixed(1)}</span>
					</label>
				</div>
			</CollapsibleSection>
			<CollapsibleSection title="Colors" open={colorsOpen} onToggle={() => setColorsOpen((o) => !o)}>
				<div className="pktw-space-y-2">
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Fill color for tag-type nodes.">
						<span className="pktw-w-24">Tag node</span>
						<input
							type="color"
							value={config.tagNodeFill}
							onChange={(e) => onConfigChange({ ...config, tagNodeFill: e.target.value })}
							className="pktw-h-6 pktw-w-10 pktw-cursor-pointer pktw-rounded pktw-border pktw-border-[#e5e7eb]"
						/>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Stroke color for semantic edges.">
						<span className="pktw-w-24">Semantic link</span>
						<input
							type="color"
							value={config.semanticLinkStroke}
							onChange={(e) => onConfigChange({ ...config, semanticLinkStroke: e.target.value })}
							className="pktw-h-6 pktw-w-10 pktw-cursor-pointer pktw-rounded pktw-border pktw-border-[#e5e7eb]"
						/>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Stroke color for physical edges.">
						<span className="pktw-w-24">Physical link</span>
						<input
							type="color"
							value={config.physicalLinkStroke}
							onChange={(e) => onConfigChange({ ...config, physicalLinkStroke: e.target.value })}
							className="pktw-h-6 pktw-w-10 pktw-cursor-pointer pktw-rounded pktw-border pktw-border-[#e5e7eb]"
						/>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Fill color for nodes with semantic edges.">
						<span className="pktw-w-24">Semantic node</span>
						<input
							type="color"
							value={config.semanticNodeFill}
							onChange={(e) => onConfigChange({ ...config, semanticNodeFill: e.target.value })}
							className="pktw-h-6 pktw-w-10 pktw-cursor-pointer pktw-rounded pktw-border pktw-border-[#e5e7eb]"
						/>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Fill color for nodes with only physical edges.">
						<span className="pktw-w-24">Physical node</span>
						<input
							type="color"
							value={config.physicalNodeFill}
							onChange={(e) => onConfigChange({ ...config, physicalNodeFill: e.target.value })}
							className="pktw-h-6 pktw-w-10 pktw-cursor-pointer pktw-rounded pktw-border pktw-border-[#e5e7eb]"
						/>
					</label>
				</div>
			</CollapsibleSection>
			<CollapsibleSection title="Hubs" open={hubsOpen} onToggle={() => setHubsOpen((o) => !o)}>
				<div className="pktw-space-y-2 pktw-mb-3">
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Number of highest-degree nodes to highlight as hubs.">
						<span className="pktw-w-24">Top N</span>
						<input
							type="number"
							min={1}
							max={500}
							value={config.hubTopN}
							onChange={(e) =>
								onConfigChange({
									...config,
									hubTopN: Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1)),
								})
							}
							className="pktw-w-16 pktw-text-xs pktw-rounded pktw-border pktw-border-[#e5e7eb] pktw-px-1"
						/>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Halo color for hub nodes.">
						<span className="pktw-w-24">Hub color</span>
						<input
							type="color"
							value={config.hubColor}
							onChange={(e) => onConfigChange({ ...config, hubColor: e.target.value })}
							className="pktw-h-6 pktw-w-10 pktw-cursor-pointer pktw-rounded pktw-border pktw-border-[#e5e7eb]"
						/>
					</label>
				</div>
			</CollapsibleSection>
			<CollapsibleSection title="MST" open={mstOpen} onToggle={() => setMstOpen((o) => !o)}>
				<div className="pktw-space-y-2 pktw-mb-3">
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Color for Maximum Spanning Tree edges (skeleton mode).">
						<span className="pktw-w-24">Color</span>
						<input
							type="color"
							value={config.mstColor}
							onChange={(e) => onConfigChange({ ...config, mstColor: e.target.value })}
							className="pktw-h-6 pktw-w-10 pktw-cursor-pointer pktw-rounded pktw-border pktw-border-[#e5e7eb]"
						/>
					</label>
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Line style for MST edges.">
						<span className="pktw-w-24">Style</span>
						<div className="pktw-flex pktw-rounded pktw-border pktw-border-[#e5e7eb] pktw-overflow-hidden">
							{(['solid', 'dashed', 'dotted'] as const).map((style) => (
								<Button
									key={style}
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => onConfigChange({ ...config, mstEdgeStyle: style })}
									className={`pktw-px-2 pktw-py-1 pktw-text-xs pktw-capitalize pktw-rounded-none ${config.mstEdgeStyle === style
										? 'pktw-bg-[#e5e7eb] pktw-text-[#374151]'
										: 'pktw-bg-white pktw-text-[#6c757d] hover:pktw-bg-[#f3f4f6]'
									}`}
								>
									{style}
								</Button>
							))}
						</div>
					</div>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Opacity of MST edges.">
						<span className="pktw-w-24">Opacity</span>
						<input
							type="range"
							min={0.1}
							max={1}
							step={0.1}
							value={config.mstEdgeOpacity}
							onChange={(e) => onConfigChange({ ...config, mstEdgeOpacity: parseFloat(e.target.value) })}
							className="pktw-flex-1"
						/>
						<span className="pktw-w-8">{Math.round(config.mstEdgeOpacity * 100)}%</span>
					</label>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Width scale of MST edges.">
						<span className="pktw-w-24">Width</span>
						<input
							type="range"
							min={0.5}
							max={5}
							step={0.25}
							value={config.mstWidthScale}
							onChange={(e) => onConfigChange({ ...config, mstWidthScale: parseFloat(e.target.value) })}
							className="pktw-flex-1"
						/>
						<span className="pktw-w-8">{config.mstWidthScale.toFixed(1)}</span>
					</label>
					<div className="pktw-mb-4" title="Only treat an edge as branch (MST style) if its smaller subtree has at least this many nodes; otherwise use original style.">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Min branch nodes: {config.skeletonMinBranchNodes}
						</label>
						<ProgressBarSlider
							value={config.skeletonMinBranchNodes}
							min={SLIDER_CONFIGS.skeletonMinBranchNodes.min}
							max={SLIDER_CONFIGS.skeletonMinBranchNodes.max}
							step={SLIDER_CONFIGS.skeletonMinBranchNodes.step}
							onChange={(value) => onConfigChange({ ...config, skeletonMinBranchNodes: value })}
							showTooltip={false}
							displayPrecision={0}
						/>
					</div>
				</div>
			</CollapsibleSection>
			<CollapsibleSection title="Path" open={pathOpen} onToggle={() => setPathOpen((o) => !o)}>
				<div className="pktw-space-y-2 pktw-mb-3">
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[#6c757d]" title="Color for highlighted path and path node glow.">
						<span className="pktw-w-24">Path color</span>
						<input
							type="color"
							value={config.pathColor}
							onChange={(e) => onConfigChange({ ...config, pathColor: e.target.value })}
							className="pktw-h-6 pktw-w-10 pktw-cursor-pointer pktw-rounded pktw-border pktw-border-[#e5e7eb]"
						/>
					</label>
				</div>
			</CollapsibleSection>
			<Button
				variant="ghost"
				size="sm"
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
