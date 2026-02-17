/**
 * Encapsulates renderJoin (D3 data-join + simulation update), scheduleRenderJoin (RAF(requestAnimationFrame) coalescing),
 * and markStreaming (streaming throttle). Used by GraphVisualization to drive graph DOM updates.
 */

import React, { useCallback, useRef } from 'react';
import * as d3 from 'd3-force';
import * as d3Selection from 'd3-selection';
import type { GraphConfig } from '../config';
import type {
	GraphVizNode,
	GraphVizLink,
	GraphVizNodeInfo,
	GraphVizNodeHoverInfo,
	NodeContextMenuConfig,
} from '../types';
import type { EdgeStyle } from '../types';
import { linkKey } from '../utils/link-key';
import { getVisibleGraph } from '../utils/visibleGraph';
import { computeMstEdgeKeys, computeMstTerminalEdgeKeys, computeMstBackboneEdgeKeys, computeMstBranchRootMap, normalizeEdgeWeight } from '../utils/mst';
import { computeTopology, assignInitialPositionsByGroup } from '../utils/topologyLayout';
import { STAGGER_NODE_MS, STAGGER_LINK_MS, STREAMING_JOIN_MS, LUCIDE_VIEWBOX } from '../core/constants';
import { getNodeShapePath } from '../core/nodeShape';
import { computeDegreeMap, assignRadiusByConfig, computeHubNodeIds } from '../core/degreeRadius';
import { resolveLinkEndpoints } from '../core/linkResolver';
import { appendNodeShapeContent } from '../drivers/nodeShapeRenderer';
import { createDragBehavior } from '../drivers/dragBehavior';
import type { LayerRefs, SimulationZoomRefs, GraphDataRefs, StreamingRefs, EffectsRefs, ContextRefs } from './useGraphEngine';

export type UseGraphRenderJoinParams = {
	config: GraphConfig;
	layerRefs: LayerRefs;
	simulationZoomRefs: SimulationZoomRefs;
	graphDataRefs: GraphDataRefs;
	streamingRefs: StreamingRefs;
	effectsRefs: EffectsRefs;
	contextRefs: ContextRefs;
	containerSizeRef: React.MutableRefObject<{ width: number; height: number }>;
	normalizeNodeId: (id: string) => string;
	getEdgeStyle: (edge: { kind: string; weight: number }) => EdgeStyle;
	getNodeLabel: (node: GraphVizNode, mode: 'full' | 'short') => string;
	extractPathFromNode: (node: GraphVizNode) => string | null;
	foldedSet: Set<string>;
	setHoveredNodeId: (id: string | null) => void;
	setContextMenu: React.Dispatch<
		React.SetStateAction<{ open: boolean; clientX: number; clientY: number; node: GraphVizNodeInfo | null }>
	>;
	setPathResult: (result: { pathNodeIds: string[]; pathLinkKeys: Set<string> } | null) => void;
	setFoldedSet: React.Dispatch<React.SetStateAction<Set<string>>>;
	setVersion: React.Dispatch<React.SetStateAction<number>>;
	onNodeHover?: (info: GraphVizNodeHoverInfo | null) => void;
	onNodeContextMenu?: (pos: { x: number; y: number }, node: GraphVizNodeInfo) => void;
	nodeContextMenu?: NodeContextMenuConfig | null;
	onNodeClick?: (node: GraphVizNodeInfo) => void | Promise<void>;
	renderBackend?: 'canvas' | 'svg';
	scheduleDrawRef?: React.MutableRefObject<(() => void) | null>;
};

export type ScheduleRenderJoinOpts = {
	/** When true, only render nodes/links (no MST, hub, community, labels). Used during streaming. */
	basicOnly?: boolean;
	/** When true, bypass throttle. Used for last streaming batch to run full render immediately. */
	bypassThrottle?: boolean;
};

