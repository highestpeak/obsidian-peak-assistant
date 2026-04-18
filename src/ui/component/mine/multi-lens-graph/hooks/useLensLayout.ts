import { useMemo } from 'react';
import type { LensType, LensGraphData, LensNode, LensEdge, LensEdgeData } from '../types';
import { computeTopologyLayout } from '../layouts/topology-layout';
import { computeTreeLayout } from '../layouts/tree-layout';
import { computeBridgeLayout } from '../layouts/bridge-layout';
import { computeTimelineLayout } from '../layouts/timeline-layout';

type RawEdge = LensGraphData['edges'][number];

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

		const edges: LensEdge[] = filteredEdges.map((e, i) => {
			const srcPos = layoutResult.positions.get(e.source);
			const tgtPos = layoutResult.positions.get(e.target);
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

		// Add timeline axis node
		if (lens === 'timeline' && 'timeTicks' in layoutResult && Array.isArray(layoutResult.timeTicks) && (layoutResult.timeTicks as any[]).length > 0) {
			const ticks = layoutResult.timeTicks as Array<{ x: number; label: string; timestamp: number }>;
			const axisY = (layoutResult as any).axisY as number;
			const minX = Math.min(...ticks.map(t => t.x));
			const maxX = Math.max(...ticks.map(t => t.x));
			const width = maxX - minX + 60; // padding
			const relativeTicks = ticks.map(t => ({ x: t.x - minX, label: t.label }));
			nodes.push({
				id: 'timeline-axis',
				type: 'timelineAxis' as any,
				position: { x: minX, y: axisY },
				data: { ticks: relativeTicks, width } as any,
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
