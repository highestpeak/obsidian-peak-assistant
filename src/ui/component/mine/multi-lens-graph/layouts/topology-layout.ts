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

/**
 * Find connected components via union-find.
 * Returns an array of component arrays, each containing node paths.
 */
function findConnectedComponents(nodePaths: string[], edges: TopologyInput['edges']): string[][] {
	const parent = new Map<string, string>();
	const rank = new Map<string, number>();
	for (const p of nodePaths) { parent.set(p, p); rank.set(p, 0); }

	function find(x: string): string {
		let root = x;
		while (parent.get(root) !== root) root = parent.get(root)!;
		// Path compression
		let cur = x;
		while (cur !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next; }
		return root;
	}
	function union(a: string, b: string) {
		const ra = find(a), rb = find(b);
		if (ra === rb) return;
		const rar = rank.get(ra)!, rbr = rank.get(rb)!;
		if (rar < rbr) parent.set(ra, rb);
		else if (rar > rbr) parent.set(rb, ra);
		else { parent.set(rb, ra); rank.set(ra, rar + 1); }
	}

	const nodeSet = new Set(nodePaths);
	for (const e of edges) {
		if (nodeSet.has(e.source) && nodeSet.has(e.target)) union(e.source, e.target);
	}

	const groups = new Map<string, string[]>();
	for (const p of nodePaths) {
		const root = find(p);
		if (!groups.has(root)) groups.set(root, []);
		groups.get(root)!.push(p);
	}
	// Largest component first
	return Array.from(groups.values()).sort((a, b) => b.length - a.length);
}

export function computeTopologyLayout(input: TopologyInput): { positions: Map<string, { x: number; y: number }> } {
	const { nodes, edges } = input;
	if (nodes.length === 0) return { positions: new Map() };

	// Deduplicate nodes by path
	const seenPaths = new Set<string>();
	const uniqueNodes: LensNodeData[] = [];
	for (const n of nodes) {
		if (!seenPaths.has(n.path)) {
			seenPaths.add(n.path);
			uniqueNodes.push(n);
		}
	}

	const nodeMap = new Map(uniqueNodes.map(n => [n.path, n]));
	const nodeSet = new Set(uniqueNodes.map(n => n.path));

	// Tight spacing — dagre handles node width internally so ranksep is pure gap
	const nodesep = 40;
	const ranksep = 100;

	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'LR', nodesep, ranksep });

	for (const n of uniqueNodes) {
		g.setNode(n.path, { width: estimateNodeWidth(n.label), height: 60 });
	}
	for (const e of edges) {
		if (nodeSet.has(e.source) && nodeSet.has(e.target)) {
			g.setEdge(e.source, e.target);
		}
	}

	dagre.layout(g);

	// Collect raw dagre positions
	const rawPositions = new Map<string, { x: number; y: number }>();
	for (const n of uniqueNodes) {
		const pos = g.node(n.path);
		if (pos) rawPositions.set(n.path, { x: pos.x, y: pos.y });
	}

	// Find connected components and compact them side-by-side
	const components = findConnectedComponents(
		uniqueNodes.map(n => n.path),
		edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target)),
	);

	const positions = new Map<string, { x: number; y: number }>();
	const COMPONENT_GAP = 80;
	let cursorX = 0;

	for (const comp of components) {
		// Compute bounding box of this component in dagre's coordinate space
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const path of comp) {
			const pos = rawPositions.get(path);
			if (!pos) continue;
			const hw = estimateNodeWidth(nodeMap.get(path)!.label) / 2;
			minX = Math.min(minX, pos.x - hw);
			minY = Math.min(minY, pos.y - 30);
			maxX = Math.max(maxX, pos.x + hw);
			maxY = Math.max(maxY, pos.y + 30);
		}
		if (minX === Infinity) {
			// No dagre positions for this component — place in a grid
			for (let i = 0; i < comp.length; i++) {
				positions.set(comp[i]!, { x: cursorX + (i % 3) * 180, y: (Math.floor(i / 3)) * 80 });
			}
			cursorX += 3 * 180 + COMPONENT_GAP;
			continue;
		}

		// Shift component so it starts at cursorX, minY stays at 0
		const offsetX = cursorX - minX;
		const offsetY = -minY;
		for (const path of comp) {
			const pos = rawPositions.get(path);
			if (pos) {
				positions.set(path, { x: pos.x + offsetX, y: pos.y + offsetY });
			}
		}
		cursorX += (maxX - minX) + COMPONENT_GAP;
	}

	return { positions };
}
