import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

let graphInstanceId = 0;
import type { GraphPatch } from '@/ui/component/mine/graph-viz/utils/graphPatches';
import type { GraphVisualEffect, EffectKindMap } from '@/ui/component/mine/graph-viz/graphAnimationStore';
import { DEFAULT_CONFIG, type GraphConfig } from './config';
import type { SnapshotMarkdownOptions } from './formatters';
import type {
	GraphVizNode,
	GraphVizNodeInfo,
	GraphVizNodeHoverInfo,
	UIPreviewGraph,
	EdgeStyle,
	GraphVisualizationHandle,
	NodeContextMenuConfig,
	GraphBelowExtraAnalysisAreaConfig,
} from './types';
import { linkKey } from './utils/link-key';
import { previewToPatch } from './utils/preview-to-patch';
import { GraphToolbar } from './components/GraphToolbar';
import { GraphSettingsPanel } from './components/GraphSettingsPanel';
import { GraphToolsPanel } from './components/GraphToolsPanel';
import { GraphEmptyState } from './components/GraphEmptyState';
import { GraphEffectsCanvas } from './components/GraphEffectsCanvas';
import { GraphMainCanvas } from './components/GraphMainCanvas';
import { NodeContextMenu } from './components/NodeContextMenu';
import { useGraphContextMenu } from './hooks/useGraphContextMenu';
import { useGraphCopy } from './hooks/useGraphCopy';
import { useGraphStreaming } from './hooks/useGraphStreaming';
import { useGraphEngine } from './hooks/useGraphEngine';
import { useGraphSettings } from './hooks/useGraphSettings';
import { AppContext } from '@/app/context/AppContext';

export type {
	GraphVisualizationHandle,
	GraphVizNodeInfo,
	GraphVizNodeHoverInfo,
	UIPreviewGraph,
	GraphUINode,
	GraphUIEdge,
	GraphSnapshot,
	EdgeStyle,
	NodeStyle
} from './types';

export interface GraphVisualizationProps {
	snapshotMarkdownOptions: SnapshotMarkdownOptions;
	defaultNodeType: string;
	defaultEdgeKind: string;
	getNodeStyle: (node: GraphVizNode) => { fill?: string; r?: number };
	getEdgeStyle: (edge: { kind: string; weight: number }) => EdgeStyle;
	getNodeLabel: (node: GraphVizNode, mode: 'full' | 'short') => string;
	extractPathFromNode: (node: GraphVizNode) => string | null;
	effectKindMap: EffectKindMap;

	graph?: UIPreviewGraph | null;
	effect?: GraphVisualEffect;
	containerClassName?: string;
	/** Title shown in header (e.g. document name or "AI analysis graph"). */
	title?: string;

	showToolbar?: boolean;
	showSettings?: boolean;
	showCopy?: boolean;
	showZoom?: boolean;
	emptyMessage?: string;
	normalizeNodeId?: (id: string) => string;
	onNodeClick?: (node: GraphVizNodeInfo) => void | Promise<void>;
	onNodeHover?: (info: GraphVizNodeHoverInfo | null) => void;
	onNodeContextMenu?: (pos: { x: number; y: number }, node: GraphVizNodeInfo) => void;
	nodeContextMenu?: NodeContextMenuConfig;
	graphBelowExtraAnalysisArea?: GraphBelowExtraAnalysisAreaConfig;
	/** When false, hide the bottom tools panel (Display/Analysis/Fold/Path). Default true. */
	showToolsPanel?: boolean;
	/** When true, hide the internal title bar (e.g. when parent modal shows title in header). */
	hideTitle?: boolean;
}

