import type { CommandCenterLayer, ResolvedCommandCenterItem } from './types';

export interface CommandCenterProjection {
	destinations: ResolvedCommandCenterItem[];
	grid: ResolvedCommandCenterItem[];
	overflow: ResolvedCommandCenterItem[];
}

export function projectCommandCenterItems(items: ResolvedCommandCenterItem[]): CommandCenterProjection {
	const destinations: ResolvedCommandCenterItem[] = [];
	const commands: ResolvedCommandCenterItem[] = [];
	for (const item of items) {
		if (item.layer === 'destination') destinations.push(item);
		else commands.push(item);
	}
	return {
		destinations,
		grid: commands.slice(0, 10),
		overflow: commands.slice(10),
	};
}

export interface ProjectionPosition {
	id: string;
	layer: CommandCenterLayer | 'overflow';
	column: number;
	columns: number;
}

export function buildProjectionPositions(projection: CommandCenterProjection): ProjectionPosition[] {
	return [
		...projection.destinations.map((item, index) => ({ id: item.id, layer: 'destination' as const, column: index % 4, columns: 4 })),
		...projection.grid.map((item, index) => ({ id: item.id, layer: 'command' as const, column: index % 5, columns: 5 })),
		...projection.overflow.map((item) => ({ id: item.id, layer: 'overflow' as const, column: 0, columns: 1 })),
	];
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
	if (sameLayer?.layer === current.layer) return sameLayer.id;

	const nextLayer = direction === 'up'
		? positions.slice(0, currentIndex).reverse().find((position) => position.layer !== current.layer)
		: positions.slice(currentIndex + 1).find((position) => position.layer !== current.layer);
	if (!nextLayer) return current.id;
	const candidates = positions.filter((position) => position.layer === nextLayer.layer);
	return candidates.reduce((best, candidate) =>
		Math.abs(candidate.column - current.column) < Math.abs(best.column - current.column) ? candidate : best,
	).id;
}
