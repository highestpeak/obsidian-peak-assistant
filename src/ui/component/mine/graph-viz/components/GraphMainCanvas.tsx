/**
 * Main canvas for graph rendering: edges, nodes, labels. Replaces SVG for performance.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type { GraphConfig } from '../config';
import type { GraphVizLink, GraphVizNode, GraphVizNodeInfo } from '../types';
import { linkKey } from '../utils/link-key';
import { computeMstTerminalEdgeKeys } from '../utils/mst';
import {
	createDrawScheduler,
	screenToWorld,
	hitTestNode,
	drawGraph,
	handleNodeClick,
	handleNodeDoubleClick,
	handleNodeContextMenu,
	type GraphInteractionContext,
	type NodeInfoFn,
} from '../core/canvas';
import type { EffectsCanvasRefs } from '../hooks/useGraphEngine';

export type GraphMainCanvasProps = {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	effectsCanvasRefs: EffectsCanvasRefs;
	simulationRef: React.MutableRefObject<import('d3-force').Simulation<GraphVizNode, GraphVizLink> | null>;
	config: GraphConfig;
	getEdgeStyle: (e: { kind: string; weight: number }) => { stroke?: string; strokeOpacity?: number; strokeDasharray?: string | null; strokeWidth?: number };
	getNodeLabel: (n: GraphVizNode, mode: 'full' | 'short') => string;
	extractPathFromNode: (n: GraphVizNode) => string | null;
	normalizeNodeId: (id: string) => string;
	hoveredNodeId: string | null;
	setHoveredNodeId: (id: string | null) => void;
	onNodeHover?: (info: { node: GraphVizNodeInfo; x: number; y: number } | null) => void;
	interactionContext: GraphInteractionContext;
	scheduleDrawRef: React.MutableRefObject<(() => void) | null>;
	/** Path select start node id (dashed ring); path result version to trigger redraw. */
	pathStartNodeId?: string | null;
	pathResultVersion?: number;
};

function getNodeFillByConfig(
	d: GraphVizNode,
	config: GraphConfig,
	nodeIdsWithSemantic: Set<string>
): string {
	if ((d.type ?? '').toLowerCase() === 'tag') return config.tagNodeFill;
	return nodeIdsWithSemantic.has(d.id) ? config.semanticNodeFill : config.physicalNodeFill;
}

