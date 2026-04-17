import dagre from '@dagrejs/dagre';
import type { LensNodeData, LensEdgeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: LensEdgeData['kind']; weight?: number }>;
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

export function computeTopologyLayout(input: LayoutInput): LayoutResult {
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 120, marginx: 20, marginy: 20 });

	for (const n of input.nodes) {
		g.setNode(n.path, { width: 200, height: 50 });
	}

	for (const e of input.edges) {
		g.setEdge(e.source, e.target);
	}

	dagre.layout(g);

	const positions = new Map<string, { x: number; y: number }>();
	for (const n of input.nodes) {
		const pos = g.node(n.path);
		if (pos) positions.set(n.path, { x: pos.x, y: pos.y });
	}
	return { positions };
}
