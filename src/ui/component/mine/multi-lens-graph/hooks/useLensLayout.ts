import { useMemo } from 'react';
import type { LensType, LensGraphData, LensNode, LensEdge, LensEdgeData } from '../types';
import { computeTopologyLayout, estimateNodeWidth } from '../layouts/topology-layout';
import { computeTreeLayout } from '../layouts/tree-layout';
import { computeBridgeLayout } from '../layouts/bridge-layout';
import { computeTimelineLayout } from '../layouts/timeline-layout';

type RawEdge = LensGraphData['edges'][number];

const DEFAULT_NODE_HEIGHT = 60;
const OVERLAP_PAD_X = 20;
const OVERLAP_PAD_Y = 15;
const MAX_ITERATIONS = 50;

/**
 * Post-layout pass: detect and resolve overlapping nodes by iteratively pushing them apart.
 * Only moves `lensNode` type nodes; swimlanes / axis nodes are left untouched.
 */
function resolveOverlaps(nodes: LensNode[]): void {
	const movable = nodes.filter((n) => n.type === 'lensNode');
	if (movable.length <= 1) return;

	// Pre-compute bounding box widths per node
	const widths = new Map<string, number>();
	for (const n of movable) {
		widths.set(n.id, estimateNodeWidth(n.data.label));
	}

	for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
		let hadOverlap = false;
		for (let i = 0; i < movable.length; i++) {
			for (let j = i + 1; j < movable.length; j++) {
				const a = movable[i];
				const b = movable[j];
				const aw = widths.get(a.id)! + OVERLAP_PAD_X;
				const bw = widths.get(b.id)! + OVERLAP_PAD_X;
				const ah = DEFAULT_NODE_HEIGHT + OVERLAP_PAD_Y;
				const bh = DEFAULT_NODE_HEIGHT + OVERLAP_PAD_Y;

				const dx = b.position.x - a.position.x;
				const dy = b.position.y - a.position.y;
				const overlapX = (aw + bw) / 2 - Math.abs(dx);
				const overlapY = (ah + bh) / 2 - Math.abs(dy);

				if (overlapX > 0 && overlapY > 0) {
					hadOverlap = true;
					// Push apart along the axis with less overlap (minimum displacement)
					if (overlapX < overlapY) {
						const push = (overlapX / 2) + 5;
						const signX = dx >= 0 ? 1 : -1;
						a.position = { ...a.position, x: a.position.x - push * signX };
						b.position = { ...b.position, x: b.position.x + push * signX };
					} else {
						const push = (overlapY / 2) + 5;
						const signY = dy >= 0 ? 1 : -1;
						a.position = { ...a.position, y: a.position.y - push * signY };
						b.position = { ...b.position, y: b.position.y + push * signY };
					}
				}
			}
		}
		if (!hadOverlap) break;
	}
}

