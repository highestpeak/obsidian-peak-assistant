export interface DetachedGraphNodeBox {
	id: string;
	width: number;
	height: number;
}

export interface DetachedGraphPackingOptions {
	availableWidth: number;
	horizontalGap: number;
	verticalGap: number;
}

export interface DetachedGraphPlacement {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Stable, label-aware row packing. Unlike a fixed-cell grid, every placement
 * reserves its rendered node width and row height, so long titles cannot
 * overlap their neighbours.
 */
export function packDetachedGraphNodes(
	nodes: readonly DetachedGraphNodeBox[],
	options: DetachedGraphPackingOptions,
): DetachedGraphPlacement[] {
	if (nodes.length === 0) return [];
	const availableWidth = Math.max(1, options.availableWidth);
	const horizontalGap = Math.max(0, options.horizontalGap);
	const verticalGap = Math.max(0, options.verticalGap);
	const placements: DetachedGraphPlacement[] = [];
	let cursorX = 0;
	let rowTop = 0;
	let rowHeight = 0;

	for (const node of nodes) {
		const width = Math.max(1, node.width);
		const height = Math.max(1, node.height);
		const needsNewRow = cursorX > 0 && cursorX + width > availableWidth;
		if (needsNewRow) {
			cursorX = 0;
			rowTop += rowHeight + verticalGap;
			rowHeight = 0;
		}
		placements.push({
			id: node.id,
			x: cursorX + width / 2,
			y: rowTop + height / 2,
			width,
			height,
		});
		cursorX += width + horizontalGap;
		rowHeight = Math.max(rowHeight, height);
	}
	return placements;
}
