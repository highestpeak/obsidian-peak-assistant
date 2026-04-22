import type { LensNodeData } from '../types';

export interface TimelineLayoutInput {
	nodes: LensNodeData[];
	evolutionChains?: Array<{ chain: string[]; theme: string }>;
}

export interface TimelineLayoutResult {
	positions: Map<string, { x: number; y: number }>;
	axisX: number;
	chainEdges?: Array<{ source: string; target: string; kind: string; chainIndex: number }>;
	timeTicks?: Array<{ y: number; label: string; timestamp: number }>;
	axisY: number;
}

const CANVAS_PADDING = 40;
const AXIS_X = 0;
const COLUMN_WIDTH = 240;
const COLUMN_GAP = 60;
const FIRST_COLUMN_LEFT = 120;
const ROW_HEIGHT = 100;

export function computeTimelineLayout(input: TimelineLayoutInput): TimelineLayoutResult {
	const { nodes, evolutionChains = [] } = input;
	const positions = new Map<string, { x: number; y: number }>();
	const chainEdges: TimelineLayoutResult['chainEdges'] = [];

	const nodeByPath = new Map<string, LensNodeData>();
	for (const n of nodes) nodeByPath.set(n.path, n);

	if (nodes.length === 0) {
		return { positions, axisX: AXIS_X, axisY: 0 };
	}

	// Build chain membership: path → chain index
	const chainMembership = new Map<string, number>();
	for (let ci = 0; ci < evolutionChains.length; ci++) {
		for (const p of evolutionChains[ci].chain) {
			chainMembership.set(p, ci);
		}
	}

	// Assign columns: each chain gets a column, solo nodes get the last column
	const chainColumns: LensNodeData[][] = [];
	const activeChainIndices: number[] = [];
	for (let ci = 0; ci < evolutionChains.length; ci++) {
		const chainNodes = evolutionChains[ci].chain
			.map(p => nodeByPath.get(p))
			.filter((n): n is LensNodeData => n != null);
		if (chainNodes.length > 0) {
			chainColumns.push(chainNodes);
			activeChainIndices.push(ci);
		}
	}

	const placed = new Set<string>();
	for (const col of chainColumns) {
		for (const n of col) placed.add(n.path);
	}

	const soloNodes = nodes.filter(n => !placed.has(n.path));
	const hasSoloColumn = soloNodes.length > 0;
	const totalColumns = chainColumns.length + (hasSoloColumn ? 1 : 0);

	// Build a global sorted list of all nodes by time, then assign row indices
	// Nodes are placed in rows; each row = one "time slot"
	// All nodes in the same row share the same Y → horizontal alignment across columns
	const allNodesSorted = [...nodes]
		.filter(n => n.createdAt != null)
		.sort((a, b) => a.createdAt! - b.createdAt!);
	const untimedNodes = nodes.filter(n => n.createdAt == null);

	// Assign row per column: process each column top-to-bottom, incrementing a shared row counter
	// Strategy: merge-sort across columns by timestamp to assign shared rows
	type QueueItem = { node: LensNodeData; colIdx: number };
	const queues: QueueItem[][] = [];

	for (let c = 0; c < chainColumns.length; c++) {
		const sorted = [...chainColumns[c]].sort((a, b) => (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity));
		queues.push(sorted.map(node => ({ node, colIdx: c })));
	}
	if (hasSoloColumn) {
		const sorted = [...soloNodes].sort((a, b) => (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity));
		queues.push(sorted.map(node => ({ node, colIdx: chainColumns.length })));
	}

	// Merge all into a single time-ordered sequence, tracking which column each belongs to
	const merged: QueueItem[] = [];
	const pointers = queues.map(() => 0);

	while (true) {
		let bestQueue = -1;
		let bestTime = Infinity;
		for (let q = 0; q < queues.length; q++) {
			if (pointers[q] < queues[q].length) {
				const t = queues[q][pointers[q]].node.createdAt ?? Infinity;
				if (t < bestTime) {
					bestTime = t;
					bestQueue = q;
				}
			}
		}
		if (bestQueue < 0) break;
		merged.push(queues[bestQueue][pointers[bestQueue]]);
		pointers[bestQueue]++;
	}

	// Append untimed nodes at the end
	for (const n of untimedNodes) {
		if (!placed.has(n.path)) {
			merged.push({ node: n, colIdx: chainColumns.length });
		}
	}

	// Assign rows: each node gets the next available row in its column
	// To keep time-ordering, we use a global row counter that only advances
	const colNextRow = new Array(totalColumns).fill(0);
	let globalRow = 0;

	for (const item of merged) {
		const col = item.colIdx;
		const row = Math.max(globalRow, colNextRow[col]);
		const x = FIRST_COLUMN_LEFT + col * (COLUMN_WIDTH + COLUMN_GAP);
		const y = CANVAS_PADDING + row * ROW_HEIGHT;
		positions.set(item.node.path, { x, y });
		colNextRow[col] = row + 1;
		globalRow = row + 1;
	}

	// Generate chain edges
	for (let c = 0; c < chainColumns.length; c++) {
		const ci = activeChainIndices[c];
		const chain = evolutionChains[ci].chain.filter(p => positions.has(p));
		for (let i = 0; i < chain.length - 1; i++) {
			chainEdges.push({
				source: chain[i], target: chain[i + 1],
				kind: 'temporal', chainIndex: ci,
			});
		}
	}

	// Generate time ticks from the actual node timestamps
	const timestamps = allNodesSorted.map(n => n.createdAt!);
	const timeTicks = generateTimeTicksFromNodes(timestamps, positions, nodeByPath);

	return { positions, axisX: AXIS_X, axisY: 0, chainEdges, timeTicks };
}

/** Generate ticks at each unique month boundary that has nodes near it */
function generateTimeTicksFromNodes(
	timestamps: number[],
	positions: Map<string, { x: number; y: number }>,
	nodeByPath: Map<string, LensNodeData>,
): TimelineLayoutResult['timeTicks'] {
	if (timestamps.length === 0) return [];

	const DAY = 86400000;
	const minTime = timestamps[0];
	const maxTime = timestamps[timestamps.length - 1];
	const rangeMs = maxTime - minTime;

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

	// For each tick, find the closest node and use its Y position
	const ticks: NonNullable<TimelineLayoutResult['timeTicks']> = [];
	const startTick = Math.ceil(minTime / intervalMs) * intervalMs;

	// Build timestamp → Y lookup from positioned nodes
	const tsToY = new Map<number, number>();
	for (const [path, pos] of positions) {
		const n = nodeByPath.get(path);
		if (n?.createdAt != null) {
			tsToY.set(n.createdAt, pos.y);
		}
	}
	const sortedEntries = [...tsToY.entries()].sort((a, b) => a[0] - b[0]);

	function closestY(targetTs: number): number {
		if (sortedEntries.length === 0) return CANVAS_PADDING;
		let best = sortedEntries[0];
		for (const entry of sortedEntries) {
			if (Math.abs(entry[0] - targetTs) < Math.abs(best[0] - targetTs)) {
				best = entry;
			}
		}
		return best[1];
	}

	for (let t = startTick; t <= maxTime + intervalMs; t += intervalMs) {
		ticks.push({ y: closestY(t), label: formatFn(new Date(t)), timestamp: t });
	}

	// Deduplicate ticks that map to the same Y (within 20px)
	const deduped: typeof ticks = [];
	for (const tick of ticks) {
		if (deduped.length === 0 || Math.abs(tick.y - deduped[deduped.length - 1].y) > 20) {
			deduped.push(tick);
		}
	}

	return deduped;
}