export function useGraphRenderJoin(params: UseGraphRenderJoinParams): {
	/** Full render: basic + MST/hub/community/labels. */
	renderJoin: () => void;
	/** basicOnly: nodes/links only. Otherwise: full. */
	scheduleRenderJoin: (source?: string, opts?: ScheduleRenderJoinOpts) => void;
	markStreaming: () => void;
} {
	const {
		config,
		layerRefs,
		simulationZoomRefs,
		graphDataRefs,
		streamingRefs,
		effectsRefs,
		contextRefs,
		containerSizeRef,
		normalizeNodeId,
		getEdgeStyle,
		getNodeLabel,
		extractPathFromNode,
		foldedSet,
		setHoveredNodeId,
		setContextMenu,
		setPathResult,
		setFoldedSet,
		setVersion,
		onNodeHover,
		onNodeContextMenu,
		nodeContextMenu,
		onNodeClick,
		renderBackend = 'svg',
		scheduleDrawRef,
	} = params;

	const useCanvas = renderBackend === 'canvas';

	const { linksLayerRef, nodesLayerRef, labelsLayerRef, linkSelRef, nodeSelRef, labelSelRef } = layerRefs;
	const { simulationRef, settleTimerRef } = simulationZoomRefs;
	const { nodesRef, linksRef } = graphDataRefs;
	const { streamingRef, renderJoinRafRef, lastRenderJoinTsRef, streamingThrottleTimerRef, streamingOffTimerRef, pendingVersionBumpRef, throttleTickRef } = streamingRefs;
	const scheduleRenderJoinCallCountRef = useRef(0);
	const { hubNodeIdsRef, communityMapRef, visibleNodesRef, visibleLinksRef } = effectsRefs;
	const { configRef, foldedSetRef, pathStartIdRef } = contextRefs;

	const scheduleRenderJoinRef = useRef<(source?: string, opts?: ScheduleRenderJoinOpts) => void>(() => { });

	const phase = (_t0: number, _label: string, _visibleNodes: GraphVizNode[]) => {};

	const renderJoin = useCallback((basicOnly = false) => {
		const t0 = performance.now();
		configRef.current = config;
		const simulation = simulationRef.current;
		if (!simulation) return;
		if (!useCanvas) {
			const linksLayer = linksLayerRef.current;
			const nodesLayer = nodesLayerRef.current;
			const labelsLayer = labelsLayerRef.current;
			if (!linksLayer || !nodesLayer || !labelsLayer) return;
		}
		const isStreaming = basicOnly || streamingRef.current;

		const nodes = nodesRef.current;
		const resolvedLinks = resolveLinkEndpoints(nodes, linksRef.current);
		linksRef.current = resolvedLinks;

		const { visibleNodeIds, visibleLinkKeys } = getVisibleGraph(
			nodes,
			linksRef.current,
			{ showTags: config.showTags, showSemanticEdges: config.showSemanticEdges },
			foldedSet,
			normalizeNodeId
		);
		const visibleNodes = nodes.filter((n) => visibleNodeIds.has(n.id));
		let resolvedVisibleLinks = resolvedLinks.filter((l) => visibleLinkKeys.has(linkKey(l, normalizeNodeId)));
		phase(t0, 'getVisibleGraph', visibleNodes);

		// Phase 1: MST filter, positions, degree/hub/community
		resolvedVisibleLinks = phaseMstAndEffects(t0, visibleNodes, resolvedVisibleLinks, basicOnly, config, normalizeNodeId, hubNodeIdsRef, communityMapRef, containerSizeRef);

		// Skeleton mode: draw order = backbone (MST) first, then terminal (MST), then non-MST (dimmed)
		if (config.skeletonMode && resolvedVisibleLinks.length > 0) {
			const mstLinksOnly = resolvedVisibleLinks.filter((l) => (l as GraphVizLink).isMSTEdge);
			const mstKeysForSort = new Set(mstLinksOnly.map((l) => linkKey(l, normalizeNodeId)));
			const minBranch = Math.max(1, config.skeletonMinBranchNodes ?? 3);
			const termForSort = mstLinksOnly.length > 0
				? computeMstTerminalEdgeKeys(mstLinksOnly, (l) => linkKey(l, normalizeNodeId), mstKeysForSort, minBranch)
				: new Set<string>();
			resolvedVisibleLinks.sort((a, b) => {
				const aMst = (a as GraphVizLink).isMSTEdge;
				const bMst = (b as GraphVizLink).isMSTEdge;
				if (!aMst && !bMst) return 0;
				if (!aMst) return 1;
				if (!bMst) return -1;
				const ka = linkKey(a, normalizeNodeId);
				const kb = linkKey(b, normalizeNodeId);
				const aBack = !termForSort.has(ka);
				const bBack = !termForSort.has(kb);
				if (aBack !== bBack) return aBack ? -1 : 1;
				return 0;
			});
		}

		visibleLinksRef.current = resolvedVisibleLinks;
		visibleNodesRef.current = visibleNodes;
		throttleTickRef.current = visibleNodes.length > 80;

		// Phase 2: D3 simulation update
		phaseSimulation(visibleNodes, resolvedVisibleLinks, isStreaming, simulation, settleTimerRef);

		// Phase 3: Style helpers (used by links/nodes)
		const { getLinkStroke, getNodeFillByConfig, getResolvedEdgeStyle } = createStyleHelpers(
			resolvedVisibleLinks,
			config,
			getEdgeStyle,
			normalizeNodeId
		);

		// Phase 4-6: DOM data-join (SVG only); canvas uses scheduleDraw
		if (!useCanvas) {
			const linksLayer = linksLayerRef.current!;
			const nodesLayer = nodesLayerRef.current!;
			const labelsLayer = labelsLayerRef.current!;
			phaseLinksDataJoin(t0, visibleNodes, linksLayer, resolvedVisibleLinks, isStreaming, getLinkStroke, getResolvedEdgeStyle, normalizeNodeId, linkSelRef);
			phaseNodesDataJoin({
			t0,
			nodesLayer,
			visibleNodes,
			isStreaming,
			getNodeFillByConfig,
			getNodeLabel,
			extractPathFromNode,
			configRef,
			foldedSetRef,
			pathStartIdRef,
			nodesRef,
			linksRef,
			normalizeNodeId,
			setHoveredNodeId,
			setContextMenu,
			setPathResult,
			setFoldedSet,
			onNodeHover,
			onNodeContextMenu,
			nodeContextMenu,
			onNodeClick,
			simulation,
			simulationZoomRefs,
			scheduleRenderJoin: scheduleRenderJoinRef.current,
			nodeSelRef,
			});

			// Phase 6: Labels data-join
			phaseLabelsDataJoin(t0, labelsLayer, visibleNodes, isStreaming, getNodeLabel, labelSelRef);
		} else {
			scheduleDrawRef?.current?.();
		}

	}, [
		config,
		configRef,
		foldedSet,
		normalizeNodeId,
		getEdgeStyle,
		getNodeLabel,
		extractPathFromNode,
		setHoveredNodeId,
		setContextMenu,
		setPathResult,
		setFoldedSet,
		onNodeHover,
		onNodeContextMenu,
		nodeContextMenu,
		onNodeClick,
		linksLayerRef,
		nodesLayerRef,
		labelsLayerRef,
		simulationRef,
		streamingRef,
		nodesRef,
		linksRef,
		containerSizeRef,
		linkSelRef,
		nodeSelRef,
		labelSelRef,
		settleTimerRef,
		hubNodeIdsRef,
		communityMapRef,
		visibleNodesRef,
		throttleTickRef,
		pathStartIdRef,
		foldedSetRef,
		renderBackend,
		useCanvas,
		scheduleDrawRef,
	]);

	function phaseMstAndEffects<T extends GraphVizLink>(
		t0: number,
		visibleNodes: GraphVizNode[],
		resolvedVisibleLinks: T[],
		basicOnly: boolean,
		cfg: GraphConfig,
		normId: (id: string) => string,
		hubRef: React.MutableRefObject<string[]>,
		communityRef: React.MutableRefObject<Map<string, number>>,
		containerRef: React.MutableRefObject<{ width: number; height: number }>,
	): T[] {
		const width = containerRef.current.width ?? 400;
		const height = containerRef.current.height ?? 400;
		const padding = 80;

		// 1) Topology first (no coordinates): community, degree, hubs, MST edge set
		let topology: { communityMap: Map<string, number>; degreeMap: Map<string, number>; hubNodeIds: string[]; mstEdgeKeys: Set<string> } | null = null;
		if (!basicOnly && visibleNodes.length > 0) {
			phase(t0, 'topology', visibleNodes);
			topology = computeTopology(visibleNodes, resolvedVisibleLinks, normId, {
				hubTopN: Math.max(1, Math.min(visibleNodes.length, cfg.hubTopN)),
			});
			for (const l of resolvedVisibleLinks) {
				(l as GraphVizLink).isMSTEdge = topology.mstEdgeKeys.has(linkKey(l, normId));
			}
			phase(t0, 'topology done', visibleNodes);
		}

		// Skeleton mode: keep all nodes and links; only styling distinguishes MST (no filtering)

		// 3) Initial positions by group; in skeleton mode use branch-root map so MST branches sit in separate sectors
		if (topology) {
			let branchRootMap: Map<string, string> | undefined;
			if (cfg.skeletonMode && resolvedVisibleLinks.length > 0) {
				const mstLinks = resolvedVisibleLinks.filter((l) => topology.mstEdgeKeys.has(linkKey(l, normId)));
				if (mstLinks.length > 0) {
					const mstKeysForLayout = new Set(mstLinks.map((l) => linkKey(l, normId)));
					const backboneKeys = computeMstBackboneEdgeKeys(mstKeysForLayout, mstLinks, (l) => linkKey(l, normId));
					branchRootMap = computeMstBranchRootMap(mstLinks, (l) => linkKey(l, normId), backboneKeys);
				}
			}
			assignInitialPositionsByGroup(visibleNodes, topology.communityMap, width, height, padding, branchRootMap);
		} else {
			const spanX = Math.max(100, width - padding * 2);
			const spanY = Math.max(100, height - padding * 2);
			for (const node of visibleNodes) {
				if (node.x == null || node.y == null) {
					node.x = padding + Math.random() * spanX;
					node.y = padding + Math.random() * spanY;
				}
			}
		}

		if (!basicOnly) {
			phase(t0, 'degree/hub', visibleNodes);
			const degreeMap = computeDegreeMap(visibleNodes, resolvedVisibleLinks);
			const nodeIdsWithSemanticLink = new Set<string>();
			for (const link of resolvedVisibleLinks) {
				if (link.kind === 'semantic') {
					nodeIdsWithSemanticLink.add((link.source as GraphVizNode).id);
					nodeIdsWithSemanticLink.add((link.target as GraphVizNode).id);
				}
			}
			assignRadiusByConfig(visibleNodes, degreeMap, nodeIdsWithSemanticLink, {
				nodeBaseRadiusPhysical: cfg.nodeBaseRadiusPhysical ?? 6,
				nodeBaseRadiusSemantic: cfg.nodeBaseRadiusSemantic ?? 7,
				nodeDegreeBoost: cfg.nodeDegreeBoost ?? 16,
			});
			hubRef.current = computeHubNodeIds(visibleNodes, degreeMap, Math.max(1, Math.min(visibleNodes.length, cfg.hubTopN)));
			communityRef.current =
				topology != null && (cfg.communityMode || cfg.clusterLayout) ? topology.communityMap : new Map();
			phase(t0, 'degree/hub done', visibleNodes);
		} else {
			hubRef.current = [];
			communityRef.current = new Map();
		}
		phase(t0, 'mstAndEffects done', visibleNodes);
		return resolvedVisibleLinks;
	}

	function phaseSimulation(
		visibleNodes: GraphVizNode[],
		resolvedVisibleLinks: GraphVizLink[],
		isStreaming: boolean,
		sim: d3.Simulation<GraphVizNode, GraphVizLink>,
		settleRef: React.MutableRefObject<number | null>,
	) {
		sim.nodes(visibleNodes);
		// Pass a copy so D3 mutates it in place; linksRef keeps original source/target for pathfinding
		const linksForSim = resolvedVisibleLinks.map((l) => ({ ...l, source: l.source, target: l.target }));
		(sim.force('link') as d3.ForceLink<GraphVizNode, GraphVizLink>).links(linksForSim);
		if (isStreaming) {
			if (visibleNodes.length > 0 && sim.alpha() < 0.008) sim.alpha(0.015).restart();
		} else {
			sim.alpha(Math.max(sim.alpha(), 0.06)).alphaTarget(0).restart();
			if (settleRef.current) window.clearTimeout(settleRef.current);
			settleRef.current = window.setTimeout(() => sim.alphaTarget(0), 400);
		}
	}

	function createStyleHelpers(
		resolvedVisibleLinks: GraphVizLink[],
		cfg: GraphConfig,
		getEdgeStyleFn: (e: { kind: string; weight: number }) => EdgeStyle,
		normId: (id: string) => string,
	) {
		const nodeIdsWithSemanticLink = new Set<string>();
		for (const link of resolvedVisibleLinks) {
			if (link.kind === 'semantic') {
				nodeIdsWithSemanticLink.add((link.source as GraphVizNode).id);
				nodeIdsWithSemanticLink.add((link.target as GraphVizNode).id);
			}
		}
		const isPhysicalLikeLink = (k: string) => k !== 'semantic';
		const semanticDasharray = cfg.semanticEdgeStyle === 'dashed' ? '4 3' : cfg.semanticEdgeStyle === 'dotted' ? '2 2' : null;
		const physicalDasharray = cfg.physicalEdgeStyle === 'dashed' ? '4 3' : cfg.physicalEdgeStyle === 'dotted' ? '2 2' : null;
		const mstDasharray = cfg.mstEdgeStyle === 'dashed' ? '4 3' : cfg.mstEdgeStyle === 'dotted' ? '2 2' : null;
		const skeletonMode = cfg.skeletonMode ?? false;
		const mstLinksOnly = resolvedVisibleLinks.filter((l) => (l as GraphVizLink).isMSTEdge);
		const mstLinkKeys = new Set(mstLinksOnly.map((l) => linkKey(l, normId)));
		const minBranchNodes = Math.max(1, cfg.skeletonMinBranchNodes ?? 3);
		const terminalEdgeKeys = skeletonMode && mstLinksOnly.length > 0 ? computeMstTerminalEdgeKeys(mstLinksOnly, (l) => linkKey(l, normId), mstLinkKeys, minBranchNodes) : new Set<string>();
		const isLeafEdge = (d: GraphVizLink) => skeletonMode && (d as GraphVizLink).isMSTEdge && terminalEdgeKeys.has(linkKey(d, normId));
		const isBackboneEdge = (d: GraphVizLink) => skeletonMode && (d as GraphVizLink).isMSTEdge && !terminalEdgeKeys.has(linkKey(d, normId));
		const getLinkStroke = (d: GraphVizLink) =>
			isBackboneEdge(d)
				? (cfg.mstColor ?? '#374151')
				: d.kind === 'semantic'
					? cfg.semanticLinkStroke
					: isPhysicalLikeLink(d.kind)
						? cfg.physicalLinkStroke
						: (getEdgeStyleFn({ kind: d.kind, weight: d.weight }).stroke ?? '#d1d5db');
		const getNodeFillByConfig = (d: GraphVizNode) => {
			if ((d.type ?? '').toLowerCase() === 'tag') return cfg.tagNodeFill;
			return nodeIdsWithSemanticLink.has(d.id) ? cfg.semanticNodeFill : cfg.physicalNodeFill;
		};
		const getResolvedEdgeStyle = (d: GraphVizLink) => {
			const base = getEdgeStyleFn({ kind: d.kind, weight: d.weight });
			// Non-MST edges in skeleton mode: dimmed so MST stands out
			if (skeletonMode && !(d as GraphVizLink).isMSTEdge) {
				const stroke = d.kind === 'semantic' ? cfg.semanticLinkStroke : isPhysicalLikeLink(d.kind) ? cfg.physicalLinkStroke : (base.stroke ?? '#d1d5db');
				return { ...base, stroke, strokeOpacity: 0.2, strokeDasharray: d.kind === 'semantic' ? (cfg.semanticEdgeStyle === 'dashed' ? '4 3' : cfg.semanticEdgeStyle === 'dotted' ? '2 2' : null) : (cfg.physicalEdgeStyle === 'dashed' ? '4 3' : cfg.physicalEdgeStyle === 'dotted' ? '2 2' : null), strokeWidth: (base.strokeWidth ?? 1) * (d.kind === 'semantic' ? cfg.semanticEdgeWidthScale : cfg.physicalEdgeWidthScale) };
			}
			if (isBackboneEdge(d)) {
				return { ...base, stroke: cfg.mstColor ?? '#374151', strokeOpacity: cfg.mstEdgeOpacity ?? 0.7, strokeDasharray: mstDasharray ?? base.strokeDasharray ?? null, strokeWidth: (base.strokeWidth ?? 1) * (cfg.mstWidthScale ?? 2.5) };
			}
			// Terminal (branch) edges in skeleton mode keep original semantic/physical style
			if (skeletonMode && isLeafEdge(d)) {
				if (d.kind === 'semantic') {
					return { ...base, stroke: cfg.semanticLinkStroke, strokeOpacity: cfg.semanticEdgeOpacity, strokeDasharray: cfg.semanticEdgeStyle === 'dashed' ? '4 3' : cfg.semanticEdgeStyle === 'dotted' ? '2 2' : null, strokeWidth: (base.strokeWidth ?? 1) * cfg.semanticEdgeWidthScale };
				}
				return { ...base, stroke: cfg.physicalLinkStroke, strokeOpacity: cfg.physicalEdgeOpacity, strokeDasharray: physicalDasharray ?? null, strokeWidth: (base.strokeWidth ?? 1) * cfg.physicalEdgeWidthScale };
			}
			if (d.kind === 'semantic') {
				return { ...base, strokeOpacity: cfg.semanticEdgeOpacity, strokeDasharray: semanticDasharray ?? base.strokeDasharray ?? null, strokeWidth: (base.strokeWidth ?? 1) * cfg.semanticEdgeWidthScale };
			}
			if (isPhysicalLikeLink(d.kind)) {
				return { ...base, strokeOpacity: cfg.physicalEdgeOpacity, strokeDasharray: physicalDasharray ?? base.strokeDasharray ?? null, strokeWidth: (base.strokeWidth ?? 1) * cfg.physicalEdgeWidthScale };
			}
			return base;
		};
		return { getLinkStroke, getNodeFillByConfig, getResolvedEdgeStyle };
	}

	function phaseLinksDataJoin(
		t0: number,
		visibleNodes: GraphVizNode[],
		linksLayer: d3Selection.Selection<SVGGElement, unknown, null, undefined>,
		resolvedVisibleLinks: GraphVizLink[],
		isStreaming: boolean,
		getLinkStrokeFn: (d: GraphVizLink) => string,
		getResolvedEdgeStyleFn: (d: GraphVizLink) => EdgeStyle & { strokeOpacity?: number; strokeDasharray?: string | null; strokeWidth?: number },
		normId: (id: string) => string,
		linkSelRef: React.MutableRefObject<d3Selection.Selection<SVGLineElement, GraphVizLink, SVGGElement, unknown> | null>,
	) {
		phase(t0, 'links data-join', visibleNodes);
		const linkSel = linksLayer
			.selectAll<SVGLineElement, GraphVizLink>('line')
			.data(resolvedVisibleLinks, (d) => linkKey(d, normId));

		const linkEnter = linkSel
			.enter()
			.append('line')
			.attr('stroke', getLinkStrokeFn)
			.attr('stroke-opacity', (d) => getResolvedEdgeStyleFn(d).strokeOpacity ?? 0.4)
			.attr('stroke-dasharray', (d) => getResolvedEdgeStyleFn(d).strokeDasharray ?? null)
			.attr('stroke-width', (d) => getResolvedEdgeStyleFn(d).strokeWidth ?? 1)
			.attr('opacity', isStreaming ? 1 : 0)
			.attr('stroke-dashoffset', (d) => getResolvedEdgeStyleFn(d).strokeDashoffset ?? null);

		if (!isStreaming) {
			linkEnter
				.transition()
				.delay((_d, i) => i * STAGGER_LINK_MS)
				.duration(220)
				.attr('opacity', 1)
				.attr('stroke-dashoffset', (d) => {
					const s = getResolvedEdgeStyleFn(d);
					return s.strokeDashoffset != null ? 0 : null;
				});
			linkSel.exit().transition().duration(150).attr('opacity', 0).remove();
		} else {
			linkSel.exit().remove();
		}
		const linkMerged = linkEnter.merge(linkSel);
		linkMerged.attr('stroke', getLinkStrokeFn);
		linkSelRef.current = linkMerged;
		phase(t0, 'links data-join done', visibleNodes);
	}

	function phaseNodesDataJoin(ctx: {
		t0: number;
		nodesLayer: d3Selection.Selection<SVGGElement, unknown, null, undefined>;
		visibleNodes: GraphVizNode[];
		isStreaming: boolean;
		getNodeFillByConfig: (d: GraphVizNode) => string;
		getNodeLabel: (node: GraphVizNode, mode: 'full' | 'short') => string;
		extractPathFromNode: (node: GraphVizNode) => string | null;
		configRef: React.MutableRefObject<GraphConfig>;
		foldedSetRef: React.MutableRefObject<Set<string>>;
		pathStartIdRef: React.MutableRefObject<string | null>;
		nodesRef: React.MutableRefObject<GraphVizNode[]>;
		linksRef: React.MutableRefObject<GraphVizLink[]>;
		normalizeNodeId: (id: string) => string;
		setHoveredNodeId: (id: string | null) => void;
		setContextMenu: React.Dispatch<React.SetStateAction<{ open: boolean; clientX: number; clientY: number; node: GraphVizNodeInfo | null }>>;
		setPathResult: (r: { pathNodeIds: string[]; pathLinkKeys: Set<string> } | null) => void;
		setFoldedSet: React.Dispatch<React.SetStateAction<Set<string>>>;
		onNodeHover?: (info: GraphVizNodeHoverInfo | null) => void;
		onNodeContextMenu?: (pos: { x: number; y: number }, node: GraphVizNodeInfo) => void;
		nodeContextMenu: NodeContextMenuConfig | null | undefined;
		onNodeClick?: (node: GraphVizNodeInfo) => void | Promise<void>;
		simulation: d3.Simulation<GraphVizNode, GraphVizLink>;
		simulationZoomRefs: SimulationZoomRefs;
		scheduleRenderJoin: (s?: string) => void;
		nodeSelRef: React.MutableRefObject<d3Selection.Selection<SVGGElement, GraphVizNode, SVGGElement, unknown> | null>;
	}) {
		const { t0, nodesLayer, visibleNodes, isStreaming, getNodeFillByConfig, getNodeLabel, extractPathFromNode, configRef, foldedSetRef, pathStartIdRef, nodesRef, linksRef, normalizeNodeId, setHoveredNodeId, setContextMenu, setPathResult, setFoldedSet, onNodeHover, onNodeContextMenu, nodeContextMenu, onNodeClick, simulation, simulationZoomRefs, scheduleRenderJoin, nodeSelRef } = ctx;

		phase(t0, 'nodes data-join', visibleNodes);

		const nodeSel = nodesLayer
			.selectAll<SVGGElement, GraphVizNode>('g.node')
			.data(visibleNodes, (d) => `node-${String(d.id)}`);

		const nodeInfo = (d: GraphVizNode): GraphVizNodeInfo => ({
			id: d.id,
			label: d.label,
			type: d.type,
			path: extractPathFromNode(d),
		});

		const nodeEnter = nodeSel
			.enter()
			.append('g')
			.attr('class', 'node')
			.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
			.attr('opacity', isStreaming ? 1 : 0)
			.style('cursor', 'grab')
			.on('mouseenter', (evt: MouseEvent, d: GraphVizNode) => {
				setHoveredNodeId(d.id);
				onNodeHover?.({ x: evt.clientX, y: evt.clientY, node: nodeInfo(d) });
			})
			.on('mousemove', (evt: MouseEvent, d: GraphVizNode) => {
				onNodeHover?.({ x: evt.clientX, y: evt.clientY, node: nodeInfo(d) });
			})
			.on('mouseleave', () => {
				setHoveredNodeId(null);
				onNodeHover?.(null);
			})
			.on('contextmenu', (evt: MouseEvent, d: GraphVizNode) => {
				const info = nodeInfo(d);
				if (nodeContextMenu) {
					evt.preventDefault?.();
					const gap = 4;
					const menuW = 210;
					const menuH = 320;
					const left = Math.max(8, Math.min(evt.clientX, window.innerWidth - menuW - 8));
					const top = Math.max(8, Math.min(evt.clientY + gap, window.innerHeight - menuH - 8));
					setContextMenu({ open: true, clientX: left, clientY: top, node: info });
				} else {
					onNodeContextMenu?.({ x: evt.clientX, y: evt.clientY }, info);
					evt.preventDefault?.();
				}
			})
			.on('click', async (_evt: MouseEvent, d: GraphVizNode) => {
				if (onNodeClick) await onNodeClick(nodeInfo(d));
			})
			.call(
				createDragBehavior({
					simulation,
					isDraggingRef: simulationZoomRefs.isDraggingRef,
					onDragEnd: () => scheduleRenderJoin('dragEnd'),
				}) as (sel: d3Selection.Selection<SVGGElement, GraphVizNode, SVGGElement, unknown>) => void
			);

		nodeEnter.each(function (d: GraphVizNode) {
			appendNodeShapeContent(d3Selection.select(this as SVGGElement), d, getNodeFillByConfig(d));
		});
		nodeEnter.append('title').text((d) => `${getNodeLabel(d, 'full')}\n${d.id}`);

		const nodeMerged = nodeEnter.merge(nodeSel);
		nodeMerged.on('dblclick', (evt: MouseEvent) => {
			evt.stopPropagation();
			// Fold/unfold is via right-click context menu only
		});
		nodeMerged.select('.node-shape-circle').attr('r', (d) => d.r).attr('fill', getNodeFillByConfig);
		nodeMerged.select('.node-shape-path').attr('d', (d) => getNodeShapePath(d) ?? '').attr('fill', getNodeFillByConfig);
		nodeMerged.select('g.lucide-icon').attr('transform', (d) => {
			const r = d.r ?? 10;
			return `scale(${(2 * r) / LUCIDE_VIEWBOX}) translate(-12,-12)`;
		});
		nodeMerged.select('g.lucide-icon path').attr('fill', getNodeFillByConfig).attr('stroke', getNodeFillByConfig);
		nodeMerged.select('g.lucide-icon circle').attr('fill', getNodeFillByConfig);
		nodeMerged.select('title').text((d) => `${getNodeLabel(d, 'full')}\n${d.id}`);
		nodeMerged.each(function (d: GraphVizNode) {
			const g = d3Selection.select(this as SVGGElement);
			if (
				g.select('.node-shape-circle').empty() &&
				g.select('.node-shape-path').empty() &&
				g.select('g.lucide-icon').empty()
			) {
				appendNodeShapeContent(g, d, getNodeFillByConfig(d));
			}
		});

		phase(t0, 'nodes data-join done', visibleNodes);

		if (!isStreaming) {
			nodeEnter
				.transition()
				.delay((_d, i) => i * STAGGER_NODE_MS)
				.duration(260)
				.attr('opacity', 1);
			nodeEnter
				.select('.node-shape-circle')
				.transition()
				.delay((d) => Math.max(0, visibleNodes.indexOf(d)) * STAGGER_NODE_MS)
				.duration(260)
				.attr('r', (d) => d.r);
			nodeSel.exit().transition().duration(150).attr('opacity', 0).remove();
		} else {
			nodeEnter.select('.node-shape-circle').attr('r', (d) => d.r);
			nodeSel.exit().remove();
		}
		nodeSelRef.current = nodeMerged;
	}

	function phaseLabelsDataJoin(
		t0: number,
		labelsLayer: d3Selection.Selection<SVGGElement, unknown, null, undefined>,
		visibleNodes: GraphVizNode[],
		isStreaming: boolean,
		getNodeLabelFn: (node: GraphVizNode, mode: 'full' | 'short') => string,
		labelSelRef: React.MutableRefObject<d3Selection.Selection<SVGTextElement, GraphVizNode, SVGGElement, unknown> | null>,
	) {
		phase(t0, 'labels data-join', visibleNodes);
		if (!isStreaming) {
			const labelSel = labelsLayer
				.selectAll<SVGTextElement, GraphVizNode>('text')
				.data(visibleNodes, (d) => `label-${String(d.id)}`);

			const labelEnter = labelSel
				.enter()
				.append('text')
				.text((d) => getNodeLabelFn(d, 'short'))
				.attr('font-size', '9px')
				.attr('fill', '#4b5563')
				.attr('text-anchor', 'middle')
				.attr('dy', (d) => (d.r + 12) + 'px')
				.style('pointer-events', 'none')
				.style('user-select', 'none')
				.style('font-weight', '500')
				.attr('opacity', 0);

			labelEnter.append('title').text((d) => `${getNodeLabelFn(d, 'full')}\n${d.id}`);
			const labelMerged = labelEnter.merge(labelSel);
			labelMerged.attr('dy', (d) => (d.r + 12) + 'px');
			labelMerged.text((d) => getNodeLabelFn(d, 'short'));
			labelMerged.select('title').text((d) => `${getNodeLabelFn(d, 'full')}\n${d.id}`);

			labelEnter
				.transition()
				.delay((_d, i) => i * STAGGER_NODE_MS)
				.duration(260)
				.attr('opacity', 1);
			labelSel.exit().transition().duration(150).attr('opacity', 0).remove();
			labelSelRef.current = labelMerged;
		} else {
			labelSelRef.current = labelsLayer.selectAll<SVGTextElement, GraphVizNode>('text');
		}
		phase(t0, 'labels data-join done', visibleNodes);
	}

	/**
	 * Schedules one run of renderJoin on the next animation frame.
	 * - basicOnly: true = nodes/links only (streaming); false = full (MST, hub, community, labels).
	 * - bypassThrottle: true = run immediately (e.g. last streaming batch); otherwise throttle during streaming.
	 */
	const scheduleRenderJoin = useCallback((source?: string, opts?: ScheduleRenderJoinOpts) => {
		scheduleRenderJoinRef.current = scheduleRenderJoin;
		const basicOnly = opts?.basicOnly ?? false;
		const bypassThrottle = opts?.bypassThrottle ?? false;

		// Throttle: during streaming with basicOnly, run at most every STREAMING_JOIN_MS.
		// If not enough time has passed, defer and return (or set a timer to retry).
		if (!bypassThrottle && streamingRef.current && basicOnly) {
			const now = performance.now();
			const elapsed = now - lastRenderJoinTsRef.current;
			if (elapsed < STREAMING_JOIN_MS && nodesRef.current.length > 40) {
				if (streamingThrottleTimerRef.current == null) {
					streamingThrottleTimerRef.current = window.setTimeout(() => {
						streamingThrottleTimerRef.current = null;
						scheduleRenderJoin('throttleDeferred', opts);
					}, STREAMING_JOIN_MS - elapsed);
				}
				return;
			}
		}

		// Coalesce: if a RAF is already scheduled, do not schedule another (one render per frame).
		if (renderJoinRafRef.current != null) return;

		scheduleRenderJoinCallCountRef.current += 1;
		const callCount = scheduleRenderJoinCallCountRef.current;
		renderJoinRafRef.current = window.requestAnimationFrame(() => {
			renderJoinRafRef.current = null;
			lastRenderJoinTsRef.current = performance.now();
			renderJoin(basicOnly);
			if (pendingVersionBumpRef.current && !streamingRef.current) {
				pendingVersionBumpRef.current = false;
				setVersion((v) => v + 1);
			}
		});
	}, [
		renderJoin,
		streamingRef,
		nodesRef,
		lastRenderJoinTsRef,
		streamingThrottleTimerRef,
		renderJoinRafRef,
		pendingVersionBumpRef,
		setVersion,
	]);

	const markStreaming = useCallback(() => {
		streamingRef.current = true;
		if (streamingOffTimerRef.current != null) window.clearTimeout(streamingOffTimerRef.current);
		streamingOffTimerRef.current = window.setTimeout(() => {
			streamingOffTimerRef.current = null;
			streamingRef.current = false;
			scheduleRenderJoin('markStreaming');
		}, 220);
	}, [streamingRef, streamingOffTimerRef, scheduleRenderJoin]);

	return { renderJoin, scheduleRenderJoin, markStreaming };
}
