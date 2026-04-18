import dagre from '@dagrejs/dagre';
import type { LensNodeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: string }>;
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

function estimateNodeWidth(label: string): number {
	let w = 0;
	for (const ch of label) {
		w += ch.charCodeAt(0) > 0x7f ? 14 : 8;
	}
	return Math.max(100, w + 32);
}

export function computeBridgeLayout(input: LayoutInput): LayoutResult {
	const positions = new Map<string, { x: number; y: number }>();
	if (input.nodes.length === 0) return { positions };

	// Group nodes by folder
	const groups = new Map<string, LensNodeData[]>();
	for (const n of input.nodes) {
		const folder = n.group || n.path.split('/').slice(0, -1).join('/') || '/';
		if (!groups.has(folder)) groups.set(folder, []);
		groups.get(folder)!.push(n);
	}

	// Lay out each group as a column
	const colGap = 80;
	let xOffset = 0;
	const rowHeight = 60;

	for (const [, nodes] of groups) {
		const colWidth = Math.max(...nodes.map((n) => estimateNodeWidth(n.label)));
		for (let i = 0; i < nodes.length; i++) {
			positions.set(nodes[i].path, {
				x: xOffset + colWidth / 2,
				y: i * rowHeight,
			});
		}
		xOffset += colWidth + colGap;
	}

	return { positions };
}
