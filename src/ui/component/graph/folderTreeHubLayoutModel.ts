import type { FolderTreeLayout } from './folderTreeLayoutModel';

export const FOLDER_TREE_HUB_LAYOUT_DEFAULTS = {
	columnGap: 64,
	nodeWidth: 190,
	nodeHeight: 46,
	verticalGap: 14,
} as const;

export interface FolderTreeHubInput {
	id: string;
}

export interface FolderTreeHubConstituentEdgeInput {
	sourceId: string;
	targetId: string;
}

export interface FolderTreeHubLayoutInput {
	hubs: ReadonlyArray<FolderTreeHubInput>;
	constituentEdges: ReadonlyArray<FolderTreeHubConstituentEdgeInput>;
	relationRouteXs: ReadonlyArray<number>;
}

export interface FolderTreeHubPosition {
	x: number;
	y: number;
}

export interface FolderTreeHubLayout {
	columnLeft: number;
	columnCenterX: number;
	nodeWidth: number;
	nodeHeight: number;
	positionById: Map<string, FolderTreeHubPosition>;
}

interface PreferredHubPosition {
	id: string;
	preferredY: number;
	y: number;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? null;
	return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function constituentRowYs(
	layout: FolderTreeLayout,
	hubId: string,
	edges: ReadonlyArray<FolderTreeHubConstituentEdgeInput>,
): number[] {
	return edges.flatMap((edge): number[] => {
		const documentId = edge.sourceId === hubId
			? edge.targetId
			: edge.targetId === hubId
				? edge.sourceId
				: null;
		if (!documentId) return [];
		const row = layout.rowById.get(documentId);
		return row ? [row.centerY] : [];
	});
}

function packVertically(
	positions: PreferredHubPosition[],
	minY: number,
	maxY: number,
): void {
	const spacing = FOLDER_TREE_HUB_LAYOUT_DEFAULTS.nodeHeight
		+ FOLDER_TREE_HUB_LAYOUT_DEFAULTS.verticalGap;
	let previousY = Number.NEGATIVE_INFINITY;
	for (const position of positions) {
		const preferred = Math.min(maxY, Math.max(minY, position.preferredY));
		position.y = Math.max(preferred, previousY + spacing);
		previousY = position.y;
	}
	if (positions.length === 0) return;

	const last = positions[positions.length - 1]!;
	const first = positions[0]!;
	const overflow = Math.max(0, last.y - maxY);
	const upwardCapacity = Math.max(0, first.y - minY);
	const shift = Math.min(overflow, upwardCapacity);
	if (shift === 0) return;
	for (const position of positions) position.y -= shift;
}

/**
 * Places Folder Tree Hub anchors in a dedicated right-hand column. Each Hub is
 * aligned to the median of its visible constituents, then minimally displaced
 * to avoid collisions with neighboring Hub cards.
 */
export function buildFolderTreeHubLayout(
	layout: FolderTreeLayout,
	input: FolderTreeHubLayoutInput,
): FolderTreeHubLayout {
	const treeRight = layout.rows.reduce(
		(right, row) => Math.max(right, row.right),
		0,
	);
	const relationRight = input.relationRouteXs.reduce(
		(right, routeX) => Number.isFinite(routeX) ? Math.max(right, routeX) : right,
		treeRight,
	);
	const columnLeft = relationRight + FOLDER_TREE_HUB_LAYOUT_DEFAULTS.columnGap;
	const columnCenterX = columnLeft + FOLDER_TREE_HUB_LAYOUT_DEFAULTS.nodeWidth / 2;
	const firstRow = layout.rows[0];
	const lastRow = layout.rows[layout.rows.length - 1];
	const minY = (firstRow?.top ?? 0) + FOLDER_TREE_HUB_LAYOUT_DEFAULTS.nodeHeight / 2;
	const maxY = Math.max(
		minY,
		(lastRow?.bottom ?? minY) - FOLDER_TREE_HUB_LAYOUT_DEFAULTS.nodeHeight / 2,
	);
	const fallbackY = (minY + maxY) / 2;
	const preferred = input.hubs.map((hub): PreferredHubPosition => ({
		id: hub.id,
		preferredY: median(constituentRowYs(layout, hub.id, input.constituentEdges)) ?? fallbackY,
		y: fallbackY,
	})).sort((left, right) => (
		left.preferredY - right.preferredY
		|| left.id.localeCompare(right.id)
	));
	packVertically(preferred, minY, maxY);

	return {
		columnLeft,
		columnCenterX,
		nodeWidth: FOLDER_TREE_HUB_LAYOUT_DEFAULTS.nodeWidth,
		nodeHeight: FOLDER_TREE_HUB_LAYOUT_DEFAULTS.nodeHeight,
		positionById: new Map(preferred.map((position) => [
			position.id,
			{ x: columnCenterX, y: position.y },
		])),
	};
}
