import type { LensNodeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
	edges: Array<{ source: string; target: string; kind: string }>;
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

export function computeBridgeLayout(input: LayoutInput): LayoutResult {
	const groups = new Map<string, LensNodeData[]>();
	for (const n of input.nodes) {
		const folder = n.group || n.path.split('/').slice(0, -1).join('/') || '/';
		if (!groups.has(folder)) groups.set(folder, []);
		groups.get(folder)!.push(n);
	}

	const positions = new Map<string, { x: number; y: number }>();
	const colWidth = 300;
	const rowHeight = 90;
	const headerHeight = 30;
	let colIndex = 0;

	for (const [, nodes] of groups) {
		for (let i = 0; i < nodes.length; i++) {
			positions.set(nodes[i].path, {
				x: colIndex * colWidth + 40,
				y: headerHeight + i * rowHeight,
			});
		}
		colIndex++;
	}

	return { positions };
}
