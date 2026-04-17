import type { LensNodeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

export function computeTimelineLayout(input: LayoutInput): LayoutResult {
	if (input.nodes.length === 0) return { positions: new Map() };

	// Filter to nodes with timestamps, sort by creation time
	const withTime = input.nodes.filter((n) => n.createdAt != null);
	const withoutTime = input.nodes.filter((n) => n.createdAt == null);

	// If no timestamps at all, lay out in a simple grid
	if (withTime.length === 0) {
		const positions = new Map<string, { x: number; y: number }>();
		const cols = Math.ceil(Math.sqrt(input.nodes.length));
		for (let i = 0; i < input.nodes.length; i++) {
			const col = i % cols;
			const row = Math.floor(i / cols);
			positions.set(input.nodes[i].path, { x: col * 220, y: row * 100 });
		}
		return { positions };
	}

	const sorted = [...withTime].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

	const minTime = sorted[0].createdAt ?? 0;
	const maxTime = sorted[sorted.length - 1].createdAt ?? 1;
	const timeRange = maxTime - minTime || 1;
	const canvasWidth = Math.max(800, sorted.length * 200);
	const rowHeight = 120;
	const rows = 3;

	const positions = new Map<string, { x: number; y: number }>();
	for (let i = 0; i < sorted.length; i++) {
		const t = sorted[i].createdAt ?? 0;
		const x = ((t - minTime) / timeRange) * canvasWidth;
		const y = (i % rows) * rowHeight + 40;
		positions.set(sorted[i].path, { x, y });
	}

	// Place nodes without timestamps at the end
	for (let i = 0; i < withoutTime.length; i++) {
		const x = canvasWidth + 100 + (i % 3) * 220;
		const y = Math.floor(i / 3) * rowHeight + 40;
		positions.set(withoutTime[i].path, { x, y });
	}

	return { positions };
}
