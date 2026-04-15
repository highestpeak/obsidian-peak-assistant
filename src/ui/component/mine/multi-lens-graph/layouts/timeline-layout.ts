import type { LensNodeData } from '../types';

interface LayoutInput {
	nodes: LensNodeData[];
}

interface LayoutResult {
	positions: Map<string, { x: number; y: number }>;
}

export function computeTimelineLayout(input: LayoutInput): LayoutResult {
	const sorted = [...input.nodes].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

	if (sorted.length === 0) return { positions: new Map() };

	const minTime = sorted[0].createdAt ?? 0;
	const maxTime = sorted[sorted.length - 1].createdAt ?? 1;
	const timeRange = maxTime - minTime || 1;
	const canvasWidth = Math.max(800, sorted.length * 120);

	const positions = new Map<string, { x: number; y: number }>();
	for (let i = 0; i < sorted.length; i++) {
		const t = sorted[i].createdAt ?? 0;
		const x = ((t - minTime) / timeRange) * canvasWidth;
		const y = (i % 3) * 80 + 40;
		positions.set(sorted[i].path, { x, y });
	}

	return { positions };
}
