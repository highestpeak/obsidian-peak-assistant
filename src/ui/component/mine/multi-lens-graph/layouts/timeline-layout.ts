import dagre from '@dagrejs/dagre';
import type { LensNodeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

function estimateNodeWidth(label: string): number {
	let w = 0;
	for (const ch of label) {
		w += ch.charCodeAt(0) > 0x7f ? 14 : 8;
	}
	return Math.max(120, w + 32);
}

export function computeTimelineLayout(input: LayoutInput): LayoutResult {
	if (input.nodes.length === 0) return { positions: new Map() };

	const sorted = [...input.nodes].sort((a, b) => {
		const ta = a.createdAt ?? 0;
		const tb = b.createdAt ?? 0;
		if (ta !== tb) return ta - tb;
		return a.path.localeCompare(b.path);
	});

	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });

	for (const n of sorted) {
		g.setNode(n.path, { width: estimateNodeWidth(n.label), height: 44 });
	}

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
