import dagre from '@dagrejs/dagre';
import type { LensNodeData, LensEdgeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: LensEdgeData['kind']; weight?: number }>;
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

/** Estimate node width based on label text (Chinese chars ~14px, Latin ~8px) */
function estimateNodeWidth(label: string): number {
	let w = 0;
	for (const ch of label) {
		w += ch.charCodeAt(0) > 0x7f ? 14 : 8;
	}
	return Math.max(120, w + 32); // +32 for padding
}

export function computeTopologyLayout(input: LayoutInput): LayoutResult {
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 100, marginx: 20, marginy: 20 });

	for (const n of input.nodes) {
		g.setNode(n.path, { width: estimateNodeWidth(n.label), height: 44 });
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
