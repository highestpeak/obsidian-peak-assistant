import React, { useEffect } from 'react';
import type { GraphVizLink, GraphVizNode } from '../types';
import { getLinkEndpointId, linkKey } from '../utils/link-key';
import { convexHull } from '../utils/hull';
import type { GraphVisualEffect, GraphVisualEffectType, EffectKindMap } from '../graphAnimationStore';
import { EffectsCanvasRefs } from '../hooks/useGraphEngine';

const HULL_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308'];

/** 
 * MindFlow state animation colors (local constants, not exported). 
 * see src/service/agents/search-agent-helper/mindflow/types.ts for more details.
 * */
const MINDFLOW_COLORS = {
	thinking: '#a855f7',   // purple - active thinking
	exploring: '#60a5fa',  // blue - exploring
	verified: '#22c55e',   // green - verified/confirmed
	pruned: '#6b7280',     // gray - pruned/dead-end
} as const;

type MindflowState = keyof typeof MINDFLOW_COLORS;

/** Read mindflow state from node attributes. */
function getMindflowState(n: GraphVizNode): MindflowState | undefined {
	const mf = n.attributes?.mindflow as { state?: string } | undefined;
	const state = mf?.state;
	if (state && state in MINDFLOW_COLORS) return state as MindflowState;
	return undefined;
}

export interface GraphEffectsCanvasProps {
	effect: GraphVisualEffect | undefined;
	canvasRefs: EffectsCanvasRefs;

	effectKindMap: EffectKindMap;
	highlightHubs?: boolean;
	/** Hub halo color (CSS color). */
	hubColor?: string;
	/** When true, draw convex hulls per community. */
	communityMode?: boolean;
	/** Max number of community hulls to draw (largest communities first). */
	maxCommunityHulls?: number;
	pathMode?: boolean;
	/** Path overlay line and node glow color. */
	pathColor?: string;
	/** Bump when path result changes so canvas effect re-runs. */
	pathResultVersion?: number;
	/** Same as used when computing path (e.g. linkKey(l, normalizeNodeId)). */
	getLinkKey?: (l: GraphVizLink) => string;
	/** When true, draw breathing/pulse animations for MindFlow states (exploring, thinking). */
	mindflowAnimations?: boolean;
}

function getKindsForEffect(effectType: GraphVisualEffectType, effectKindMap: EffectKindMap): string[] {
	return effectKindMap[effectType] ?? [];
}

/** Polygon area in screen space (signed); use Math.abs for magnitude. */
function polygonArea(points: { x: number; y: number }[]): number {
	if (points.length < 3) return 0;
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const j = (i + 1) % points.length;
		area += points[i].x * points[j].y - points[j].x * points[i].y;
	}
	return Math.abs(area) * 0.5;
}

/** Returns ordered path edges for segment-by-segment animation. pathNodeIds are in normalized id space. */
function getOrderedPathEdges(
	pathNodeIds: string[],
	links: GraphVizLink[],
	getLinkKey: (l: GraphVizLink) => string,
	pathLinkKeys: Set<string>,
	nodes: GraphVizNode[],
	normalizeNodeId: (id: string) => string
): { aNode: GraphVizNode | undefined; bNode: GraphVizNode | undefined }[] {
	const norm = normalizeNodeId;
	const nodeByNormId = new Map<string, GraphVizNode>();
	for (const n of nodes) nodeByNormId.set(norm(n.id), n);
	const result: { aNode: GraphVizNode | undefined; bNode: GraphVizNode | undefined }[] = [];
	for (let i = 0; i < pathNodeIds.length - 1; i++) {
		const aId = pathNodeIds[i];
		const bId = pathNodeIds[i + 1];
		const link = links.find((l) => {
			const key = getLinkKey(l);
			if (!pathLinkKeys.has(key)) return false;
			const s = norm(getLinkEndpointId(l.source));
			const t = norm(getLinkEndpointId(l.target));
			return (s === aId && t === bId) || (s === bId && t === aId);
		});
		if (!link) continue;
		const aNode = nodeByNormId.get(aId);
		const bNode = nodeByNormId.get(bId);
		result.push({ aNode, bNode });
	}
	return result;
}

