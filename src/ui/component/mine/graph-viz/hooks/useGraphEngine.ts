/**
 * Graph engine: owns D3 simulation, render join, hover highlight, and streaming refs.
 * Exposes only applyPatch, clear, fitToView, resize API, and effectsCanvasRefs for GraphEffectsCanvas.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3-force';
import * as d3Selection from 'd3-selection';
import * as d3Zoom from 'd3-zoom';
import type { GraphPatch } from '../utils/graphPatches';
import type { GraphVizNode, GraphVizLink, GraphVizNodeInfo, GraphVizNodeHoverInfo, NodeContextMenuConfig } from '../types';
import type { GraphConfig } from '../config';
import type { EdgeStyle } from '../types';
import { DEFAULT_CONFIG } from '../config';
import { createGraphDataCache } from '../core/graphData';
import { getVisibleGraph, getLeavesOf } from '../utils/visibleGraph';
import { shortestPath } from '../utils/shortestPath';
import { linkKey, getLinkEndpointId } from '../utils/link-key';
import { computeNodeBounds, computeFitTransform } from '../core/graphBounds';
import { useGraphContainer } from './useGraphContainer';
import { useGraphSimulation } from './useGraphSimulation';
import { useGraphRenderJoin, type ScheduleRenderJoinOpts } from './useGraphRenderJoin';
import type { GraphInteractionContext } from '../core/canvas';

/** DOM refs: graph area div, effect canvas, main canvas. */
export type DomRefs = {
	graphAreaRef: React.RefObject<HTMLDivElement | null>;
	effectCanvasRef: React.RefObject<HTMLCanvasElement | null>;
	mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
};

/** Simulation and zoom refs. */
export type SimulationZoomRefs = {
	simulationRef: React.MutableRefObject<d3.Simulation<GraphVizNode, GraphVizLink> | null>;
	zoomRef: React.MutableRefObject<d3Zoom.ZoomBehavior<SVGSVGElement | HTMLCanvasElement, unknown> | null>;
	zoomTransformRef: React.MutableRefObject<{ x: number; y: number; k: number }>;
	userInteractedRef: React.MutableRefObject<boolean>;
	settleTimerRef: React.MutableRefObject<number | null>;
	/** True while user is dragging a node; hub/community overlay skipped during drag. */
	isDraggingRef: React.MutableRefObject<boolean>;
};

/** SVG layer and D3 selection refs. */
export type LayerRefs = {
	rootGRef: React.MutableRefObject<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>;
	linksLayerRef: React.MutableRefObject<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>;
	nodesLayerRef: React.MutableRefObject<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>;
	labelsLayerRef: React.MutableRefObject<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>;
	linkSelRef: React.MutableRefObject<d3Selection.Selection<SVGLineElement, GraphVizLink, SVGGElement, unknown> | null>;
	nodeSelRef: React.MutableRefObject<d3Selection.Selection<SVGGElement, GraphVizNode, SVGGElement, unknown> | null>;
	labelSelRef: React.MutableRefObject<d3Selection.Selection<SVGTextElement, GraphVizNode, SVGGElement, unknown> | null>;
};

/** Master graph data refs. */
export type GraphDataRefs = {
	nodesRef: React.MutableRefObject<GraphVizNode[]>;
	linksRef: React.MutableRefObject<GraphVizLink[]>;
};

/** Render join and streaming refs (RAF(requestAnimationFrame), timers, throttle). */
export type StreamingRefs = {
	renderJoinRafRef: React.MutableRefObject<number | null>;
	streamingThrottleTimerRef: React.MutableRefObject<number | null>;
	streamingRef: React.MutableRefObject<boolean>;
	streamingOffTimerRef: React.MutableRefObject<number | null>;
	pendingVersionBumpRef: React.MutableRefObject<boolean>;
	lastRenderJoinTsRef: React.MutableRefObject<number>;
	throttleTickRef: React.MutableRefObject<boolean>;
	tickCountRef: React.MutableRefObject<number>;
};

