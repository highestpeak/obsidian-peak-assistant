import { useMemo } from 'react';
import type { LensType, LensGraphData, LensNode, LensEdge } from '../types';
import { computeTopologyLayout } from '../layouts/topology-layout';
import { computeTreeLayout } from '../layouts/tree-layout';
import { computeBridgeLayout } from '../layouts/bridge-layout';
import { computeTimelineLayout } from '../layouts/timeline-layout';

export function useLensLayout(graphData: LensGraphData | null, lens: LensType) {
	return useMemo(() => {
		if (!graphData || graphData.nodes.length === 0) {
			return { nodes: [] as LensNode[], edges: [] as LensEdge[] };
		}

		let positions: Map<string, { x: number; y: number }>;

		switch (lens) {
			case 'thinking-tree':
				positions = computeTreeLayout({
					nodes: graphData.nodes,
					edges: graphData.edges,
				}).positions;
				break;
			case 'bridge':
				positions = computeBridgeLayout({ nodes: graphData.nodes, edges: graphData.edges }).positions;
				break;
			case 'timeline':
				positions = computeTimelineLayout({ nodes: graphData.nodes }).positions;
				break;
			case 'topology':
			default:
				positions = computeTopologyLayout({
					nodes: graphData.nodes,
					edges: graphData.edges,
				}).positions;
				break;
		}

		const nodes: LensNode[] = graphData.nodes.map((n) => ({
			id: n.path,
			type: 'lensNode' as const,
			position: positions.get(n.path) ?? { x: 0, y: 0 },
			data: n,
		}));

		const edges: LensEdge[] = graphData.edges.map((e, i) => ({
			id: `e-${i}-${e.source}-${e.target}`,
			source: e.source,
			target: e.target,
			type: 'lensEdge',
			data: { kind: e.kind, weight: e.weight },
		}));

		return { nodes, edges };
	}, [graphData, lens]);
}