export const GraphEffectsCanvas: React.FC<GraphEffectsCanvasProps> = ({
	effect,
	canvasRefs,
	effectKindMap,
	highlightHubs = false,
	hubColor = '#f59e0b',
	communityMode = false,
	maxCommunityHulls = 8,
	pathMode = false,
	pathColor = '#22c55e',
	pathResultVersion = 0,
	getLinkKey = (l) => linkKey(l, (id) => id),
	mindflowAnimations = false,
}) => {

	const { canvasRef, nodesRef, linksRef, visibleNodesRef, zoomTransformRef, containerSizeRef, resizeTick, hubNodeIdsRef, communityMapRef, pathResultRef, pathResultT0Ref, streamingRef, isDraggingRef, normalizeNodeId } = canvasRefs;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const effType = effect?.type ?? 'none';
		const intensity = Math.max(0, Math.min(1, effect?.intensity ?? 0));
		const hasPath = pathMode && pathResultRef?.current && pathResultRef.current.pathNodeIds.length > 0;
		/** Skip hub/community overlay during streaming or drag; read refs in loop for current value. */
		const skipHeavyOverlayFn = () => !!(streamingRef?.current || isDraggingRef?.current);
		const staticOverlay = highlightHubs || communityMode || hasPath;
		const needsLoop = (effType !== 'none' && intensity > 0) || staticOverlay || mindflowAnimations;
		if (!needsLoop) {
			const { width, height } = containerSizeRef.current;
			ctx.clearRect(0, 0, width, height);
			return;
		}

		// RAF: requestAnimationFrame
		let raf = 0;
		let throttleTimer: ReturnType<typeof setTimeout> | null = null;
		let alive = true;
		const start = effect?.startedAtMs ?? Date.now();
		/** Throttle community hull *computation* to ~10fps; redraw from cache every frame to avoid flicker. */
		let frameCount = 0;
		const HULL_THROTTLE = 5;
		type CachedHull = { color: string; points: { x: number; y: number }[] };
		let cachedHulls: CachedHull[] = [];

		const drawGlowDot = (x: number, y: number, r: number, color: string, alpha: number) => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.fillStyle = color;
			ctx.shadowColor = color;
			ctx.shadowBlur = r * 3;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		};

		const drawLineGlow = (x1: number, y1: number, x2: number, y2: number, color: string, width: number, alpha: number) => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = color;
			ctx.lineWidth = width;
			ctx.shadowColor = color;
			ctx.shadowBlur = width * 4;
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			ctx.restore();
		};

		/** When only drawing static overlay (hub/community/path), throttle to ~10fps to avoid slow rAF and crash. */
		const throttleStaticOverlay = effType === 'none' && staticOverlay;
		const STATIC_FRAME_MS = 100;

		const loop = () => {
			if (!alive) return;
			const now = Date.now();
			const t = (now - start) / 1000;
			// Use cached dimensions — never read clientWidth/clientHeight to avoid forced reflow.
			const { width, height } = containerSizeRef.current;
			if (width <= 0 || height <= 0) {
				raf = requestAnimationFrame(loop);
				return;
			}

			ctx.clearRect(0, 0, width, height);

			const tr = zoomTransformRef.current;
			const toScreen = (x?: number, y?: number) => ({
				x: (x ?? 0) * tr.k + tr.x,
				y: (y ?? 0) * tr.k + tr.y,
			});

		const nodesLoop = (visibleNodesRef?.current && visibleNodesRef.current.length > 0 ? visibleNodesRef.current : nodesRef.current) ?? [];
		const links = linksRef.current;

		// Skip nodes without layout to avoid NaN in toScreen (no DOM read here).
		const hasPos = (n: GraphVizNode) => n.x != null && n.y != null;

		// Skip hub/community during streaming or drag; draw only when graph ready.
		const skipHeavyOverlay = skipHeavyOverlayFn();
		if (!skipHeavyOverlay && highlightHubs && hubNodeIdsRef?.current?.length) {
			const hubSet = new Set(hubNodeIdsRef.current);
			for (const n of nodesLoop) {
				if (!hubSet.has(n.id) || !hasPos(n)) continue;
				const p = toScreen(n.x, n.y);
				const r = Math.max(10, (n.r ?? 10) * 2.2);
				drawGlowDot(p.x, p.y, r, hubColor, 0.4);
			}
		}

		if (!skipHeavyOverlay && communityMode && communityMapRef?.current?.size && nodesLoop.length > 0) {
			if (frameCount % HULL_THROTTLE === 0) {
				const cm = communityMapRef.current;
				const byCommunity = new Map<number, { x: number; y: number }[]>();
				for (const n of nodesLoop) {
					if (!hasPos(n)) continue;
					const c = cm.get(n.id);
					if (c === undefined) continue;
					const p = toScreen(n.x, n.y);
					if (!byCommunity.has(c)) byCommunity.set(c, []);
					byCommunity.get(c)!.push(p);
				}
				const canvasArea = width * height;
				const maxHullArea = canvasArea * 0.25;
				const sorted = [...byCommunity.entries()]
					.filter(([, pts]) => pts.length >= 2)
					.sort((a, b) => b[1].length - a[1].length)
					.slice(0, maxCommunityHulls);
				cachedHulls = sorted.map(([, pts], i) => {
					const hull = convexHull(pts);
					return { color: HULL_COLORS[i % HULL_COLORS.length], points: hull };
				}).filter((h) => h.points.length >= 2 && polygonArea(h.points) <= maxHullArea);
			}
			for (const { color, points } of cachedHulls) {
				ctx.save();
				ctx.fillStyle = color;
				ctx.globalAlpha = 0.15;
				ctx.beginPath();
				ctx.moveTo(points[0].x, points[0].y);
				for (let j = 1; j < points.length; j++) ctx.lineTo(points[j].x, points[j].y);
				ctx.closePath();
				ctx.fill();
				ctx.globalAlpha = 0.55;
				ctx.strokeStyle = color;
				ctx.lineWidth = 2.5;
				ctx.stroke();
				ctx.restore();
			}
		} else {
			cachedHulls = [];
		}

		const pathRes = pathResultRef?.current;
		if (pathMode && pathRes && pathRes.pathNodeIds.length > 0 && nodesLoop.length > 0) {
			const pathNodeSet = new Set(pathRes.pathNodeIds);
			const pathLinkKeys = pathRes.pathLinkKeys;
			const orderedEdges = getOrderedPathEdges(pathRes.pathNodeIds, links, getLinkKey, pathLinkKeys, nodesLoop, normalizeNodeId);
			const segmentMs = 120;
			const pathT0 = pathResultT0Ref?.current || now;
			const elapsed = now - pathT0;
			const visibleSegments = Math.min(orderedEdges.length, Math.max(1, Math.floor(elapsed / segmentMs) + 1));
			for (let i = 0; i < visibleSegments && i < orderedEdges.length; i++) {
				const { aNode, bNode } = orderedEdges[i];
				if (!aNode || !bNode || !hasPos(aNode) || !hasPos(bNode)) continue;
				const a = toScreen(aNode.x, aNode.y);
				const b = toScreen(bNode.x, bNode.y);
				drawLineGlow(a.x, a.y, b.x, b.y, pathColor, 3, 0.5);
			}
			for (const n of nodesLoop) {
				if (!pathNodeSet.has(normalizeNodeId(n.id)) || !hasPos(n)) continue;
				const p = toScreen(n.x, n.y);
				const r = Math.max(10, (n.r ?? 10) * 1.5);
				drawGlowDot(p.x, p.y, r, pathColor, 0.35);
			}
		}

		if (effType === 'scan') {
				const bandY = ((t * 120) % (height + 120)) - 60;
				const grad = ctx.createLinearGradient(0, bandY - 40, 0, bandY + 40);
				grad.addColorStop(0, 'rgba(124,58,237,0)');
				grad.addColorStop(0.5, `rgba(124,58,237,${0.18 * intensity})`);
				grad.addColorStop(1, 'rgba(124,58,237,0)');
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, width, height);
			}

			if (effType === 'filter') {
				ctx.fillStyle = `rgba(17,24,39,${0.20 * intensity})`;
				ctx.fillRect(0, 0, width, height);

				const focus = new Set((effect?.focusNodeIds ?? []).map(String));
				if (focus.size === 0) {
					const filterKinds = getKindsForEffect('filter', effectKindMap);
					for (const l of links) {
						if (!filterKinds.includes(l.kind)) continue;
						focus.add(getLinkEndpointId(l.source));
						focus.add(getLinkEndpointId(l.target));
					}
				}

				for (const n of nodesLoop) {
					if (!focus.has(n.id)) continue;
					const p = toScreen(n.x, n.y);
					const pulse = 0.6 + 0.4 * Math.sin(t * 3);
					drawGlowDot(p.x, p.y, Math.max(6, n.r) * 0.9, '#60a5fa', 0.35 * intensity * pulse);
				}

				const bandX = ((t * 140) % (width + 140)) - 70;
				const gradX = ctx.createLinearGradient(bandX - 50, 0, bandX + 50, 0);
				gradX.addColorStop(0, 'rgba(96,165,250,0)');
				gradX.addColorStop(0.5, `rgba(96,165,250,${0.10 * intensity})`);
				gradX.addColorStop(1, 'rgba(96,165,250,0)');
				ctx.fillStyle = gradX;
				ctx.fillRect(0, 0, width, height);
			}

			if (effType === 'path') {
				const pathKinds = getKindsForEffect('path', effectKindMap);
				const pathEdges = links.filter((l) => pathKinds.includes(l.kind));
				let idx = 0;
				for (const l of pathEdges) {
					const aNode = typeof l.source === 'string' ? nodesLoop.find((n) => n.id === l.source) : l.source;
					const bNode = typeof l.target === 'string' ? nodesLoop.find((n) => n.id === l.target) : l.target;
					if (!aNode || !bNode) continue;
					const a = toScreen(aNode.x, aNode.y);
					const b = toScreen(bNode.x, bNode.y);
					drawLineGlow(a.x, a.y, b.x, b.y, '#22c55e', 2.0, 0.18 * intensity);

					const phase = (t * 0.9 + idx * 0.15) % 1;
					const x = a.x + (b.x - a.x) * phase;
					const y = a.y + (b.y - a.y) * phase;
					drawGlowDot(x, y, 3.0, '#22c55e', 0.75 * intensity);
					idx++;
				}
			}

			if (effType === 'semantic') {
				const semanticKinds = getKindsForEffect('semantic', effectKindMap);
				const pulse = 0.5 + 0.5 * Math.sin(t * 4);
				for (const l of links) {
					if (!semanticKinds.includes(l.kind)) continue;
					const aNode = typeof l.source === 'string' ? nodesLoop.find((n) => n.id === l.source) : l.source;
					const bNode = typeof l.target === 'string' ? nodesLoop.find((n) => n.id === l.target) : l.target;
					if (!aNode || !bNode) continue;
					const a = toScreen(aNode.x, aNode.y);
					const b = toScreen(bNode.x, bNode.y);
					drawLineGlow(a.x, a.y, b.x, b.y, '#60a5fa', 1.5, 0.12 * intensity * pulse);
					drawGlowDot(a.x, a.y, 2.5, '#60a5fa', 0.35 * intensity * pulse);
					drawGlowDot(b.x, b.y, 2.5, '#60a5fa', 0.35 * intensity * pulse);
				}
			}

			// MindFlow state animations: breathing/pulse for exploring/thinking, stable glow for verified
			if (mindflowAnimations) {
				const hasPos = (n: GraphVizNode) => typeof n.x === 'number' && typeof n.y === 'number';
				for (const n of nodesLoop) {
					if (!hasPos(n)) continue;
					const state = getMindflowState(n);
					if (!state) continue;

					const p = toScreen(n.x, n.y);
					const baseR = Math.max(8, (n.r ?? 8) * 1.2);
					const color = MINDFLOW_COLORS[state];

					if (state === 'exploring') {
						// Slow breathing pulse (like a heartbeat)
						const breath = 0.4 + 0.6 * Math.sin(t * 2.5);
						drawGlowDot(p.x, p.y, baseR, color, 0.35 * breath);
					} else if (state === 'thinking') {
						// Faster pulse with expanding ring effect
						const pulse = 0.5 + 0.5 * Math.sin(t * 4);
						const ringPhase = (t * 1.5) % 1;
						const ringR = baseR * (1 + ringPhase * 0.8);
						const ringAlpha = 0.3 * (1 - ringPhase);
						// Outer expanding ring
						ctx.save();
						ctx.globalAlpha = ringAlpha;
						ctx.strokeStyle = color;
						ctx.lineWidth = 2;
						ctx.beginPath();
						ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
						ctx.stroke();
						ctx.restore();
						// Inner glow
						drawGlowDot(p.x, p.y, baseR * 0.8, color, 0.4 * pulse);
					} else if (state === 'verified') {
						// Stable subtle glow (no animation, just a soft halo)
						drawGlowDot(p.x, p.y, baseR * 0.9, color, 0.25);
					}
					// pruned: no animation effect (just opacity handled by renderer)
				}
			}

			frameCount += 1;
			if (throttleStaticOverlay) {
				throttleTimer = setTimeout(() => {
					throttleTimer = null;
					if (alive) raf = requestAnimationFrame(loop);
				}, STATIC_FRAME_MS);
			} else {
				raf = requestAnimationFrame(loop);
			}
		};

		raf = requestAnimationFrame(loop);
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			if (throttleTimer != null) {
				clearTimeout(throttleTimer);
				throttleTimer = null;
			}
			const { width, height } = containerSizeRef.current;
			ctx.clearRect(0, 0, width, height);
		};
	}, [effect?.type, effect?.intensity, effect?.startedAtMs, resizeTick, effectKindMap, highlightHubs, hubColor, communityMode, maxCommunityHulls, pathMode, pathColor, pathResultVersion, mindflowAnimations]);

	return (
		<canvas
			ref={canvasRef as React.RefObject<HTMLCanvasElement>}
			className="pktw-absolute pktw-inset-0 pktw-z-[10] pktw-pointer-events-none"
			aria-hidden="true"
		/>
	);
};
