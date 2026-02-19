/**
 * D3 simulation + zoom setup and resize/canvas sync.
 * Runs mount effect (create SVG layers, zoom, simulation, tick) and resize effect (viewBox, canvas, center force).
 */

import { useEffect } from 'react';
import * as d3 from 'd3-force';
import * as d3Selection from 'd3-selection';
import * as d3Zoom from 'd3-zoom';
import type { GraphVizNode, GraphVizLink } from '../types';
import type { GraphConfig } from '../config';
import type { DomRefs, SimulationZoomRefs, LayerRefs, StreamingRefs, GraphDataRefs, EffectsRefs } from './useGraphEngine';
import { getLinkEndpointId } from '../utils/link-key';
import { computeConnectedComponents } from '../utils/mst';

export type UseGraphSimulationParams = {
	domRefs: DomRefs;
	simulationZoomRefs: SimulationZoomRefs;
	layerRefs: LayerRefs;
	streamingRefs: StreamingRefs;
	graphDataRefs: GraphDataRefs;
	effectsRefs?: EffectsRefs;
	containerSizeRef: React.MutableRefObject<{ width: number; height: number }>;
	resizeTick: number;
	config: GraphConfig;
	setZoomLevel: (k: number) => void;
	getEdgeStyle: (edge: { kind: string; weight: number }) => { stroke?: string; strokeOpacity?: number; strokeDasharray?: string | null; strokeWidth?: number };
	scheduleDrawRef?: React.MutableRefObject<(() => void) | null>;
};

