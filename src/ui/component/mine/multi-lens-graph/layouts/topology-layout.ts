import dagre from '@dagrejs/dagre';
import type { LensNodeData } from '../types';

interface TopologyInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: string; weight?: number }>;
}

// Estimate node width for collision radius (includes padding)
export function estimateNodeWidth(label: string): number {
	let w = 0;
	for (const ch of label) {
		w += ch.charCodeAt(0) > 127 ? 14 : 8;
	}
	return Math.min(Math.max(w + 40, 100), 300); // +40 for px-4 padding on both sides
}

export function computeTopologyLayout(input: TopologyInput): { positions: Map<string, { x: number; y: number }> } {
	const { nodes, edges } = input;
	if (nodes.length === 0) return { positions: new Map() };

	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 200 });

	const nodeSet = new Set(nodes.map(n => n.path));

	for (const n of nodes) {
		g.setNode(n.path, { width: estimateNodeWidth(n.label), height: 60 });
	}

	for (const e of edges) {
		if (nodeSet.has(e.source) && nodeSet.has(e.target)) {
			g.setEdge(e.source, e.target);
		}
	}

	dagre.layout(g);

	const positions = new Map<string, { x: number; y: number }>();
	for (const n of nodes) {
		const pos = g.node(n.path);
		if (pos) positions.set(n.path, { x: pos.x, y: pos.y });
	}

	return { positions };
}