/** Compute best handle direction based on relative position of source and target nodes. */
function computeHandlePair(
	srcPos: { x: number; y: number },
	tgtPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
	const dx = tgtPos.x - srcPos.x;
	const dy = tgtPos.y - srcPos.y;
	// Primarily horizontal → Left/Right; primarily vertical → Top/Bottom
	if (Math.abs(dx) >= Math.abs(dy)) {
		return dx >= 0
			? { sourceHandle: 'source-right', targetHandle: 'target-left' }
			: { sourceHandle: 'source-left', targetHandle: 'target-right' };
	}
	return dy >= 0
		? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
		: { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
}

/** Filter and cap topology edges: keep weight >= 0.4, cap at 1.5x node count, highest weight first */
function filterTopologyEdges(edges: RawEdge[], nodeCount: number): RawEdge[] {
	const sorted = [...edges].sort((a, b) => (b.weight ?? 0.5) - (a.weight ?? 0.5));
	const aboveThreshold = sorted.filter((e) => (e.weight ?? 0.5) >= 0.4);
	const cap = Math.ceil(1.5 * nodeCount);
	return aboveThreshold.slice(0, cap);
}

export function useLensLayout(graphData: LensGraphData | null, lens: LensType) {
	return useMemo(() => {
		if (!graphData || graphData.nodes.length === 0) {
			return { nodes: [] as LensNode[], edges: [] as LensEdge[] };
		}

		let layoutResult: { positions: Map<string, { x: number; y: number }>; [key: string]: unknown };
		let filteredEdges: RawEdge[];

		switch (lens) {
			case 'thinking-tree':
				filteredEdges = graphData.edges;
				layoutResult = computeTreeLayout({
					nodes: graphData.nodes,
					edges: filteredEdges,
				});
				break;
			case 'bridge':
				filteredEdges = graphData.edges.filter((e) => e.kind === 'cross-domain');
				layoutResult = computeBridgeLayout({
					nodes: graphData.nodes,
					edges: filteredEdges,
					clusters: graphData.clusters,
					bridges: graphData.bridges,
				});
				break;
			case 'timeline':
				filteredEdges = graphData.edges.filter((e) => e.kind === 'temporal');
				layoutResult = computeTimelineLayout({
					nodes: graphData.nodes,
					evolutionChains: graphData.evolutionChains,
				});
				break;
			case 'topology':
			default:
				filteredEdges = filterTopologyEdges(graphData.edges, graphData.nodes.length);
				layoutResult = computeTopologyLayout({
					nodes: graphData.nodes,
					edges: filteredEdges,
				});
				break;
		}

		const nodes: LensNode[] = graphData.nodes.map((n) => ({
			id: n.path,
			type: 'lensNode' as const,
			position: layoutResult.positions.get(n.path) ?? { x: 0, y: 0 },
			data: n,
		}));

		// Post-layout: resolve any overlapping nodes
		resolveOverlaps(nodes);

		// Build resolved position map for edge handle computation
		const resolvedPositions = new Map<string, { x: number; y: number }>();
		for (const n of nodes) resolvedPositions.set(n.id, n.position);

		const edges: LensEdge[] = filteredEdges.map((e, i) => {
			const srcPos = resolvedPositions.get(e.source);
			const tgtPos = resolvedPositions.get(e.target);
			const handles = srcPos && tgtPos ? computeHandlePair(srcPos, tgtPos) : { sourceHandle: 'source-right', targetHandle: 'target-left' };
			const dense = filteredEdges.length > graphData.nodes.length * 1.2;
			return {
				id: `e-${i}-${e.source}-${e.target}`,
				source: e.source,
				target: e.target,
				sourceHandle: handles.sourceHandle,
				targetHandle: handles.targetHandle,
				type: 'lensEdge',
				data: { kind: e.kind, weight: e.weight, dense },
			};
		});

		// Add swimlane background nodes for bridge layout
		if (lens === 'bridge' && 'swimlanes' in layoutResult && Array.isArray(layoutResult.swimlanes)) {
			for (const sl of layoutResult.swimlanes as Array<{ id: string; name: string; x: number; y: number; width: number; height: number }>) {
				nodes.push({
					id: `swimlane-${sl.id}`,
					type: 'swimlane' as any,
					position: { x: sl.x, y: sl.y },
					data: { label: sl.name, width: sl.width, height: sl.height } as any,
					style: { zIndex: -1 },
					zIndex: -1,
					selectable: false,
					draggable: false,
				} as any);
			}
		}

		// Add vertical timeline axis node
		if (lens === 'timeline' && 'timeTicks' in layoutResult && Array.isArray(layoutResult.timeTicks) && (layoutResult.timeTicks as any[]).length > 0) {
			const ticks = layoutResult.timeTicks as Array<{ y: number; label: string; timestamp: number }>;
			const axisX = (layoutResult as any).axisX as number;
			const minY = Math.min(...ticks.map(t => t.y));
			const maxY = Math.max(...ticks.map(t => t.y));
			const height = maxY - minY + 40;
			const relativeTicks = ticks.map(t => ({ y: t.y - minY, label: t.label }));
			nodes.push({
				id: 'timeline-axis',
				type: 'timelineAxis' as any,
				position: { x: axisX, y: minY },
				data: { ticks: relativeTicks, height } as any,
				style: { zIndex: -1 },
				zIndex: -1,
				selectable: false,
				draggable: false,
			} as any);
		}

		// Merge extra edges generated by layout algorithms
		const extraEdges: LensEdge[] = [];
		if (lens === 'bridge' && 'bridgeEdges' in layoutResult && Array.isArray(layoutResult.bridgeEdges)) {
			for (const e of layoutResult.bridgeEdges as Array<{ source: string; target: string; kind: string; label?: string }>) {
				extraEdges.push({
					id: `bridge-${e.source}-${e.target}`,
					source: e.source,
					target: e.target,
					type: 'lensEdge',
					data: { kind: e.kind as LensEdgeData['kind'], edgeLabel: e.label },
				});
			}
		}
		if (lens === 'timeline' && 'chainEdges' in layoutResult && Array.isArray(layoutResult.chainEdges)) {
			for (const e of layoutResult.chainEdges as Array<{ source: string; target: string; kind: string; chainIndex: number }>) {
				extraEdges.push({
					id: `chain-${e.chainIndex}-${e.source}-${e.target}`,
					source: e.source,
					target: e.target,
					type: 'lensEdge',
					data: { kind: e.kind as LensEdgeData['kind'] },
				});
			}
		}

		return { nodes, edges: [...edges, ...extraEdges] };
	}, [graphData, lens]);
}