export const GraphMainCanvas: React.FC<GraphMainCanvasProps> = ({
	canvasRef,
	effectsCanvasRefs,
	simulationRef,
	config,
	getEdgeStyle,
	getNodeLabel,
	extractPathFromNode,
	normalizeNodeId,
	hoveredNodeId,
	setHoveredNodeId,
	onNodeHover,
	interactionContext,
	scheduleDrawRef,
	pathStartNodeId = null,
	pathResultVersion = 0,
}) => {
	const { visibleNodesRef, linksRef, visibleLinksRef, zoomTransformRef, containerSizeRef, pathResultRef } = effectsCanvasRefs;
	const neighborIdsRef = useRef<Set<string>>(new Set());
	const highlightLinkKeysRef = useRef<Set<string>>(new Set());
	const nodeIdsWithSemanticRef = useRef<Set<string>>(new Set());
	const pointerDownRef = useRef<{ node: GraphVizNode; offsetX: number; offsetY: number } | null>(null);
	const lastClickRef = useRef<{ id: string; t: number } | null>(null);

	const nodeInfo: NodeInfoFn = useCallback(
		(d: GraphVizNode): GraphVizNodeInfo => ({
			id: d.id,
			label: d.label,
			type: d.type,
			path: extractPathFromNode(d),
		}),
		[extractPathFromNode]
	);

	// Compute neighborIds and highlightLinkKeys when hoveredNodeId changes (use visible links for consistency)
	useEffect(() => {
		if (hoveredNodeId == null) {
			neighborIdsRef.current = new Set();
			highlightLinkKeysRef.current = new Set();
			return;
		}
		const links = visibleLinksRef.current?.length ? visibleLinksRef.current : linksRef.current;
		const neighborIds = new Set<string>([hoveredNodeId]);
		const highlightLinkKeys = new Set<string>();
		for (const l of links) {
			const s = (l.source as GraphVizNode).id;
			const t = (l.target as GraphVizNode).id;
			const key = linkKey(l, normalizeNodeId);
			if (s === hoveredNodeId || t === hoveredNodeId) {
				neighborIds.add(s);
				neighborIds.add(t);
				highlightLinkKeys.add(key);
			}
		}
		neighborIdsRef.current = neighborIds;
		highlightLinkKeysRef.current = highlightLinkKeys;
	}, [hoveredNodeId, linksRef, visibleLinksRef, normalizeNodeId]);

	// nodeIdsWithSemantic computed in performDraw

	const performDraw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const { width, height } = containerSizeRef.current;
		if (width <= 0 || height <= 0) return;
		const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
		const nodes = visibleNodesRef.current?.length ? visibleNodesRef.current : effectsCanvasRefs.nodesRef.current;
		const links = visibleLinksRef.current?.length ? visibleLinksRef.current : linksRef.current;
		const tr = zoomTransformRef.current;
		const nodeIdsWithSemantic = new Set<string>();
		for (const l of links) {
			if (l.kind === 'semantic') {
				nodeIdsWithSemantic.add((l.source as GraphVizNode).id);
				nodeIdsWithSemantic.add((l.target as GraphVizNode).id);
			}
		}
		const getNodeFill = (d: GraphVizNode) => getNodeFillByConfig(d, config, nodeIdsWithSemantic);

		// In skeleton mode: terminal edges (original style) = MST edges with small subtree; non-MST edges drawn dimmed
		const mstLinks = config.skeletonMode && links.length > 0 ? links.filter((l) => l.isMSTEdge) : [];
		const mstKeys = new Set(mstLinks.map((l) => linkKey(l, normalizeNodeId)));
		const minBranchNodes = Math.max(1, config.skeletonMinBranchNodes ?? 3);
		const leafEdgeKeys =
			mstLinks.length > 0
				? computeMstTerminalEdgeKeys(mstLinks, (l) => linkKey(l, normalizeNodeId), mstKeys, minBranchNodes)
				: undefined;

		const pathRes = config.pathMode ? pathResultRef?.current : null;
		const pathLinkKeys = pathRes?.pathLinkKeys;
		const pathNodeIds = pathRes?.pathNodeIds.length ? new Set(pathRes.pathNodeIds) : undefined;
		const pathColorVal = pathRes ? config.pathColor : (pathStartNodeId ? config.pathColor : undefined);

		drawGraph({
			ctx,
			width,
			height,
			dpr,
			transform: tr,
			nodes,
			links,
			config,
			getEdgeStyle,
			getNodeFill,
			getNodeLabel,
			normalizeNodeId,
			hoveredNodeId,
			neighborIds: neighborIdsRef.current,
			highlightLinkKeys: highlightLinkKeysRef.current,
			leafEdgeKeys,
			pathLinkKeys,
			pathNodeIds,
			pathColor: pathColorVal,
			pathStartId: pathStartNodeId ?? undefined,
		});
	}, [
		canvasRef,
		containerSizeRef,
		visibleNodesRef,
		effectsCanvasRefs.nodesRef,
		linksRef,
		visibleLinksRef,
		zoomTransformRef,
		config,
		getEdgeStyle,
		getNodeLabel,
		normalizeNodeId,
		hoveredNodeId,
		pathStartNodeId,
		pathResultVersion,
	]);

	// Redraw when path selection changes (start node ring or path result)
	useEffect(() => {
		scheduleDrawRef.current?.();
	}, [pathStartNodeId, pathResultVersion, scheduleDrawRef]);

	useEffect(() => {
		const scheduler = createDrawScheduler(performDraw);
		scheduleDrawRef.current = scheduler.schedule;
		return () => {
			scheduler.cancel();
			scheduleDrawRef.current = null;
		};
	}, [performDraw, scheduleDrawRef]);

	// Redraw when config changes (e.g. physical edge opacity/width) so style changes apply
	useEffect(() => {
		scheduleDrawRef.current?.();
	}, [config, scheduleDrawRef]);

	// Pointer events: hit test, hover, click, dblclick, contextmenu, drag
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const getWorld = (sx: number, sy: number) => {
			const tr = zoomTransformRef.current;
			return screenToWorld(tr.x, tr.y, tr.k)(sx, sy);
		};

		const updateHoverFromPoint = (clientX: number, clientY: number) => {
			const rect = canvas.getBoundingClientRect();
			const sx = clientX - rect.left;
			const sy = clientY - rect.top;
			const nodes = visibleNodesRef.current?.length ? visibleNodesRef.current : effectsCanvasRefs.nodesRef.current;
			const hit = hitTestNode(sx, sy, nodes, getWorld);
			setHoveredNodeId(hit?.id ?? null);
			if (hit) onNodeHover?.({ node: nodeInfo(hit), x: clientX, y: clientY });
			else onNodeHover?.(null);
			scheduleDrawRef.current?.();
		};

		const handlePointerMove = (evt: PointerEvent) => {
			const rect = canvas.getBoundingClientRect();
			const sx = evt.clientX - rect.left;
			const sy = evt.clientY - rect.top;
			if (pointerDownRef.current) {
				const { node, offsetX, offsetY } = pointerDownRef.current;
				const { x: wx, y: wy } = getWorld(sx, sy);
				node.fx = wx - offsetX;
				node.fy = wy - offsetY;
				scheduleDrawRef.current?.();
				return;
			}
			updateHoverFromPoint(evt.clientX, evt.clientY);
		};

		const handlePointerEnter = (evt: PointerEvent) => {
			updateHoverFromPoint(evt.clientX, evt.clientY);
		};

		const handlePointerDown = (evt: PointerEvent) => {
			if (evt.button !== 0) return;
			const rect = canvas.getBoundingClientRect();
			const sx = evt.clientX - rect.left;
			const sy = evt.clientY - rect.top;
			const nodes = visibleNodesRef.current?.length ? visibleNodesRef.current : effectsCanvasRefs.nodesRef.current;
			const hit = hitTestNode(sx, sy, nodes, getWorld);
			if (hit) {
				evt.preventDefault();
				evt.stopPropagation();
				const { x: wx, y: wy } = getWorld(sx, sy);
				pointerDownRef.current = {
					node: hit,
					offsetX: wx - (hit.x ?? 0),
					offsetY: wy - (hit.y ?? 0),
				};
				effectsCanvasRefs.isDraggingRef.current = true;
				const sim = simulationRef.current;
				if (sim) sim.alphaTarget(0.02).restart();
			}
		};

		const handlePointerUp = (evt: PointerEvent) => {
			if (evt.button !== 0) return;
			const wasDrag = pointerDownRef.current != null;
			if (pointerDownRef.current) {
				pointerDownRef.current.node.fx = null;
				pointerDownRef.current.node.fy = null;
				pointerDownRef.current = null;
				effectsCanvasRefs.isDraggingRef.current = false;
				const sim = simulationRef.current;
				if (sim) sim.alphaTarget(0);
				interactionContext.scheduleRenderJoin('dragEnd');
			}
			scheduleDrawRef.current?.();
		};

		const handlePointerCancel = () => {
			if (pointerDownRef.current) {
				pointerDownRef.current.node.fx = null;
				pointerDownRef.current.node.fy = null;
				pointerDownRef.current = null;
				effectsCanvasRefs.isDraggingRef.current = false;
			}
		};

		const handleClick = (evt: MouseEvent) => {
			if (pointerDownRef.current) return;
			const rect = canvas.getBoundingClientRect();
			const sx = evt.clientX - rect.left;
			const sy = evt.clientY - rect.top;
			const nodes = visibleNodesRef.current?.length ? visibleNodesRef.current : effectsCanvasRefs.nodesRef.current;
			const hit = hitTestNode(sx, sy, nodes, getWorld);
			if (!hit) {
				console.debug('[GraphViz:Path] Click missed (no node under cursor)', { nodesCount: nodes?.length ?? 0 });
				return;
			}
			const now = Date.now();
			const last = lastClickRef.current;
			if (last && last.id === hit.id && now - last.t < 300) {
				lastClickRef.current = null;
				handleNodeDoubleClick(evt, hit, interactionContext);
				return;
			}
			lastClickRef.current = { id: hit.id, t: now };
			handleNodeClick(evt, hit, interactionContext, nodeInfo).catch(() => {});
		};

		const handleContextMenu = (evt: MouseEvent) => {
			evt.preventDefault();
			const rect = canvas.getBoundingClientRect();
			const sx = evt.clientX - rect.left;
			const sy = evt.clientY - rect.top;
			const nodes = visibleNodesRef.current?.length ? visibleNodesRef.current : effectsCanvasRefs.nodesRef.current;
			const hit = hitTestNode(sx, sy, nodes, getWorld);
			if (hit) handleNodeContextMenu(evt, hit, interactionContext, nodeInfo);
		};

		canvas.addEventListener('pointerenter', handlePointerEnter);
		canvas.addEventListener('pointermove', handlePointerMove);
		canvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
		window.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointercancel', handlePointerCancel);
		canvas.addEventListener('pointerleave', () => {
			setHoveredNodeId(null);
			onNodeHover?.(null);
			handlePointerCancel();
			scheduleDrawRef.current?.();
		});
		canvas.addEventListener('click', handleClick);
		canvas.addEventListener('contextmenu', handleContextMenu);

		return () => {
			canvas.removeEventListener('pointerenter', handlePointerEnter);
			canvas.removeEventListener('pointermove', handlePointerMove);
			canvas.removeEventListener('pointerdown', handlePointerDown, { capture: true });
			canvas.removeEventListener('pointerup', handlePointerUp);
			window.removeEventListener('pointerup', handlePointerUp);
			canvas.removeEventListener('pointercancel', handlePointerCancel);
			canvas.removeEventListener('click', handleClick);
			canvas.removeEventListener('contextmenu', handleContextMenu);
		};
	}, [
		canvasRef,
		visibleNodesRef,
		effectsCanvasRefs,
		zoomTransformRef,
		setHoveredNodeId,
		onNodeHover,
		interactionContext,
		nodeInfo,
		scheduleDrawRef,
		simulationRef,
		config.pathMode,
	]);

	return (
		<canvas
			ref={canvasRef as React.RefObject<HTMLCanvasElement>}
			className="pktw-absolute pktw-inset-0 pktw-w-full pktw-h-full pktw-cursor-grab pktw-z-[1]"
			style={{ touchAction: 'none' }}
			tabIndex={0}
			aria-label="Graph canvas"
		/>
	);
};
