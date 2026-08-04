import type { CommandCenterLayer, ResolvedCommandCenterItem } from './types';

export interface CommandCenterProjection {
	blocks: Array<{
		kind: 'destination' | 'grid' | 'row';
		items: ResolvedCommandCenterItem[];
	}>;
	destinations: ResolvedCommandCenterItem[];
	grid: ResolvedCommandCenterItem[];
	rows: ResolvedCommandCenterItem[];
}

export function projectCommandCenterItems(
	items: ResolvedCommandCenterItem[],
	actionLayout: 'layered' | 'rows' = 'layered',
): CommandCenterProjection {
	const destinations: ResolvedCommandCenterItem[] = [];
	const grid: ResolvedCommandCenterItem[] = [];
	const rows: ResolvedCommandCenterItem[] = [];
	const blocks: CommandCenterProjection['blocks'] = [];
	for (const item of items) {
		let kind: CommandCenterProjection['blocks'][number]['kind'];
		if (item.layer === 'destination') {
			destinations.push(item);
			kind = 'destination';
		} else {
			const canUseGrid = actionLayout === 'layered'
				&& item.display !== 'text-only'
				&& Boolean(item.icon);
			if (canUseGrid) {
				grid.push(item);
				kind = 'grid';
			} else {
				rows.push(item);
				kind = 'row';
			}
		}
		const previous = blocks[blocks.length - 1];
		if (previous?.kind === kind) previous.items.push(item);
		else blocks.push({ kind, items: [item] });
	}
	return { blocks, destinations, grid, rows };
}

export interface ProjectionPosition {
	id: string;
	layer: CommandCenterLayer | 'row';
	sectionId: string;
	column: number;
	columns: number;
}

export function buildProjectionPositions(
	projection: CommandCenterProjection,
	destinationColumns = 3,
	sectionId = 'default',
): ProjectionPosition[] {
	return projection.blocks.flatMap((block) => block.items.map((item, index) => {
		if (block.kind === 'destination') return { id: item.id, layer: 'destination' as const, sectionId, column: index % destinationColumns, columns: destinationColumns };
		if (block.kind === 'grid') return { id: item.id, layer: 'command' as const, sectionId, column: index % 5, columns: 5 };
		return { id: item.id, layer: 'row' as const, sectionId, column: 0, columns: 1 };
	}));
}

export function moveProjectionFocus(
	positions: ProjectionPosition[],
	currentId: string | null,
	direction: 'left' | 'right' | 'up' | 'down',
): string | null {
	if (positions.length === 0) return null;
	const currentIndex = Math.max(0, positions.findIndex((position) => position.id === currentId));
	if (direction === 'left') return positions[Math.max(0, currentIndex - 1)]!.id;
	if (direction === 'right') return positions[Math.min(positions.length - 1, currentIndex + 1)]!.id;

	const current = positions[currentIndex]!;
	const delta = direction === 'up' ? -current.columns : current.columns;
	const sameLayerIndex = currentIndex + delta;
	const sameLayer = positions[sameLayerIndex];
	if (sameLayer?.layer === current.layer && sameLayer.sectionId === current.sectionId) return sameLayer.id;

	const nextLayer = direction === 'up'
		? positions.slice(0, currentIndex).reverse().find((position) => position.layer !== current.layer || position.sectionId !== current.sectionId)
		: positions.slice(currentIndex + 1).find((position) => position.layer !== current.layer || position.sectionId !== current.sectionId);
	if (!nextLayer) return current.id;
	const candidates = positions.filter((position) => position.layer === nextLayer.layer && position.sectionId === nextLayer.sectionId);
	return candidates.reduce((best, candidate) =>
		Math.abs(candidate.column - current.column) < Math.abs(best.column - current.column) ? candidate : best,
	).id;
}