export const GraphVisualization = forwardRef<GraphVisualizationHandle, GraphVisualizationProps>((
	{
		graph,
		effect,
		containerClassName,
		showToolbar = true,
		showSettings = true,
		showCopy = true,
		showZoom = true,
		emptyMessage = 'Waiting for graph events…',
		defaultNodeType,
		defaultEdgeKind,
		normalizeNodeId = (id) => id,
		snapshotMarkdownOptions,
		getEdgeStyle,
		getNodeStyle,
		getNodeLabel,
		extractPathFromNode,
		onNodeClick: onNodeClickProp,
		onNodeHover,
		onNodeContextMenu,
		nodeContextMenu,
		graphBelowExtraAnalysisArea,
		showToolsPanel = true,
		title,
		hideTitle = false,
		effectKindMap: effectKindMap,
	},
	ref
) => {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const instanceIdRef = useRef(++graphInstanceId);
	const [config, setConfig] = React.useState<GraphConfig>(() => {
		const s = AppContext.getInstance().settings?.graphViz;
		if (!s) return { ...DEFAULT_CONFIG };
		return {
			...DEFAULT_CONFIG,
			...(s.clusterForceStrength != null && { clusterForceStrength: s.clusterForceStrength }),
			...(s.nodeBaseRadiusPhysical != null && { nodeBaseRadiusPhysical: s.nodeBaseRadiusPhysical }),
			...(s.nodeBaseRadiusSemantic != null && { nodeBaseRadiusSemantic: s.nodeBaseRadiusSemantic }),
			...(s.nodeDegreeBoost != null && { nodeDegreeBoost: s.nodeDegreeBoost }),
			...(s.mstPruneDepth != null && { mstPruneDepth: s.mstPruneDepth }),
			...(s.skeletonBackboneOnly != null && { skeletonBackboneOnly: s.skeletonBackboneOnly }),
			...(s.skeletonMinBranchNodes != null && { skeletonMinBranchNodes: s.skeletonMinBranchNodes }),
			...(s.mstLeafOpacity != null && { mstLeafOpacity: s.mstLeafOpacity }),
			...(s.mstLeafWidthScale != null && { mstLeafWidthScale: s.mstLeafWidthScale }),
		};
	});
	const [foldedSet, setFoldedSet] = React.useState<Set<string>>(new Set());
	const [relayoutTrigger, setRelayoutTrigger] = React.useState(0);

	const { contextMenu, setContextMenu, menuLeaveTimerRef, closeMenu } = useGraphContextMenu(
		!!nodeContextMenu,
		containerRef
	);

	const engine = useGraphEngine({
		config,
		foldedSet,
		setFoldedSet,
		setContextMenu,
		normalizeNodeId,
		getEdgeStyle,
		getNodeLabel,
		extractPathFromNode,
		defaultNodeType,
		defaultEdgeKind,
		getNodeStyle,
		onNodeClick: onNodeClickProp,
		onNodeHover,
		onNodeContextMenu,
		nodeContextMenu: nodeContextMenu ?? null,
	});

	useGraphStreaming({
		graph,
		defaultNodeType,
		defaultEdgeKind,
		previewToPatch: useMemo(
			() => (g: UIPreviewGraph) => previewToPatch(g, { defaultNodeType, defaultEdgeKind }),
			[defaultNodeType, defaultEdgeKind]
		),
		applyPatchRef: engine.applyPatchRef,
		clearRef: engine.clearRef,
		relayoutTrigger,
	});

	const {
		copyFormat,
		setCopyFormat,
		copyMenuOpen,
		setCopyMenuOpen,
		copiedTick,
		handleCopy,
	} = useGraphCopy({
		nodesRef: engine.effectsCanvasRefs.nodesRef,
		linksRef: engine.effectsCanvasRefs.linksRef,
		snapshotMarkdownOptions,
	});

	const settings = useGraphSettings();

	// Re-run render when hub/config changes so hubs and effects refresh immediately
	useEffect(() => {
		engine.scheduleRenderJoin('useEffect');
	}, [
		config.showTags,
		config.showSemanticEdges,
		config.skeletonMode,
		config.hubTopN,
		config.highlightHubs,
		config.hubColor,
		config.nodeBaseRadiusPhysical,
		config.nodeBaseRadiusSemantic,
		config.nodeDegreeBoost,
		config.mstPruneDepth,
		config.skeletonMinBranchNodes,
		config.mstLeafOpacity,
		config.mstLeafWidthScale,
		foldedSet.size,
	]);

	/**
	 * expose refs to the parent component
	 */
	const fitToViewRef = React.useRef(engine.fitToView);
	fitToViewRef.current = engine.fitToView;
	useImperativeHandle(ref, () => ({
		applyPatch: (patch: GraphPatch) => engine.applyPatchRef.current(patch),
		clear: () => engine.clearRef.current(),
		fitToView: (force?: boolean) => fitToViewRef.current?.(force),
	}), []);

	const baseContainerClass = containerClassName
		? 'pktw-w-full pktw-bg-[#fafafa] pktw-rounded-md pktw-border pktw-border-pk-border pktw-relative pktw-overflow-hidden pktw-flex pktw-flex-col'
		: 'pktw-w-full pktw-aspect-square pktw-bg-[#fafafa] pktw-rounded-md pktw-border pktw-border-pk-border pktw-relative pktw-overflow-hidden pktw-flex pktw-flex-col';

	return (
		<>
			<div ref={containerRef} className={`${baseContainerClass}${containerClassName ? ` ${containerClassName}` : ''}`}>
				{title && !hideTitle ? (
					<div className="pktw-flex-shrink-0 pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted pktw-border-b pktw-border-pk-border pktw-truncate" title={title}>
						{title}
					</div>
				) : null}
				<div ref={engine.graphAreaRef as React.RefObject<HTMLDivElement>} className="pktw-flex-1 pktw-min-h-0 pktw-relative pktw-flex pktw-flex-col">
					{showToolbar && (
						<GraphToolbar
							onZoomIn={() => engine.handleZoom(1.2)}
							onZoomOut={() => engine.handleZoom(1 / 1.2)}
							onFitToView={() => engine.fitToView(true)}
							onRelayout={
								graph
									? () => {
										engine.clearRef.current();
										setRelayoutTrigger((t) => t + 1);
									}
									: undefined
							}
							onToggleSettings={() => settings.setShowControls((s) => !s)}
							onCopy={handleCopy}
							copyFormat={copyFormat}
							setCopyFormat={setCopyFormat}
							copyMenuOpen={copyMenuOpen}
							setCopyMenuOpen={setCopyMenuOpen}
							copiedTick={copiedTick}
							showCopy={showCopy}
							showZoom={showZoom}
							showSettings={showSettings}
							showTools={false}
							settingsButtonRef={settings.settingsButtonRef}
							config={config}
							onConfigChange={setConfig}
							pathMode={config.pathMode}
							pathSelectMode={config.pathMode ? engine.pathSelectMode : false}
							onTogglePathSelectMode={config.pathMode ? () => (engine.pathSelectMode ? engine.exitPathSelectMode() : engine.enterPathSelectMode()) : undefined}
							onClearPath={engine.clearPath}
							hasPathSelection={engine.hasPathSelection}
						/>
					)}

					<GraphSettingsPanel
						config={config}
						onConfigChange={setConfig}
						onReset={() => setTimeout(() => engine.fitToView(true), 100)}
						position={settings.settingsPanelPosition}
						show={settings.showControls}
						hasConceptNodes={engine.hasConceptNodes}
					/>

					<div className="pktw-absolute pktw-bottom-2 pktw-right-2 pktw-z-10 pktw-bg-white/80 pktw-backdrop-blur-sm pktw-px-2 pktw-py-1 pktw-rounded pktw-text-xs pktw-text-[#6c757d] pktw-border pktw-border-pk-border">
						{Math.round(engine.zoomLevel * 100)}%
					</div>

					{engine.pathError ? (
						<div
							className="pktw-absolute pktw-top-2 pktw-left-1/2 pktw-z-20 pktw--translate-x-1/2 pktw-px-3 pktw-py-2 pktw-rounded-lg pktw-shadow-md pktw-bg-white/95 pktw-border pktw-border-red-200 pktw-text-red-700 pktw-text-sm"
							role="alert"
						>
							{engine.pathError}
						</div>
					) : null}

					{engine.interactionContext && (
						<GraphMainCanvas
							canvasRef={engine.mainCanvasRef}
							effectsCanvasRefs={engine.effectsCanvasRefs}
							simulationRef={engine.simulationRef}
							config={config}
							getEdgeStyle={getEdgeStyle}
							getNodeLabel={getNodeLabel}
							extractPathFromNode={extractPathFromNode}
							normalizeNodeId={normalizeNodeId}
							hoveredNodeId={engine.hoveredNodeId}
							setHoveredNodeId={engine.setHoveredNodeId}
							onNodeHover={onNodeHover}
							interactionContext={engine.interactionContext}
							scheduleDrawRef={engine.scheduleDrawRef}
							pathStartNodeId={engine.pathStartNodeId}
							pathResultVersion={engine.pathResult?.pathNodeIds.length ?? 0}
						/>
					)}

					<GraphEffectsCanvas
						effect={effect}
						canvasRefs={engine.effectsCanvasRefs}
						effectKindMap={effectKindMap}
						highlightHubs={config.highlightHubs}
						hubColor={config.hubColor}
						communityMode={config.communityMode}
						maxCommunityHulls={8}
						pathMode={config.pathMode}
						pathColor={config.pathColor}
						pathResultVersion={engine.pathResult?.pathNodeIds.length ?? 0}
						getLinkKey={(l) => linkKey(l, normalizeNodeId)}
						mindflowAnimations={config.mindflowAnimations}
					/>

					{!engine.hasData && <GraphEmptyState message={emptyMessage} />}
				</div>

				{showToolsPanel ? (
					<div className="pktw-flex-shrink-0 pktw-border-t pktw-border-pk-border pktw-bg-[#fafafa] pktw-px-2 pktw-py-2 pktw-flex pktw-flex-col pktw-gap-2">
						<GraphToolsPanel
							config={config}
							onConfigChange={setConfig}
							position={null}
							show={true}
							embedBelowGraph
							onClearPath={engine.clearPath}
							hasPathSelection={engine.hasPathSelection}
							pathSelectMode={config.pathMode ? engine.pathSelectMode : false}
							onTogglePathSelectMode={config.pathMode ? () => (engine.pathSelectMode ? engine.exitPathSelectMode() : engine.enterPathSelectMode()) : undefined}
							findPath={graphBelowExtraAnalysisArea?.findPath ?? null}
							hops={graphBelowExtraAnalysisArea?.hops ?? null}
						/>
					</div>
				) : null}
			</div>
			{nodeContextMenu && contextMenu.open && contextMenu.node ? (
				<NodeContextMenu
					node={contextMenu.node}
					clientX={contextMenu.clientX}
					clientY={contextMenu.clientY}
					config={{
						...nodeContextMenu,
						onFoldNode: undefined,
					}}
					onClose={closeMenu}
					menuLeaveTimerRef={menuLeaveTimerRef}
				/>
			) : null}
		</>
	);
});