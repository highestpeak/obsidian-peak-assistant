/**
 * Encapsulates renderJoin (D3 data-join + simulation update), scheduleRenderJoin (RAF(requestAnimationFrame) coalescing),
 * and markStreaming (streaming throttle). Used by GraphVisualization to drive graph DOM updates.
 */

import React, { useCallback, useRef } from 'react';
import * as d3 from 'd3-force';
import type { GraphConfig } from '../config';
import type {
	GraphVizNode,
	GraphVizLink,
	GraphVizNodeInfo,
	GraphVizNodeHoverInfo,
	NodeContextMenuConfig,
} from '../types';
import type { EdgeStyle } from '../types';
import { linkKey, getLinkEndpointId } from '../utils/link-key';
import { getVisibleGraph } from '../utils/visibleGraph';
import { computeMstEdgeKeys, computeMstTerminalEdgeKeys, computeMstBackboneEdgeKeys, computeMstBranchRootMap, normalizeEdgeWeight, computeConnectedComponents } from '../utils/mst';
import { computeTopology, assignInitialPositionsByGroup } from '../utils/topologyLayout';
import { STREAMING_JOIN_MS } from '../core/constants';
import { computeDegreeMap, assignRadiusByConfig, computeHubNodeIds } from '../core/degreeRadius';
import { resolveLinkEndpoints } from '../core/linkResolver';
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
		scheduleDrawRef,
	} = params;

	const { simulationRef, settleTimerRef } = simulationZoomRefs;
	const { nodesRef, linksRef } = graphDataRefs;
	const { streamingRef, renderJoinRafRef, lastRenderJoinTsRef, streamingThrottleTimerRef, streamingOffTimerRef, pendingVersionBumpRef, throttleTickRef } = streamingRefs;
	const scheduleRenderJoinCallCountRef = useRef(0);
	const { hubNodeIdsRef, communityMapRef, componentMapRef, visibleNodesRef, visibleLinksRef } = effectsRefs;
	const { configRef, foldedSetRef, pathStartIdRef } = contextRefs;

	const scheduleRenderJoinRef = useRef<(source?: string, opts?: ScheduleRenderJoinOpts) => void>(() => { });

	const phase = (_t0: number, _label: string, _visibleNodes: GraphVizNode[]) => {};

	const renderJoin = useCallback((basicOnly = false) => {
		const t0 = performance.now();
		configRef.current = config;
		const simulation = simulationRef.current;
		if (!simulation) return;
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
		resolvedVisibleLinks = phaseMstAndEffects(t0, visibleNodes, resolvedVisibleLinks, basicOnly, config, normalizeNodeId, hubNodeIdsRef, communityMapRef, componentMapRef, containerSizeRef);

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

		scheduleDrawRef?.current?.();
	}, [
		config,
		configRef,
		foldedSet,
		normalizeNodeId,
		getEdgeStyle,
		simulationRef,
		streamingRef,
		nodesRef,
		linksRef,
		containerSizeRef,
		settleTimerRef,
		hubNodeIdsRef,
		communityMapRef,
		visibleNodesRef,
		throttleTickRef,
		pathStartIdRef,
		foldedSetRef,
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
		componentMapRef: React.MutableRefObject<Map<string, number>>,
		containerRef: React.MutableRefObject<{ width: number; height: number }>,
	): T[] {
		const width = Math.max(400, containerRef.current.width ?? 400);
		const height = Math.max(400, containerRef.current.height ?? 400);
		const padding = 80;

		// Treat nodes at/near origin as having no position (avoids cluster at 0,0 after updates)
		const hasValidPosition = (n: GraphVizNode) => {
			const x = n.x ?? 0;
			const y = n.y ?? 0;
			return Math.abs(x) > 20 || Math.abs(y) > 20;
		};
		for (const n of visibleNodes) {
			if (!hasValidPosition(n)) {
				n.x = undefined;
				n.y = undefined;
			}
		}

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

		// 3) Initial positions: by group when we have edges (and thus communityMap); otherwise random spread so nodes don't stack.
		const useGroupLayout = topology && topology.communityMap.size > 0;
		if (useGroupLayout) {
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
			// Use raw node ids so component map keys match simulation node.id (force reads compMap.get(n.id))
			const nodeIds = visibleNodes.map((n) => n.id);
			componentMapRef.current = computeConnectedComponents(nodeIds, resolvedVisibleLinks, getLinkEndpointId);
			phase(t0, 'degree/hub done', visibleNodes);
		} else {
			hubRef.current = [];
			communityRef.current = new Map();
			componentMapRef.current = new Map();
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