export function useGraphSimulation({
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
}: UseGraphSimulationParams): void {
	const { graphAreaRef, effectCanvasRef, mainCanvasRef } = domRefs;
	const { simulationRef, zoomRef, zoomTransformRef, userInteractedRef } = simulationZoomRefs;
	const { rootGRef, linksLayerRef, nodesLayerRef, labelsLayerRef, linkSelRef, nodeSelRef, labelSelRef } = layerRefs;
	const { throttleTickRef, tickCountRef } = streamingRefs;
	const { linksRef } = graphDataRefs;

	/**
	 * D3 link distance uses edge.weight, but in this codebase weight is NOT normalized:
	 * - physical edges: stored as accumulated counts (can be >> 1)
	 * - semantic edges: often derived from "85.2%" strings => 85.2
	 *
	 * If we use raw weight directly, the distance formula can explode and push nodes far away.
	 * We normalize to a stable [0, 1] "strength" and clamp the final distance.
	 */
	const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
	const toFinite = (v: unknown, fallback: number): number => {
		const n = typeof v === 'number' ? v : Number(v);
		return Number.isFinite(n) ? n : fallback;
	};
	const edgeStrength = (edgeKind: unknown, rawWeight: unknown): number => {
		const kind = String(edgeKind ?? '');
		const w = toFinite(rawWeight, 1);
		if (kind === 'semantic') {
			// semantic similarity: usually 0..1 or 0..100 (percent number)
			if (w <= 1) return clamp01(w);
			if (w <= 100) return clamp01(w / 100);
			// If somehow larger, compress aggressively.
			return clamp01(Math.log1p(w) / Math.log1p(100));
		}
		// physical (and other) edges: accumulated counts; compress with log scale.
		// w=1 -> ~0.30, w=10 -> 1.0, w=100 -> 1.0
		return clamp01(Math.log1p(Math.max(0, w)) / Math.log1p(10));
	};
	const linkDistance = (d: { kind?: string; weight?: number; isMSTEdge?: boolean }): number => {
		const strength = edgeStrength(d.kind, d.weight);
		const base = config.linkDistance * (1.25 - 0.75 * strength);
		const scale = d.isMSTEdge ? (config.mstLinkDistanceScale ?? 0.7) : (config.nonMstLinkDistanceScale ?? 1.25);
		const dist = base * scale;
		return Math.max(30, Math.min(180, dist));
	};
	const linkStrength = (d: { isMSTEdge?: boolean }): number => {
		const scale = d.isMSTEdge ? (config.mstLinkStrengthScale ?? 1.5) : (config.nonMstLinkStrengthScale ?? 0.3);
		return config.linkStrength * scale;
	};

	// Mount: zoom on canvas, simulation, tick handler (canvas redraw on tick).
	useEffect(() => {
		const zoomTarget = mainCanvasRef.current;
		if (!zoomTarget || !graphAreaRef.current) return;

		const container = graphAreaRef.current;
		const width = container.clientWidth || 400;
		const height = container.clientHeight || 400;
		containerSizeRef.current = { width, height };

		const zoom = d3Zoom
			.zoom<HTMLCanvasElement, unknown>()
			.scaleExtent([0.02, 100])
			.on('zoom', (event) => {
				if ((event as { sourceEvent?: unknown }).sourceEvent) {
					userInteractedRef.current = true;
				}
				zoomTransformRef.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
				setZoomLevel(event.transform.k);
				scheduleDrawRef?.current?.();
			});
		zoomRef.current = zoom as unknown as typeof zoomRef.current;
		d3Selection.select(zoomTarget).call(zoom);

		// Gate runs first each tick: when graph has 2+ connected components, disable charge so
		// subgraphs stay cohesive (link-only); componentRepulsion then pushes components apart.
		const simulation = d3
			.forceSimulation<GraphVizNode, GraphVizLink>([] as GraphVizNode[])
			.force('componentChargeGate', () => {})
			.force(
				'link',
				d3
					.forceLink<GraphVizNode, GraphVizLink>([] as GraphVizLink[])
					.id((d) => d.id)
					.distance((d: unknown) => linkDistance(d as GraphVizLink))
					.strength((d: unknown) => linkStrength(d as GraphVizLink))
			)
			.force(
				'charge',
				d3
					.forceManyBody<GraphVizNode>()
					.strength(config.chargeStrength)
					.distanceMax(280)
			)
			.force(
				'x',
				(() => {
					const f = d3.forceX(width / 2);
					f.strength((config.centerStrength * 9) / 25);
					return f;
				})()
			)
			.force(
				'y',
				(() => {
					const f = d3.forceY(height / 2);
					f.strength((config.centerStrength * 12) / 25);
					return f;
				})()
			)
			.force('collision', d3.forceCollide<GraphVizNode>().radius((d) => (d.r ?? 10) + config.collisionRadius));
		// Lower decay = more friction; graph settles faster and is less twitchy on hover/drag
		simulation.velocityDecay(0.6);

		// Tracks ticks per ~16ms window to confirm "many ticks per frame" hypothesis
		let lastFrameStart = performance.now();
		let ticksThisFrame = 0;

		simulation.on('tick', () => {
			tickCountRef.current += 1;
			scheduleDrawRef?.current?.();
		});

		simulationRef.current = simulation;

		return () => {
			simulation.stop();
			simulationRef.current = null;
		};
	}, []);

	// Resize: canvas size, zoom transform, center force (no sim restart).
	useEffect(() => {
		if (!graphAreaRef.current) return;
		const { width, height } = containerSizeRef.current;
		const w = width > 0 ? width : 400;
		const h = height > 0 ? height : 400;
		const zoomTarget = mainCanvasRef.current;
		if (!zoomTarget) return;

		if (zoomRef.current) {
			const t = zoomTransformRef.current;
			const transform = d3Zoom.zoomIdentity.translate(t.x, t.y).scale(t.k);
			d3Selection.select(zoomTarget).call(zoomRef.current.transform, transform);
		}

		const dpr = window.devicePixelRatio || 1;
		const mainCanvas = mainCanvasRef.current;
		if (mainCanvas) {
			mainCanvas.width = Math.max(1, Math.floor(w * dpr));
			mainCanvas.height = Math.max(1, Math.floor(h * dpr));
			mainCanvas.style.width = `${w}px`;
			mainCanvas.style.height = `${h}px`;
		}
		const canvas = effectCanvasRef.current;
		if (canvas) {
			canvas.width = Math.max(1, Math.floor(w * dpr));
			canvas.height = Math.max(1, Math.floor(h * dpr));
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
			const ctx = canvas.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		const sim = simulationRef.current;
		if (sim) {
			(sim.force('x') as d3.ForceX<GraphVizNode>)?.x(w / 2);
			(sim.force('y') as d3.ForceY<GraphVizNode>)?.y(h / 2);
		}
	}, [resizeTick]);

	// Config sync: update forces when config changes.
	useEffect(() => {
		const simulation = simulationRef.current;
		if (!simulation) return;

		// Cluster force: pull nodes toward community centroid; hull-aware repulsion to reduce overlap
		if (config.clusterLayout && effectsRefs) {
			const communityMapRef = effectsRefs.communityMapRef;
			const repulsion = Math.max(0, config.clusterRepulsionStrength ?? 0);
			simulation.force('cluster', (alpha: number) => {
				const nodes = simulation.nodes() as GraphVizNode[];
				const communityMap = communityMapRef.current;
				if (communityMap.size === 0) return;
				const centerByCommunity = new Map<number, { x: number; y: number; n: number }>();
				for (const n of nodes) {
					const c = communityMap.get(n.id);
					if (c === undefined) continue;
					const curr = centerByCommunity.get(c) ?? { x: 0, y: 0, n: 0 };
					curr.x += n.x ?? 0;
					curr.y += n.y ?? 0;
					curr.n += 1;
					centerByCommunity.set(c, curr);
				}
				for (const [c, data] of centerByCommunity) {
					if (data.n === 0) continue;
					const cx = data.x / data.n;
					const cy = data.y / data.n;
					centerByCommunity.set(c, { x: cx, y: cy, n: data.n });
				}
				// Per-community radius (max distance from centroid to node) for hull-aware repulsion
				const radiusByCommunity = new Map<number, number>();
				for (const n of nodes) {
					const c = communityMap.get(n.id);
					if (c === undefined) continue;
					const center = centerByCommunity.get(c);
					if (!center) continue;
					const nx = n.x ?? 0;
					const ny = n.y ?? 0;
					const r = n.r ?? 10;
					const d = Math.sqrt((nx - center.x) ** 2 + (ny - center.y) ** 2) + r;
					const curr = radiusByCommunity.get(c) ?? 0;
					if (d > curr) radiusByCommunity.set(c, d);
				}
				const strength = alpha * (config.clusterForceStrength ?? 0.02);
				const hullPadding = 25;
				for (const n of nodes) {
					const c = communityMap.get(n.id);
					if (c === undefined) continue;
					const center = centerByCommunity.get(c);
					if (!center) continue;
					const x = n.x ?? 0;
					const y = n.y ?? 0;
					const myR = n.r ?? 10;
					n.vx = (n.vx ?? 0) + (center.x - x) * strength;
					n.vy = (n.vy ?? 0) + (center.y - y) * strength;
					if (repulsion <= 0) continue;
					for (const [otherId, otherCenter] of centerByCommunity) {
						if (otherId === c) continue;
						const dx = x - otherCenter.x;
						const dy = y - otherCenter.y;
						const dist = Math.sqrt(dx * dx + dy * dy + 1e-6);
						const otherR = radiusByCommunity.get(otherId) ?? 50;
						const minDist = otherR + myR + hullPadding;
						let f = (alpha * repulsion) / dist;
						if (dist < minDist) f *= 1 + (minDist - dist) / minDist;
						n.vx = (n.vx ?? 0) + (dx / dist) * f;
						n.vy = (n.vy ?? 0) + (dy / dist) * f;
					}
				}
			});
		} else {
			simulation.force('cluster', null);
		}

		// Component repulsion: when graph has multiple connected components, push them apart.
		// Use componentRepulsionStrength; when 0 we still register the gate so charge is disabled for multi-component.
		const chargeForce = simulation.force('charge') as d3.ForceManyBody<GraphVizNode>;
		const componentRepulsionStrength = Math.max(0, config.componentRepulsionStrength ?? 0.35);

		if (effectsRefs) {
			const componentMapRef = effectsRefs.componentMapRef;
			// Gate: run first each tick. Backfill component map from current simulation when ref is empty
			// so it works in every scenario (Graph Debug, AI Search graph, streaming, etc.).
			// Disable charge when 2+ components so subgraphs stay cohesive (link-only).
			simulation.force('componentChargeGate', () => {
				const nodes = simulation.nodes() as GraphVizNode[];
				let compMap = componentMapRef.current;
				if ((!compMap || compMap.size === 0) && nodes.length > 0) {
					const linkForce = simulation.force('link') as d3.ForceLink<GraphVizNode, GraphVizLink> | undefined;
					const links = (linkForce?.links?.() ?? []) as GraphVizLink[];
					compMap = computeConnectedComponents(
						nodes.map((n) => n.id),
						links,
						getLinkEndpointId
					);
					componentMapRef.current = compMap;
				}
				if (!compMap || compMap.size === 0) {
					chargeForce.strength(config.chargeStrength);
					return;
				}
				const numComponents = new Set(compMap.values()).size;
				if (numComponents >= 2) {
					chargeForce.strength(0);
				} else {
					chargeForce.strength(config.chargeStrength);
				}
			});

			if (componentRepulsionStrength > 0) {
				const repulsion = componentRepulsionStrength;
				/** Min gap between component bounding boxes so subgraphs do not intersect. */
				const componentGap = 100;
				/** When AABBs overlap, push strength (not scaled by alpha) so overlap is removed. */
				const overlapPushStrength = 0.8;
				simulation.force('componentRepulsion', (alpha: number) => {
					const nodes = simulation.nodes() as GraphVizNode[];
					const compMap = componentMapRef.current;
					const numComponents = compMap ? new Set(compMap.values()).size : 0;
					if (numComponents < 2) return;
					// Per-component AABB (with node radius) and center
					const boxByComp = new Map<
						number,
						{ minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number; n: number }
					>();
					for (const n of nodes) {
						const c = compMap.get(n.id);
						if (c === undefined) continue;
						const x = n.x ?? 0;
						const y = n.y ?? 0;
						const r = n.r ?? 10;
						const curr = boxByComp.get(c) ?? {
							minX: Infinity,
							maxX: -Infinity,
							minY: Infinity,
							maxY: -Infinity,
							cx: 0,
							cy: 0,
							n: 0,
						};
						curr.minX = Math.min(curr.minX, x - r);
						curr.maxX = Math.max(curr.maxX, x + r);
						curr.minY = Math.min(curr.minY, y - r);
						curr.maxY = Math.max(curr.maxY, y + r);
						curr.cx += x;
						curr.cy += y;
						curr.n += 1;
						boxByComp.set(c, curr);
					}
					const compIds = Array.from(boxByComp.keys());
					for (const c of compIds) {
						const b = boxByComp.get(c)!;
						if (b.n === 0) continue;
						b.cx /= b.n;
						b.cy /= b.n;
					}
					// Expand boxes by half gap so we require gap between them
					const half = componentGap / 2;
					for (let i = 0; i < compIds.length; i++) {
						for (let j = i + 1; j < compIds.length; j++) {
							const ci = compIds[i];
							const cj = compIds[j];
							const bi = boxByComp.get(ci)!;
							const bj = boxByComp.get(cj)!;
							const leftI = bi.minX - half;
							const rightI = bi.maxX + half;
							const topI = bi.minY - half;
							const bottomI = bi.maxY + half;
							const leftJ = bj.minX - half;
							const rightJ = bj.maxX + half;
							const topJ = bj.minY - half;
							const bottomJ = bj.maxY + half;
							const overlapX = Math.min(rightI, rightJ) - Math.max(leftI, leftJ);
							const overlapY = Math.min(bottomI, bottomJ) - Math.max(topI, topJ);
							const overlap = overlapX > 0 && overlapY > 0 ? Math.min(overlapX, overlapY) : 0;
							const dx = bi.cx - bj.cx;
							const dy = bi.cy - bj.cy;
							const dist = Math.sqrt(dx * dx + dy * dy + 1e-6);
							const dirX = dx / dist;
							const dirY = dy / dist;
							// When overlapping: strong constant push to separate; else inverse-distance repulsion (scaled so it is effective).
							const push = overlap > 0
								? overlap * overlapPushStrength
								: (alpha * repulsion * 200) / Math.max(dist, 40);
							for (const n of nodes) {
								const c = compMap.get(n.id);
								if (c === undefined) continue;
								if (c === ci) {
									n.vx = (n.vx ?? 0) + dirX * push;
									n.vy = (n.vy ?? 0) + dirY * push;
								} else if (c === cj) {
									n.vx = (n.vx ?? 0) - dirX * push;
									n.vy = (n.vy ?? 0) - dirY * push;
								}
							}
						}
					}
				});
			} else {
				simulation.force('componentRepulsion', null);
			}
		} else {
			simulation.force('componentChargeGate', () => {});
			simulation.force('componentRepulsion', null);
		}

		const centerXStrength = (config.centerStrength * 9) / 25;
		const centerYStrength = (config.centerStrength * 12) / 25;

		const linkForce = simulation.force('link') as d3.ForceLink<GraphVizNode, GraphVizLink>;
		const forceX = simulation.force('x') as d3.ForceX<GraphVizNode>;
		const forceY = simulation.force('y') as d3.ForceY<GraphVizNode>;
		const collisionForce = simulation.force('collision') as d3.ForceCollide<GraphVizNode>;
		if (linkForce) {
			linkForce.distance((d: unknown) => linkDistance(d as GraphVizLink));
			linkForce.strength((d: unknown) => linkStrength(d as GraphVizLink));
		}
		if (chargeForce) {
			chargeForce.distanceMax(280);
			// Strength is set each tick by componentChargeGate when effectsRefs present
			if (!effectsRefs) chargeForce.strength(config.chargeStrength);
		}
		if (forceX) forceX.strength(centerXStrength);
		if (forceY) forceY.strength(centerYStrength);
		if (collisionForce) collisionForce.radius((d: GraphVizNode) => (d.r ?? 10) + config.collisionRadius);
		simulation.alpha(0.1).restart();
	}, [config, effectsRefs]);
}
