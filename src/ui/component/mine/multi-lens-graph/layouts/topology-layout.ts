import dagre from '@dagrejs/dagre';
import type { LensNodeData, LensEdgeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: LensEdgeData['kind']; weight?: number }>;
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

/** Estimate node width from label text */
function estimateNodeWidth(label: string): number {
	let w = 0;
	for (const ch of label) {
		w += ch.charCodeAt(0) > 0x7f ? 14 : 8;
	}
	return Math.max(100, w + 32);
}

export function computeTopologyLayout(input: LayoutInput): LayoutResult {
	const positions = new Map<string, { x: number; y: number }>();
	if (input.nodes.length === 0) return { positions };

	// Separate connected nodes from isolated nodes
	const connectedPaths = new Set<string>();
	for (const e of input.edges) {
		connectedPaths.add(e.source);
		connectedPaths.add(e.target);
	}

	const connectedNodes = input.nodes.filter((n) => connectedPaths.has(n.path));
	const isolatedNodes = input.nodes.filter((n) => !connectedPaths.has(n.path));

	// Layout connected subgraph with dagre (cluster-aware compound graph)
	if (connectedNodes.length > 0) {
		const g = new dagre.graphlib.Graph({ compound: true });
		g.setDefaultEdgeLabel(() => ({}));
		g.setGraph({ rankdir: 'TB', nodesep: 120, ranksep: 140, marginx: 40, marginy: 40 });

		// Collect unique clusters
		const clusters = new Set<string>();
		for (const n of connectedNodes) {
			if (n.clusterId) clusters.add(n.clusterId);
		}

		// Add cluster subgraph nodes
		for (const cid of clusters) {
			g.setNode(cid, { label: cid, clusterLabelPos: 'top' });
		}

		// Add nodes and assign to clusters
		for (const n of connectedNodes) {
			const height = n.role === 'hub' || n.role === 'bridge' ? 60 : 45;
			g.setNode(n.path, { width: estimateNodeWidth(n.label), height, label: n.label });
			if (n.clusterId && clusters.has(n.clusterId)) {
				g.setParent(n.path, n.clusterId);
			}
		}
		for (const e of input.edges) {
			if (connectedPaths.has(e.source) && connectedPaths.has(e.target)) {
				g.setEdge(e.source, e.target);
			}
		}

		dagre.layout(g);

		for (const n of connectedNodes) {
			const pos = g.node(n.path);
			if (pos) positions.set(n.path, { x: pos.x, y: pos.y });
		}
	}

	// Layout isolated nodes in a grid below the connected subgraph
	if (isolatedNodes.length > 0) {
		// Find bottom of connected layout
		let maxY = 0;
		for (const [, pos] of positions) {
			if (pos.y > maxY) maxY = pos.y;
		}
		const gridTop = positions.size > 0 ? maxY + 100 : 0;

		const cols = Math.max(3, Math.ceil(Math.sqrt(isolatedNodes.length)));
		const colWidth = 250;
		const rowHeight = 60;

		for (let i = 0; i < isolatedNodes.length; i++) {
			const col = i % cols;
			const row = Math.floor(i / cols);
			positions.set(isolatedNodes[i].path, {
				x: col * colWidth,
				y: gridTop + row * rowHeight,
			});
		}
	}

	return { positions };
}