/** Effects/computed refs (hubs, community, visible subset, connected components). */
export type EffectsRefs = {
	hubNodeIdsRef: React.MutableRefObject<string[]>;
	communityMapRef: React.MutableRefObject<Map<string, number>>;
	/** Node id -> connected component index (0, 1, 2, ...). Used for inter-component repulsion when multiple MSTs. */
	componentMapRef: React.MutableRefObject<Map<string, number>>;
	visibleNodesRef: React.MutableRefObject<GraphVizNode[]>;
	/** MST-filtered visible links; used for canvas drawing and neighbor computation. */
	visibleLinksRef: React.MutableRefObject<GraphVizLink[]>;
};

/** Context refs for callbacks (config, fold, path start). */
export type ContextRefs = {
	configRef: React.MutableRefObject<GraphConfig>;
	foldedSetRef: React.MutableRefObject<Set<string>>;
	pathStartIdRef: React.MutableRefObject<string | null>;
};

export type EffectsCanvasRefs = {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	nodesRef: React.MutableRefObject<GraphVizNode[]>;
	linksRef: React.MutableRefObject<GraphVizLink[]>;
	/** MST-filtered visible links; preferred over linksRef for drawing/neighbors. */
	visibleLinksRef: React.MutableRefObject<GraphVizLink[]>;
	/** Visible nodes with current simulation positions; used for hub/community drawing. */
	visibleNodesRef: React.MutableRefObject<GraphVizNode[]>;
	zoomTransformRef: React.MutableRefObject<{ x: number; y: number; k: number }>;
	containerSizeRef: React.MutableRefObject<{ width: number; height: number }>;
	resizeTick: number;
	hubNodeIdsRef: React.MutableRefObject<string[]>;
	communityMapRef: React.MutableRefObject<Map<string, number>>;
	/** When path mode is on and a path was computed. */
	pathResultRef: React.MutableRefObject<{ pathNodeIds: string[]; pathLinkKeys: Set<string> } | null>;
	/** Timestamp when path result was set (for segment-by-segment animation). */
	pathResultT0Ref: React.MutableRefObject<number>;
	/** Skip hub/community overlay when streaming or dragging. */
	streamingRef: React.MutableRefObject<boolean>;
	isDraggingRef: React.MutableRefObject<boolean>;
	/** Path pathNodeIds are in normalized space; use for node lookup in effects. */
	normalizeNodeId: (id: string) => string;
};

export type UseGraphEngineParams = {
	config: GraphConfig;
	foldedSet: Set<string>;
	setFoldedSet: React.Dispatch<React.SetStateAction<Set<string>>>;
	setContextMenu: React.Dispatch<
		React.SetStateAction<{ open: boolean; clientX: number; clientY: number; node: GraphVizNodeInfo | null }>
	>;
	normalizeNodeId: (id: string) => string;
	getEdgeStyle: (edge: { kind: string; weight: number }) => EdgeStyle;
	getNodeLabel: (node: GraphVizNode, mode: 'full' | 'short') => string;
	extractPathFromNode: (node: GraphVizNode) => string | null;
	defaultNodeType: string;
	defaultEdgeKind: string;
	getNodeStyle: (node: GraphVizNode) => { fill?: string; r?: number };
	onNodeClick?: (node: GraphVizNodeInfo) => void | Promise<void>;
	onNodeHover?: (info: GraphVizNodeHoverInfo | null) => void;
	onNodeContextMenu?: (pos: { x: number; y: number }, node: GraphVizNodeInfo) => void;
	nodeContextMenu?: NodeContextMenuConfig | null;
};

export type ApplyPatchOpts = {
	/** 'batch': streaming intermediate batch, basic render only. 'last': streaming done, full render. */
	streamPhase?: 'batch' | 'last';
};

