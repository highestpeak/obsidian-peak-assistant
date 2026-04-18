import dagre from '@dagrejs/dagre';
import type { LensNodeData, LensEdgeData } from '../types';
import { estimateNodeWidth } from './topology-layout';

interface LayoutInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: LensEdgeData['kind'] }>;
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

export function computeTreeLayout(input: LayoutInput): LayoutResult {
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'TB', nodesep: 120, ranksep: 180 });

	for (const n of input.nodes) {
		g.setNode(n.path, { width: estimateNodeWidth(n.label), height: 60 });
	}

	const treeEdges = input.edges.filter((e) => e.kind === 'derives');
	for (const e of treeEdges) {
		g.setEdge(e.source, e.target);
	}

	if (treeEdges.length === 0) {
		for (const e of input.edges) {
			g.setEdge(e.source, e.target);
		}
	}

	dagre.layout(g);

	const positions = new Map<string, { x: number; y: number }>();
	for (const n of input.nodes) {
		const pos = g.node(n.path);
		if (pos) positions.set(n.path, { x: pos.x, y: pos.y });
	}
	return { positions };
}
