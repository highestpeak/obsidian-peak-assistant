import dagre from '@dagrejs/dagre';
import type { LensNodeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

export function computeTimelineLayout(input: LayoutInput): LayoutResult {
	if (input.nodes.length === 0) return { positions: new Map() };

	// Sort by creation time, then by path as fallback
	const sorted = [...input.nodes].sort((a, b) => {
		const ta = a.createdAt ?? 0;
		const tb = b.createdAt ?? 0;
		if (ta !== tb) return ta - tb;
		return a.path.localeCompare(b.path);
	});

	// Use dagre with LR direction — nodes ordered by time form a left-to-right chain
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 100, marginx: 20, marginy: 20 });

	for (const n of sorted) {
		g.setNode(n.path, { width: 200, height: 50 });
	}

	// Chain nodes in time order to create left-to-right flow
	for (let i = 0; i < sorted.length - 1; i++) {
		g.setEdge(sorted[i].path, sorted[i + 1].path);
	}

	dagre.layout(g);

	const positions = new Map<string, { x: number; y: number }>();
	for (const n of sorted) {
		const pos = g.node(n.path);
		if (pos) positions.set(n.path, { x: pos.x, y: pos.y });
	}
	return { positions };
}
