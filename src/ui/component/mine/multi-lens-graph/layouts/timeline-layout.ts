import type { LensNodeData } from '../types';

export interface TimelineLayoutInput {
	nodes: LensNodeData[];
	evolutionChains?: Array<{ chain: string[]; theme: string }>;
}

export interface TimelineLayoutResult {
	positions: Map<string, { x: number; y: number }>;
	axisY: number;
	chainEdges?: Array<{ source: string; target: string; kind: string; chainIndex: number }>;
	timeTicks?: Array<{ x: number; label: string; timestamp: number }>;
}

const CANVAS_PADDING = 80;
const AXIS_Y = 260;
const CHAIN_OFFSET_Y = 120;
const SOLO_OFFSET_Y = 20;
const MIN_X_GAP = 200;

export function computeTimelineLayout(input: TimelineLayoutInput): TimelineLayoutResult {
	const { nodes, evolutionChains = [] } = input;
	const positions = new Map<string, { x: number; y: number }>();
	const chainEdges: TimelineLayoutResult['chainEdges'] = [];

	const timed = nodes
		.filter(n => n.createdAt != null)
		.sort((a, b) => a.createdAt! - b.createdAt!);

	const canvasWidth = Math.max(900, timed.length * 200);

	if (timed.length === 0) {
		nodes.forEach((n, i) => {
			positions.set(n.path, { x: CANVAS_PADDING + i * 100, y: AXIS_Y });
		});
		return { positions, axisY: AXIS_Y };
	}

	const minTime = timed[0].createdAt!;
	const maxTime = timed[timed.length - 1].createdAt!;
	const timeRange = maxTime - minTime || 1;

	function timeToX(t: number): number {
		return CANVAS_PADDING + ((t - minTime) / timeRange) * (canvasWidth - 2 * CANVAS_PADDING);
	}

	const chainMembership = new Map<string, number>();
	for (let ci = 0; ci < evolutionChains.length; ci++) {
		for (const p of evolutionChains[ci].chain) {
			chainMembership.set(p, ci);
		}
	}

	const aboveCount = new Map<number, number>();
	const belowCount = new Map<number, number>();

	for (const n of timed) {
		const x = timeToX(n.createdAt!);
		let y: number;
		if (chainMembership.has(n.path)) {
			const ci = chainMembership.get(n.path)!;
			if (ci % 2 === 0) {
				y = AXIS_Y - CHAIN_OFFSET_Y - (aboveCount.get(ci) ?? 0) * 15;
				aboveCount.set(ci, (aboveCount.get(ci) ?? 0) + 1);
			} else {
				y = AXIS_Y + CHAIN_OFFSET_Y + (belowCount.get(ci) ?? 0) * 15;
				belowCount.set(ci, (belowCount.get(ci) ?? 0) + 1);
			}
		} else {
			y = AXIS_Y - SOLO_OFFSET_Y;
		}
		positions.set(n.path, { x, y });
	}

	// Enforce minimum x gap between adjacent nodes to prevent overlap
	const sortedPaths = timed.map(n => n.path);
	for (let i = 1; i < sortedPaths.length; i++) {
		const prev = positions.get(sortedPaths[i - 1])!;
		const curr = positions.get(sortedPaths[i])!;
		if (curr.x - prev.x < MIN_X_GAP) {
			curr.x = prev.x + MIN_X_GAP;
		}
	}

	const untimed = nodes.filter(n => n.createdAt == null);
	const lastTimedX = sortedPaths.length > 0 ? positions.get(sortedPaths[sortedPaths.length - 1])!.x : canvasWidth - CANVAS_PADDING;
	untimed.forEach((n, i) => {
		positions.set(n.path, {
			x: lastTimedX + 30 + i * 60,
			y: AXIS_Y,
		});
	});

	for (let ci = 0; ci < evolutionChains.length; ci++) {
		const chain = evolutionChains[ci].chain;
		for (let i = 0; i < chain.length - 1; i++) {
			chainEdges.push({
				source: chain[i], target: chain[i + 1],
				kind: 'temporal', chainIndex: ci,
			});
		}
	}

	const timeTicks = generateTimeTicks(minTime, maxTime, timeToX);
	return { positions, axisY: AXIS_Y, chainEdges, timeTicks };
}

function generateTimeTicks(
	minTime: number, maxTime: number,
	timeToX: (t: number) => number,
): TimelineLayoutResult['timeTicks'] {
	const rangeMs = maxTime - minTime;
	const DAY = 86400000;
	let intervalMs: number;
	let formatFn: (d: Date) => string;
	if (rangeMs < 14 * DAY) {
		intervalMs = DAY;
		formatFn = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
	} else if (rangeMs < 90 * DAY) {
		intervalMs = 7 * DAY;
		formatFn = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
	} else {
		intervalMs = 30 * DAY;
		formatFn = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}
	const ticks: NonNullable<TimelineLayoutResult['timeTicks']> = [];
	const startTick = Math.ceil(minTime / intervalMs) * intervalMs;
	for (let t = startTick; t <= maxTime; t += intervalMs) {
		ticks.push({ x: timeToX(t), label: formatFn(new Date(t)), timestamp: t });
	}
	return ticks;
}
