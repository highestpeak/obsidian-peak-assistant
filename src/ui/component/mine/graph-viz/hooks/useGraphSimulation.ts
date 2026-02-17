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
	renderBackend?: 'canvas' | 'svg';
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
	renderBackend = 'svg',
	scheduleDrawRef,
}: UseGraphSimulationParams): void {
	const { svgRef, graphAreaRef, effectCanvasRef, mainCanvasRef } = domRefs;
	const useCanvas = renderBackend === 'canvas';
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

	// Mount: create SVG (if SVG mode) or use canvas, zoom, simulation, tick handler.
	useEffect(() => {
		const zoomTarget = useCanvas ? mainCanvasRef.current : svgRef.current;
		if (!zoomTarget || !graphAreaRef.current) return;

		const container = graphAreaRef.current;
		const width = container.clientWidth || 400;
		const height = container.clientHeight || 400;
		containerSizeRef.current = { width, height };

		if (!useCanvas) {
			const svg = d3Selection.select(svgRef.current!);
			svg.selectAll('*').remove();
			svg.attr('viewBox', `0 0 ${width} ${height}`);
			const g = svg.append('g');
			rootGRef.current = g as unknown as typeof rootGRef.current;
			linksLayerRef.current = g.append('g').attr('data-layer', 'links') as unknown as typeof linksLayerRef.current;
			nodesLayerRef.current = g.append('g').attr('data-layer', 'nodes') as unknown as typeof nodesLayerRef.current;
			labelsLayerRef.current = g.append('g').attr('data-layer', 'labels') as unknown as typeof labelsLayerRef.current;
		}

		const zoom = d3Zoom
			.zoom<SVGSVGElement | HTMLCanvasElement, unknown>()
			.scaleExtent([0.02, 100])
			.on('zoom', (event) => {
				if ((event as { sourceEvent?: unknown }).sourceEvent) {
					userInteractedRef.current = true;
				}
				zoomTransformRef.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
				setZoomLevel(event.transform.k);
				if (!useCanvas && rootGRef.current) {
					rootGRef.current.attr('transform', event.transform);
				}
				scheduleDrawRef?.current?.();
			});
		zoomRef.current = zoom;
		d3Selection.select(zoomTarget).call(zoom);

		const simulation = d3
			.forceSimulation<GraphVizNode, GraphVizLink>([] as GraphVizNode[])
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
			if (useCanvas) {
				scheduleDrawRef?.current?.();
				return;
			}
			if (throttleTickRef.current && tickCountRef.current % 2 !== 0) return;

			const now = performance.now();
			if (now - lastFrameStart >= 16) {
				lastFrameStart = now;
				ticksThisFrame = 0;
			}
			ticksThisFrame += 1;

			const linkSel = linkSelRef.current;
			const nodeSel = nodeSelRef.current;
			const labelSel = labelSelRef.current;
			if (linkSel) {
				linkSel
					.attr('x1', (d) => (d.source as GraphVizNode).x!)
					.attr('y1', (d) => (d.source as GraphVizNode).y!)
					.attr('x2', (d) => (d.target as GraphVizNode).x!)
					.attr('y2', (d) => (d.target as GraphVizNode).y!);
			}
			if (nodeSel) nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
			if (labelSel)
				labelSel.attr('x', (d) => d.x!).attr('y', (d) => d.y!).attr('dy', (d) => (d.r + 12) + 'px');
		});

		simulationRef.current = simulation;

		return () => {
			simulation.stop();
			simulationRef.current = null;
		};
	}, []);

	// Resize: update viewBox (SVG), canvas, zoom transform, center force (no sim restart).
	useEffect(() => {
		if (!graphAreaRef.current) return;
		const { width, height } = containerSizeRef.current;
		const w = width > 0 ? width : 400;
		const h = height > 0 ? height : 400;
		const zoomTarget = useCanvas ? mainCanvasRef.current : svgRef.current;
		if (!zoomTarget) return;
		if (!useCanvas && svgRef.current) {
			const svg = d3Selection.select(svgRef.current);
			svg.attr('viewBox', `0 0 ${w} ${h}`);
		}

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
	}, [resizeTick, useCanvas]);

	// Config sync: update forces and link/node styles when config changes (SVG only).
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

		const centerXStrength = (config.centerStrength * 9) / 25;
		const centerYStrength = (config.centerStrength * 12) / 25;

		if (useCanvas) {
			const linkForce = simulation.force('link') as d3.ForceLink<GraphVizNode, GraphVizLink>;
			const chargeForce = simulation.force('charge') as d3.ForceManyBody<GraphVizNode>;
			const forceX = simulation.force('x') as d3.ForceX<GraphVizNode>;
			const forceY = simulation.force('y') as d3.ForceY<GraphVizNode>;
			const collisionForce = simulation.force('collision') as d3.ForceCollide<GraphVizNode>;
			if (linkForce) {
				linkForce.distance((d: unknown) => linkDistance(d as GraphVizLink));
				linkForce.strength((d: unknown) => linkStrength(d as GraphVizLink));
			}
			if (chargeForce) {
				chargeForce.strength(config.chargeStrength);
				chargeForce.distanceMax(280);
			}
			if (forceX) forceX.strength(centerXStrength);
			if (forceY) forceY.strength(centerYStrength);
			if (collisionForce) collisionForce.radius((d: GraphVizNode) => (d.r ?? 10) + config.collisionRadius);
			// Restart so force changes (sliders) take effect immediately
			simulation.alpha(0.1).restart();
			return;
		}

		const linkForce = simulation.force('link') as d3.ForceLink<GraphVizNode, GraphVizLink>;
		const chargeForce = simulation.force('charge') as d3.ForceManyBody<GraphVizNode>;
		const forceX = simulation.force('x') as d3.ForceX<GraphVizNode>;
		const forceY = simulation.force('y') as d3.ForceY<GraphVizNode>;
		const collisionForce = simulation.force('collision') as d3.ForceCollide<GraphVizNode>;

		if (linkForce) {
			linkForce.distance((d: unknown) => linkDistance(d as GraphVizLink));
			linkForce.strength((d: unknown) => linkStrength(d as GraphVizLink));
		}
		if (chargeForce) {
			chargeForce.strength(config.chargeStrength);
			chargeForce.distanceMax(280);
		}
		if (forceX) forceX.strength(centerXStrength);
		if (forceY) forceY.strength(centerYStrength);
		if (collisionForce) collisionForce.radius((d: GraphVizNode) => (d.r ?? 10) + config.collisionRadius);
		simulation.alpha(0.1).restart();

		const linkSel = linkSelRef.current;
		const nodeSel = nodeSelRef.current;
		const semanticDash =
			config.semanticEdgeStyle === 'dashed' ? '4 3' : config.semanticEdgeStyle === 'dotted' ? '2 2' : null;
		const physicalDash =
			config.physicalEdgeStyle === 'dashed' ? '4 3' : config.physicalEdgeStyle === 'dotted' ? '2 2' : null;
		if (linkSel) {
			linkSel.attr(
				'stroke',
				(d: GraphVizLink) =>
					d.kind === 'semantic'
						? config.semanticLinkStroke
						: d.kind === 'path' || d.kind === 'physical'
							? config.physicalLinkStroke
							: (getEdgeStyle({ kind: d.kind, weight: d.weight }).stroke ?? '#d1d5db')
			);
			linkSel.attr(
				'stroke-opacity',
				(d: GraphVizLink) =>
					d.kind === 'semantic'
						? config.semanticEdgeOpacity
						: d.kind === 'physical' || d.kind === 'path'
							? config.physicalEdgeOpacity
							: (getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeOpacity ?? 0.4)
			);
			linkSel.attr(
				'stroke-dasharray',
				(d: GraphVizLink) => (d.kind === 'semantic' ? semanticDash : physicalDash)
			);
			linkSel.attr(
				'stroke-width',
				(d: GraphVizLink) =>
					d.kind === 'semantic'
						? (getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeWidth ?? 1) * config.semanticEdgeWidthScale
						: d.kind === 'physical' || d.kind === 'path'
							? (getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeWidth ?? 1) * config.physicalEdgeWidthScale
							: (getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeWidth ?? 1)
			);
		}
		if (nodeSel) {
			const resolved = graphDataRefs.linksRef.current;
			const nodeIdsWithSemantic = new Set<string>();
			for (const l of resolved) {
				if (l.kind === 'semantic') {
					nodeIdsWithSemantic.add((l.source as GraphVizNode).id);
					nodeIdsWithSemantic.add((l.target as GraphVizNode).id);
				}
			}
			const getFill = (d: GraphVizNode) =>
				(d.type ?? '').toLowerCase() === 'tag'
					? config.tagNodeFill
					: nodeIdsWithSemantic.has(d.id)
						? config.semanticNodeFill
						: config.physicalNodeFill;
			nodeSel.select('.node-shape-circle').attr('fill', getFill);
			nodeSel.select('.node-shape-path').attr('fill', getFill);
			nodeSel.select('g.lucide-icon path').attr('fill', getFill).attr('stroke', getFill);
			nodeSel.select('g.lucide-icon circle').attr('fill', getFill);
		}
	}, [config, getEdgeStyle, effectsRefs]);
}
