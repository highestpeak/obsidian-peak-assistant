import type {
	FolderTreeRow,
	VisibleFolderTreeProjection,
} from './folderTreeModel';

export const FOLDER_TREE_LAYOUT_DEFAULTS = {
	originX: 40,
	originY: 24,
	levelIndent: 58,
	rowStep: 28,
	rootSectionGap: 22,
	railOffset: 13,
	folderHeight: 25,
	rootFolderHeight: 27,
	fileHeight: 25,
	folderMinWidth: 136,
	rootFolderMinWidth: 158,
	folderMaxWidth: 220,
	fileMinWidth: 190,
	fileMaxWidth: 270,
} as const;

export interface FolderTreeVisualRow extends FolderTreeRow {
	label: string;
	left: number;
	top: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
	badgeWidth: number;
	count: number;
	root: boolean;
}

export interface FolderTreeRailPoint {
	id: string;
	parentId: string;
	childId?: string;
	kind: 'start' | 'child';
	x: number;
	y: number;
}

export interface FolderTreeRailSegment {
	id: string;
	parentId: string;
	childId: string;
	kind: 'rail' | 'branch';
	sourceId: string;
	targetId: string;
}

export interface FolderTreeLayout {
	rows: FolderTreeVisualRow[];
	rowById: Map<string, FolderTreeVisualRow>;
	railPoints: FolderTreeRailPoint[];
	railSegments: FolderTreeRailSegment[];
}

export interface FolderTreeLayoutInput {
	labelById: ReadonlyMap<string, string>;
	linkCountByDocumentId: ReadonlyMap<string, number>;
}

function estimateLabelWidth(label: string, fontSize: number): number {
	return [...label].reduce((width, character) => {
		const wide = character.charCodeAt(0) > 0xff;
		return width + (wide ? fontSize : fontSize * 0.58);
	}, 0);
}

function badgeWidth(count: number, folder: boolean): number {
	const digitWidth = String(Math.max(0, count)).length * 6;
	return folder ? Math.max(19, 12 + digitWidth) : Math.max(28, 20 + digitWidth);
}

function rowWidth(
	label: string,
	kind: FolderTreeRow['kind'],
	root: boolean,
	countWidth: number,
): number {
	const folder = kind === 'folder';
	const textWidth = estimateLabelWidth(label, folder ? 11 : 10.8);
	const desired = Math.ceil(8 + 14 + 6 + textWidth + 6 + countWidth + 8);
	if (!folder) {
		return Math.min(
			FOLDER_TREE_LAYOUT_DEFAULTS.fileMaxWidth,
			Math.max(FOLDER_TREE_LAYOUT_DEFAULTS.fileMinWidth, desired),
		);
	}
	const minimum = root
		? FOLDER_TREE_LAYOUT_DEFAULTS.rootFolderMinWidth
		: FOLDER_TREE_LAYOUT_DEFAULTS.folderMinWidth;
	return Math.min(
		FOLDER_TREE_LAYOUT_DEFAULTS.folderMaxWidth,
		Math.max(minimum, desired),
	);
}

function directChildIds(
	projection: VisibleFolderTreeProjection,
	parentId: string,
): string[] {
	const parent = projection.folders.find((folder) => folder.id === parentId);
	if (!parent) return [];
	const folderIds = projection.folders
		.filter((folder) => folder.parentId === parentId)
		.map((folder) => folder.id);
	return [...folderIds, ...parent.directDocumentIds];
}

/**
 * Converts the semantic folder projection into the compact visual geometry used
 * by the approved Folder Tree mock. Coordinates describe row boxes, not graph
 * forces, so every depth step and row remains deterministic at real result size.
 */
export function buildFolderTreeLayout(
	projection: VisibleFolderTreeProjection,
	input: FolderTreeLayoutInput,
): FolderTreeLayout {
	const folderById = new Map(projection.folders.map((folder) => [folder.id, folder]));
	const rows: FolderTreeVisualRow[] = [];
	let top = FOLDER_TREE_LAYOUT_DEFAULTS.originY;

	for (const [index, row] of projection.rows.entries()) {
		const root = row.kind === 'folder' && row.depth === 0;
		if (root && index > 0) top += FOLDER_TREE_LAYOUT_DEFAULTS.rootSectionGap;
		const folder = folderById.get(row.id);
		const label = folder?.label ?? input.labelById.get(row.id) ?? row.path;
		const count = folder?.documentIds.length
			?? input.linkCountByDocumentId.get(row.id)
			?? 0;
		const countWidth = badgeWidth(count, row.kind === 'folder');
		const width = rowWidth(label, row.kind, root, countWidth);
		const height = root
			? FOLDER_TREE_LAYOUT_DEFAULTS.rootFolderHeight
			: row.kind === 'folder'
				? FOLDER_TREE_LAYOUT_DEFAULTS.folderHeight
				: FOLDER_TREE_LAYOUT_DEFAULTS.fileHeight;
		const left = FOLDER_TREE_LAYOUT_DEFAULTS.originX
			+ row.depth * FOLDER_TREE_LAYOUT_DEFAULTS.levelIndent;
		rows.push({
			...row,
			label,
			left,
			top,
			width,
			height,
			centerX: left + width / 2,
			centerY: top + height / 2,
			badgeWidth: countWidth,
			count,
			root,
		});
		top += FOLDER_TREE_LAYOUT_DEFAULTS.rowStep;
	}

	const rowById = new Map(rows.map((row) => [row.id, row]));
	const rowOrder = new Map(rows.map((row, index) => [row.id, index]));
	const railPoints: FolderTreeRailPoint[] = [];
	const railSegments: FolderTreeRailSegment[] = [];

	for (const parent of projection.folders) {
		const parentRow = rowById.get(parent.id);
		if (!parentRow) continue;
		const childRows = directChildIds(projection, parent.id)
			.map((id) => rowById.get(id))
			.filter((row): row is FolderTreeVisualRow => Boolean(row))
			.sort((left, right) => (rowOrder.get(left.id) ?? 0) - (rowOrder.get(right.id) ?? 0));
		if (childRows.length === 0) continue;

		const railX = Math.min(...childRows.map((row) => row.left))
			- FOLDER_TREE_LAYOUT_DEFAULTS.railOffset;
		const startId = `tree-rail:${parent.id}:start`;
		railPoints.push({
			id: startId,
			parentId: parent.id,
			kind: 'start',
			x: railX,
			y: parentRow.top + parentRow.height + 1,
		});

		let previousPointId = startId;
		for (const childRow of childRows) {
			const pointId = `tree-rail:${parent.id}:${childRow.id}`;
			railPoints.push({
				id: pointId,
				parentId: parent.id,
				childId: childRow.id,
				kind: 'child',
				x: railX,
				y: childRow.centerY,
			});
			railSegments.push({
				id: `tree-rail-edge:${parent.id}:${childRow.id}`,
				parentId: parent.id,
				childId: childRow.id,
				kind: 'rail',
				sourceId: previousPointId,
				targetId: pointId,
			});
			railSegments.push({
				id: `tree-branch-edge:${parent.id}:${childRow.id}`,
				parentId: parent.id,
				childId: childRow.id,
				kind: 'branch',
				sourceId: pointId,
				targetId: childRow.id,
			});
			previousPointId = pointId;
		}
	}

	return { rows, rowById, railPoints, railSegments };
}