export type UseGraphEngineResult = {
	graphAreaRef: React.RefObject<HTMLDivElement | null>;
	mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
	scheduleDrawRef: React.MutableRefObject<(() => void) | null>;
	simulationRef: React.MutableRefObject<d3.Simulation<GraphVizNode, GraphVizLink> | null>;
	effectsCanvasRefs: EffectsCanvasRefs;
	applyPatch: (patch: GraphPatch, opts?: ApplyPatchOpts) => Promise<void>;
	clear: () => void;
	fitToView: (force?: boolean) => void;
	handleZoom: (delta: number) => void;
	relayout: () => void;
	applyPatchRef: React.MutableRefObject<(patch: GraphPatch, opts?: ApplyPatchOpts) => Promise<void>>;
	clearRef: React.MutableRefObject<() => void>;
	pathResult: { pathNodeIds: string[]; pathLinkKeys: Set<string> } | null;
	setPathResult: React.Dispatch<
		React.SetStateAction<{ pathNodeIds: string[]; pathLinkKeys: Set<string> } | null>
	>;
	clearPath: () => void;
	hasPathSelection: boolean;
	scheduleRenderJoin: (source?: string, opts?: ScheduleRenderJoinOpts) => void;
	zoomLevel: number;
	hasData: boolean;
	/** True when current graph has at least one concept node (for showing concept color in settings). */
	hasConceptNodes: boolean;
	interactionContext: GraphInteractionContext;
	hoveredNodeId: string | null;
	setHoveredNodeId: (id: string | null) => void;
	onFoldNode: (nodeId: string) => void;
	pathStartNodeId: string | null;
	onSetPathStartNode: (nodeId: string) => void;
	onSetPathEndNode: (nodeId: string) => void;
	pathSelectMode: boolean;
	enterPathSelectMode: () => void;
	exitPathSelectMode: () => void;
	/** Shown when "pick two nodes" yields no path. */
	pathError: string | null;
};

