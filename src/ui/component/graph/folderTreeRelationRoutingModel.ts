import type {
	FolderTreeLayout,
	FolderTreeVisualRow,
} from './folderTreeLayoutModel';

export const FOLDER_TREE_RELATION_ROUTING_DEFAULTS = {
	clearance: 18,
	laneGap: 12,
	maxLanes: 6,
	intervalPadding: 4,
} as const;

export interface FolderTreeRelationEdgeInput {
	id: string;
	sourceId: string;
	targetId: string;
}

export interface FolderTreeRelationRoute {
	edgeId: string;
	laneIndex: number;
	obstacleRight: number;
	routeX: number;
	controlPointDistances: [number, number];
	controlPointWeights: [number, number];
}

interface RelationCandidate extends FolderTreeRelationEdgeInput {
	source: FolderTreeVisualRow;
	target: FolderTreeVisualRow;
	top: number;
	bottom: number;
	obstacleRight: number;
}

interface VerticalInterval {
	top: number;
	bottom: number;
}

function overlapAmount(left: VerticalInterval, right: VerticalInterval): number {
	const padding = FOLDER_TREE_RELATION_ROUTING_DEFAULTS.intervalPadding;
	return Math.max(
		0,
		Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) + padding,
	);
}

function laneOverlapScore(
	lane: ReadonlyArray<VerticalInterval>,
	candidate: VerticalInterval,
): number {
	return lane.reduce((score, interval) => score + overlapAmount(interval, candidate), 0);
}

function allocateLane(
	lanes: VerticalInterval[][],
	candidate: VerticalInterval,
): number {
	const openLane = lanes.findIndex((lane) => laneOverlapScore(lane, candidate) === 0);
	if (openLane >= 0) return openLane;
	if (lanes.length < FOLDER_TREE_RELATION_ROUTING_DEFAULTS.maxLanes) {
		lanes.push([]);
		return lanes.length - 1;
	}

	let bestLane = 0;
	let bestScore = Number.POSITIVE_INFINITY;
	for (const [index, lane] of lanes.entries()) {
		const score = laneOverlapScore(lane, candidate);
		if (score >= bestScore) continue;
		bestLane = index;
		bestScore = score;
	}
	return bestLane;
}

function obstacleRightForSpan(
	rows: ReadonlyArray<FolderTreeVisualRow>,
	top: number,
	bottom: number,
): number {
	return rows.reduce((right, row) => {
		if (row.bottom < top || row.top > bottom) return right;
		return Math.max(right, row.right);
	}, Number.NEGATIVE_INFINITY);
}

function controlPointBasis(
	source: FolderTreeVisualRow,
	target: FolderTreeVisualRow,
	point: { x: number; y: number },
): { distance: number; weight: number } | null {
	const dx = target.centerX - source.centerX;
	const dy = target.centerY - source.centerY;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return null;

	const length = Math.sqrt(lengthSquared);
	const offsetX = point.x - source.centerX;
	const offsetY = point.y - source.centerY;
	const weight = (offsetX * dx + offsetY * dy) / lengthSquared;
	const baseX = source.centerX + dx * weight;
	const baseY = source.centerY + dy * weight;
	const normalX = -dy / length;
	const normalY = dx / length;
	const distance = (point.x - baseX) * normalX + (point.y - baseY) * normalY;
	return { distance, weight };
}

function relationCandidates(
	layout: FolderTreeLayout,
	edges: ReadonlyArray<FolderTreeRelationEdgeInput>,
): RelationCandidate[] {
	return edges.flatMap((edge): RelationCandidate[] => {
		const source = layout.rowById.get(edge.sourceId);
		const target = layout.rowById.get(edge.targetId);
		if (!source || !target || source.id === target.id) return [];
		const top = Math.min(source.centerY, target.centerY);
		const bottom = Math.max(source.centerY, target.centerY);
		const obstacleRight = obstacleRightForSpan(layout.rows, top, bottom);
		if (!Number.isFinite(obstacleRight)) return [];
		return [{ ...edge, source, target, top, bottom, obstacleRight }];
	}).sort((left, right) => (
		left.top - right.top
		|| right.bottom - left.bottom
		|| left.id.localeCompare(right.id)
	));
}

/**
 * Routes Folder Tree relations through a local right-side safety corridor.
 * The corridor clears every visible row within the edge's vertical span, while
 * bounded reusable lanes prevent dense All links views from expanding forever.
 */
export function buildFolderTreeRelationRoutes(
	layout: FolderTreeLayout,
	edges: ReadonlyArray<FolderTreeRelationEdgeInput>,
): Map<string, FolderTreeRelationRoute> {
	const routes = new Map<string, FolderTreeRelationRoute>();
	const lanes: VerticalInterval[][] = [];

	for (const candidate of relationCandidates(layout, edges)) {
		const interval = { top: candidate.top, bottom: candidate.bottom };
		const laneIndex = allocateLane(lanes, interval);
		lanes[laneIndex].push(interval);
		const routeX = candidate.obstacleRight
			+ FOLDER_TREE_RELATION_ROUTING_DEFAULTS.clearance
			+ laneIndex * FOLDER_TREE_RELATION_ROUTING_DEFAULTS.laneGap;
		const first = controlPointBasis(candidate.source, candidate.target, {
			x: routeX,
			y: candidate.source.centerY,
		});
		const second = controlPointBasis(candidate.source, candidate.target, {
			x: routeX,
			y: candidate.target.centerY,
		});
		if (!first || !second) continue;
		routes.set(candidate.id, {
			edgeId: candidate.id,
			laneIndex,
			obstacleRight: candidate.obstacleRight,
			routeX,
			controlPointDistances: [first.distance, second.distance],
			controlPointWeights: [first.weight, second.weight],
		});
	}

	return routes;
}