export function useGraphEngine(params: UseGraphEngineParams): UseGraphEngineResult {
	const {
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
		onNodeClick,
		onNodeHover,
		onNodeContextMenu,
		nodeContextMenu,
	} = params;

	// Refs: DOM (canvas-only rendering)
	const graphAreaRef = useRef<HTMLDivElement>(null);
	const effectCanvasRef = useRef<HTMLCanvasElement>(null);
	const mainCanvasRef = useRef<HTMLCanvasElement>(null);
	const scheduleDrawRef = useRef<(() => void) | null>(null);

	// Refs: D3 simulation and zoom
	const simulationRef = useRef<d3.Simulation<GraphVizNode, GraphVizLink> | null>(null);
	const zoomRef = useRef<d3Zoom.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
	const zoomTransformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
	const userInteractedRef = useRef<boolean>(false);
	const settleTimerRef = useRef<number | null>(null);
	const isDraggingRef = useRef<boolean>(false);

	// Refs: D3 layers and selections
	const rootGRef = useRef<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>(null);
	const linksLayerRef = useRef<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>(null);
	const nodesLayerRef = useRef<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>(null);
	const labelsLayerRef = useRef<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>(null);
	const linkSelRef = useRef<d3Selection.Selection<SVGLineElement, GraphVizLink, SVGGElement, unknown> | null>(null);
	const nodeSelRef = useRef<d3Selection.Selection<SVGGElement, GraphVizNode, SVGGElement, unknown> | null>(null);
	const labelSelRef = useRef<d3Selection.Selection<SVGTextElement, GraphVizNode, SVGGElement, unknown> | null>(null);

	// Refs: graph data (master node/link lists)
	const nodesRef = useRef<GraphVizNode[]>([]);
	const linksRef = useRef<GraphVizLink[]>([]);
	const graphDataCacheRef = useRef(createGraphDataCache());

	// Refs: render join & streaming (RAF(requestAnimationFrame), timers, throttle)
	const renderJoinRafRef = useRef<number | null>(null);
	const streamingThrottleTimerRef = useRef<number | null>(null);
	const streamingRef = useRef(false);
	const streamingOffTimerRef = useRef<number | null>(null);
	const pendingVersionBumpRef = useRef(false);
	const lastRenderJoinTsRef = useRef<number>(0);
	const throttleTickRef = useRef(false);
	const tickCountRef = useRef(0);

	// Refs: effects / computed (hubs, community, connected components, visible subset)
	const hubNodeIdsRef = useRef<string[]>([]);
	const communityMapRef = useRef<Map<string, number>>(new Map());
	const componentMapRef = useRef<Map<string, number>>(new Map());
	const visibleNodesRef = useRef<GraphVizNode[]>([]);
	const visibleLinksRef = useRef<GraphVizLink[]>([]);

	// Refs: context for callbacks (config, fold, path start)
	const configRef = useRef<GraphConfig>(DEFAULT_CONFIG);
	const foldedSetRef = useRef<Set<string>>(new Set());
	const pathStartIdRef = useRef<string | null>(null);
	const pathSelectModeRef = useRef<boolean>(false);

	// State
	const [pathResult, setPathResult] = useState<{ pathNodeIds: string[]; pathLinkKeys: Set<string> } | null>(null);
	const [pathStartNodeId, setPathStartNodeId] = useState<string | null>(null);
	const [pathSelectMode, setPathSelectMode] = useState(false);
	/** Message when "pick two nodes" path has no route (so user gets feedback). */
	const [pathError, setPathError] = useState<string | null>(null);
	const [zoomLevel, setZoomLevel] = useState(1);
	const [version, setVersion] = useState(0);
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
	const [hasData, setHasData] = useState(false);
	const [hasConceptNodes, setHasConceptNodes] = useState(false);

	const pathResultRef = useRef<{ pathNodeIds: string[]; pathLinkKeys: Set<string> } | null>(null);
	const pathResultT0Ref = useRef<number>(0);
	/** Snapshot of edge endpoint ids at applyPatch; used for pathfinding so we never rely on mutated link refs. */
	const pathfindingEdgesRef = useRef<Array<{ a: string; b: string; kind: string; weight: number }>>([]);
	useEffect(() => {
		pathResultRef.current = pathResult;
		if (pathResult && pathResult.pathNodeIds.length > 0) pathResultT0Ref.current = Date.now();
	}, [pathResult]);
	useEffect(() => {
		foldedSetRef.current = foldedSet;
	}, [foldedSet]);
	useEffect(() => {
		pathSelectModeRef.current = pathSelectMode;
	}, [pathSelectMode]);

	const { resizeTick, containerSizeRef } = useGraphContainer(graphAreaRef);

	// Ref groups for clearer passing and maintenance
	const domRefs: DomRefs = { graphAreaRef, effectCanvasRef, mainCanvasRef };
	const simulationZoomRefs: SimulationZoomRefs = {
		simulationRef,
		zoomRef,
		zoomTransformRef,
		userInteractedRef,
		settleTimerRef,
		isDraggingRef,
	};
	const layerRefs: LayerRefs = {
		rootGRef,
		linksLayerRef,
		nodesLayerRef,
		labelsLayerRef,
		linkSelRef,
		nodeSelRef,
		labelSelRef,
	};
	const graphDataRefs: GraphDataRefs = { nodesRef, linksRef };
	const streamingRefs: StreamingRefs = {
		renderJoinRafRef,
		streamingThrottleTimerRef,
		streamingRef,
		streamingOffTimerRef,
		pendingVersionBumpRef,
		lastRenderJoinTsRef,
		throttleTickRef,
		tickCountRef,
	};
	// Stable ref so useGraphSimulation config effect does not run on every hover (which would restart sim and cause jitter)
	const effectsRefs = useMemo<EffectsRefs>(
		() => ({ hubNodeIdsRef, communityMapRef, componentMapRef, visibleNodesRef, visibleLinksRef }),
		[]
	);
	const contextRefs: ContextRefs = { configRef, foldedSetRef, pathStartIdRef };

	// --- Simulation: SVG layers or canvas, zoom, force simulation, tick updates ---
	useGraphSimulation({
		domRefs,
		simulationZoomRefs,
		layerRefs,
		streamingRefs,
		graphDataRefs,
		effectsRefs,
		containerSizeRef,
		resizeTick,
		config,
		setZoomLevel,
		getEdgeStyle,
		scheduleDrawRef,
	});

	// --- Render join: D3 data-join (SVG) or compute-only (canvas), schedule/markStreaming ---
	const { scheduleRenderJoin, markStreaming } = useGraphRenderJoin({
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
		scheduleDrawRef,
	});

	useEffect(() => {
		return () => {
			if (streamingOffTimerRef.current != null) {
				window.clearTimeout(streamingOffTimerRef.current);
				streamingOffTimerRef.current = null;
			}
			if (streamingThrottleTimerRef.current != null) {
				window.clearTimeout(streamingThrottleTimerRef.current);
				streamingThrottleTimerRef.current = null;
			}
			if (renderJoinRafRef.current != null) {
				window.cancelAnimationFrame(renderJoinRafRef.current);
				renderJoinRafRef.current = null;
			}
		};
	}, []);

	const applyPatch = useCallback(
		(patch: GraphPatch, opts?: ApplyPatchOpts): Promise<void> => {
			const { nodes, links } = graphDataCacheRef.current.applyPatch(patch, {
				getNodeStyle,
				normalizeNodeId,
				defaultNodeType,
				defaultEdgeKind,
			});
			nodesRef.current = nodes;
			linksRef.current = links;
			pathfindingEdgesRef.current = links.map((l) => ({
				a: normalizeNodeId(getLinkEndpointId(l.source)),
				b: normalizeNodeId(getLinkEndpointId(l.target)),
				kind: l.kind ?? 'physical',
				weight: typeof l.weight === 'number' ? l.weight : 1,
			}));
			if (!hasData && nodes.length > 0) setHasData(true);
			setHasConceptNodes(nodes.some((n) => (String(n.type ?? '').toLowerCase() === 'concept')));
			pendingVersionBumpRef.current = true;
			markStreaming();
			const phase = opts?.streamPhase;
			if (phase === 'batch') {
				scheduleRenderJoin('applyPatch', { basicOnly: true });
			} else if (phase === 'last') {
				scheduleRenderJoin('applyPatch', { bypassThrottle: true });
			} else {
				scheduleRenderJoin('applyPatch');
			}
			return Promise.resolve();
		},
		[getNodeStyle, normalizeNodeId, defaultNodeType, defaultEdgeKind, hasData, markStreaming, scheduleRenderJoin]
	);

	const fitToView = useCallback(
		(force = false) => {
			if (!zoomRef.current || nodesRef.current.length === 0) return;
			if (!force && userInteractedRef.current) return;
			const bounds = computeNodeBounds(nodesRef.current);
			if (!bounds) return;
			const container = graphAreaRef.current;
			if (!container) return;
			const cached = containerSizeRef.current;
			const width =
				cached.width > 0 && cached.height > 0 ? cached.width : container.clientWidth || 400;
			const height =
				cached.width > 0 && cached.height > 0 ? cached.height : container.clientHeight || 400;
			if (!(cached.width > 0 && cached.height > 0)) containerSizeRef.current = { width, height };
			const { scale, translateX, translateY } = computeFitTransform(bounds, width, height);
			const finalTransform = d3Zoom.zoomIdentity.translate(translateX, translateY).scale(scale);
			zoomTransformRef.current = { x: translateX, y: translateY, k: scale };
			setZoomLevel(scale);
			const zoomTarget = mainCanvasRef.current;
			if (zoomTarget) d3Selection.select(zoomTarget as SVGSVGElement).call(zoomRef.current!.transform, finalTransform);
			scheduleDrawRef.current?.();
		},
		[]
	);

	const handleZoom = useCallback((delta: number) => {
		if (!zoomRef.current) return;
		const zoomTarget = mainCanvasRef.current;
		if (!zoomTarget) return;
		const sel = d3Selection.select(zoomTarget as SVGSVGElement);
		const currentTransform = d3Zoom.zoomTransform(sel.node() as Element);
		const newScale = Math.max(0.02, Math.min(100, currentTransform.k * delta));
		const newTransform = d3Zoom.zoomIdentity.translate(currentTransform.x, currentTransform.y).scale(newScale);
		sel.call(zoomRef.current.transform, newTransform);
		setZoomLevel(newScale);
		scheduleDrawRef.current?.();
	}, []);

	const relayout = useCallback(() => {
		for (const n of nodesRef.current) {
			n.fx = null;
			n.fy = null;
		}
		scheduleRenderJoin('relayout');
	}, [scheduleRenderJoin]);

	const clear = useCallback(() => {
		userInteractedRef.current = false;
		setHoveredNodeId(null);
		graphDataCacheRef.current.clear();
		nodesRef.current = [];
		linksRef.current = [];
		pathfindingEdgesRef.current = [];
		visibleLinksRef.current = [];
		setHasData(false);
		setHasConceptNodes(false);
		streamingRef.current = false;
		if (streamingOffTimerRef.current != null) {
			window.clearTimeout(streamingOffTimerRef.current);
			streamingOffTimerRef.current = null;
		}
		pendingVersionBumpRef.current = true;
		scheduleRenderJoin('clear');
	}, [scheduleRenderJoin]);

	const clearPath = useCallback(() => {
		pathStartIdRef.current = null;
		setPathStartNodeId(null);
		setPathResult(null);
		setPathError(null);
	}, []);

	const enterPathSelectMode = useCallback(() => {
		setPathError(null);
		setPathSelectMode(true);
	}, []);
	const exitPathSelectMode = useCallback(() => setPathSelectMode(false), []);

	const onSetPathStartNode = useCallback((nodeId: string) => {
		setPathError(null);
		pathStartIdRef.current = nodeId;
		setPathStartNodeId(nodeId);
		console.debug('[GraphViz:Path] Start node set:', nodeId);
	}, []);

	const onSetPathEndNode = useCallback(
		(nodeId: string) => {
			const start = pathStartIdRef.current;
			console.debug('[GraphViz:Path] Set path end:', { start, nodeId, nodesCount: nodesRef.current.length, linksCount: linksRef.current.length });
			if (start == null) {
				console.debug('[GraphViz:Path] Abort: no start node');
				return;
			}
			if (start === nodeId) {
				console.debug('[GraphViz:Path] Abort: end equals start');
				return;
			}
			// Use pathfinding snapshot (normalized edge ids at applyPatch) so id space is consistent with linkKey/normalizeNodeId
			const allNodes = nodesRef.current;
			const norm = normalizeNodeId;
			const allNodeIds = new Set(allNodes.map((n) => norm(n.id)));
			const edges = pathfindingEdgesRef.current;
			const allLinksForPath = edges
				.filter((e) => allNodeIds.has(e.a) && allNodeIds.has(e.b))
				.map((e) => ({ source: e.a, target: e.b, kind: e.kind, weight: e.weight }));
			const startNorm = norm(start);
			const endNorm = norm(nodeId);
			// Debug: verify start/end degree in different edge sets
			const edgesTouchStart = edges.filter((e) => e.a === startNorm || e.b === startNorm);
			const edgesTouchEnd = edges.filter((e) => e.a === endNorm || e.b === endNorm);
			const linksTouchStart = linksRef.current.filter((l) => {
				const a = norm(getLinkEndpointId(l.source));
				const b = norm(getLinkEndpointId(l.target));
				return a === startNorm || b === startNorm;
			});
			const visibleLinksTouchStart = visibleLinksRef.current.filter((l) => {
				const a = norm(getLinkEndpointId(l.source));
				const b = norm(getLinkEndpointId(l.target));
				return a === startNorm || b === startNorm;
			});
			console.debug('[GraphViz:Path] Degree debug:', {
				startRaw: start,
				endRaw: nodeId,
				startNorm,
				endNorm,
				snapshotEdgesTotal: edges.length,
				snapshotEdgesTouchStart: edgesTouchStart.length,
				snapshotEdgesTouchEnd: edgesTouchEnd.length,
				linksRefTouchStart: linksTouchStart.length,
				visibleLinksTouchStart: visibleLinksTouchStart.length,
				snapshotTouchStartSample: edgesTouchStart.slice(0, 3),
				linksRefTouchStartSample: linksTouchStart.slice(0, 3).map((l) => ({
					a: norm(getLinkEndpointId(l.source)),
					b: norm(getLinkEndpointId(l.target)),
					kind: l.kind,
				})),
			});
			console.debug('[GraphViz:Path] Full graph path:', {
				nodes: allNodes.length,
				linksUsed: allLinksForPath.length,
				startIn: allNodeIds.has(startNorm),
				endIn: allNodeIds.has(endNorm),
			});
			const { pathNodeIds, pathLinkKeys } = shortestPath(
				startNorm,
				endNorm,
				allNodes,
				allLinksForPath,
				(l) => linkKey(l, normalizeNodeId),
				normalizeNodeId
			);
			const noPath = pathNodeIds.length === 0 || pathLinkKeys.size === 0;
			console.debug('[GraphViz:Path] Shortest path result:', { pathNodeIds: pathNodeIds.length, pathLinkCount: pathLinkKeys.size, noPath });
			if (noPath) {
				setPathResult(null);
				setPathError('No path found between the selected nodes.');
			} else {
				setPathResult({ pathNodeIds, pathLinkKeys });
				setPathError(null);
			}
			pathStartIdRef.current = null;
			setPathStartNodeId(null);
			setPathSelectMode(false);
			scheduleRenderJoin('path');
		},
		[normalizeNodeId, scheduleRenderJoin]
	);

	const applyPatchRef = useRef(applyPatch);
	const clearRef = useRef(clear);
	applyPatchRef.current = applyPatch;
	clearRef.current = clear;

	const effectsCanvasRefs: EffectsCanvasRefs = useMemo(
		() => ({
			canvasRef: effectCanvasRef,
			nodesRef,
			linksRef,
			visibleLinksRef,
			visibleNodesRef,
			zoomTransformRef,
			containerSizeRef,
			resizeTick,
			hubNodeIdsRef,
			communityMapRef,
			pathResultRef,
			pathResultT0Ref,
			streamingRef,
			isDraggingRef,
			normalizeNodeId,
		}),
		[resizeTick, normalizeNodeId]
	);

	const hasPathSelection = pathResult != null && pathResult.pathNodeIds.length > 0;

	const onFoldNode = useCallback(
		(nodeId: string) => {
			const leaves = getLeavesOf(
				nodeId,
				nodesRef.current,
				linksRef.current,
				configRef.current,
				foldedSetRef.current,
				normalizeNodeId
			);
			if (leaves.length === 0) return;
			setFoldedSet((prev) => {
				const next = new Set(prev);
				const allIn = leaves.every((id) => next.has(id));
				leaves.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
				return next;
			});
			scheduleRenderJoin('fold');
		},
		[setFoldedSet, scheduleRenderJoin, normalizeNodeId]
	);

	const interactionContext: GraphInteractionContext = useMemo(
		() => ({
			configRef,
			foldedSetRef,
			pathStartIdRef,
			pathSelectModeRef,
			nodesRef,
			linksRef,
			normalizeNodeId,
			setPathResult,
			setFoldedSet,
			setContextMenu,
			nodeContextMenu: nodeContextMenu ?? null,
			onNodeContextMenu,
			onNodeClick,
			scheduleRenderJoin,
			onSetPathStartNode,
			onSetPathEndNode,
			exitPathSelectMode,
		}),
		[
			normalizeNodeId,
			setPathResult,
			setFoldedSet,
			setContextMenu,
			nodeContextMenu,
			onNodeContextMenu,
			onNodeClick,
			scheduleRenderJoin,
			onSetPathStartNode,
			onSetPathEndNode,
			exitPathSelectMode,
		]
	);

	return {
		graphAreaRef,
		mainCanvasRef,
		scheduleDrawRef,
		simulationRef,
		applyPatch,
		clear,
		fitToView,
		handleZoom,
		relayout,
		applyPatchRef,
		clearRef,
		effectsCanvasRefs,
		pathResult,
		setPathResult,
		clearPath,
		hasPathSelection,
		scheduleRenderJoin,
		zoomLevel,
		hasData,
		hasConceptNodes,
		interactionContext,
		hoveredNodeId,
		setHoveredNodeId,
		onFoldNode,
		pathStartNodeId,
		onSetPathStartNode,
		onSetPathEndNode,
		pathSelectMode,
		enterPathSelectMode,
		exitPathSelectMode,
		pathError,
	};
}
