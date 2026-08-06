import type { ResolvedCommandCenterDisplayMode } from './types';

export const COMMAND_CENTER_GRID_COLUMNS = 30;
export const COMMAND_CENTER_GRID_GAP = 4;
/**
 * Non-label width reserved by an automatic launcher card. This includes the
 * optional leading icon, grid gaps, horizontal padding, Auto/hotkey metadata,
 * the drag affordance, and enough clearance for the hover menu trigger.
 */
export const COMMAND_CENTER_AUTO_TRAILING_WIDTH = 96;

export interface CommandCenterProjectionItem {
	id: string;
	mode: ResolvedCommandCenterDisplayMode;
}

export interface CommandCenterProjectionSection {
	sectionId: string;
	items: CommandCenterProjectionItem[];
}

export interface ProjectionPosition {
	id: string;
	sectionId: string;
	row: number;
	rowSpan: number;
	column: number;
	columnSpan: number;
}

export function commandCenterGridSpan(mode: ResolvedCommandCenterDisplayMode): { columnSpan: number; rowSpan: number } {
	if (mode === 'icon') return { columnSpan: 6, rowSpan: 2 };
	if (mode === 'compact') return { columnSpan: 10, rowSpan: 1 };
	if (mode === 'wide') return { columnSpan: 15, rowSpan: 1 };
	return { columnSpan: 30, rowSpan: 1 };
}

export function resolveAutoCommandCenterDisplayMode(
	textWidth: number,
	gridWidth: number,
): ResolvedCommandCenterDisplayMode {
	const compactBudget = gridWidth / 3 - COMMAND_CENTER_AUTO_TRAILING_WIDTH;
	if (textWidth <= compactBudget) return 'compact';
	const wideBudget = gridWidth / 2 - COMMAND_CENTER_AUTO_TRAILING_WIDTH;
	if (textWidth <= wideBudget) return 'wide';
	return 'full';
}

function canPlace(
	occupied: boolean[][],
	row: number,
	column: number,
	columnSpan: number,
	rowSpan: number,
): boolean {
	if (column + columnSpan > COMMAND_CENTER_GRID_COLUMNS) return false;
	for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
		const occupiedRow = occupied[row + rowOffset] ?? [];
		for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
			if (occupiedRow[column + columnOffset]) return false;
		}
	}
	return true;
}

function occupy(
	occupied: boolean[][],
	row: number,
	column: number,
	columnSpan: number,
	rowSpan: number,
): void {
	for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
		const occupiedRow = occupied[row + rowOffset] ?? [];
		occupied[row + rowOffset] = occupiedRow;
		for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
			occupiedRow[column + columnOffset] = true;
		}
	}
}

export function buildProjectionPositions(sections: CommandCenterProjectionSection[]): ProjectionPosition[] {
	const positions: ProjectionPosition[] = [];
	let rowOffset = 0;
	for (const section of sections) {
		const occupied: boolean[][] = [];
		for (const item of section.items) {
			const { columnSpan, rowSpan } = commandCenterGridSpan(item.mode);
			let row = 0;
			let column = 0;
			while (!canPlace(occupied, row, column, columnSpan, rowSpan)) {
				column += 1;
				if (column >= COMMAND_CENTER_GRID_COLUMNS) {
					row += 1;
					column = 0;
				}
			}
			occupy(occupied, row, column, columnSpan, rowSpan);
			positions.push({ id: item.id, sectionId: section.sectionId, row: row + rowOffset, rowSpan, column, columnSpan });
		}
		const sectionRows = positions
			.filter((position) => position.sectionId === section.sectionId)
			.reduce((maximum, position) => Math.max(maximum, position.row - rowOffset + position.rowSpan), 0);
		rowOffset += sectionRows + 1;
	}
	return positions;
}

function center(position: ProjectionPosition): { x: number; y: number } {
	return {
		x: position.column + position.columnSpan / 2,
		y: position.row + position.rowSpan / 2,
	};
}

export function moveProjectionFocus(
	positions: ProjectionPosition[],
	currentId: string | null,
	direction: 'left' | 'right' | 'up' | 'down',
): string | null {
	if (positions.length === 0) return null;
	const current = positions.find((position) => position.id === currentId) ?? positions[0]!;
	const origin = center(current);
	const candidates = positions.filter((position) => {
		if (position.id === current.id) return false;
		const candidate = center(position);
		if (direction === 'left') return candidate.x < origin.x;
		if (direction === 'right') return candidate.x > origin.x;
		if (direction === 'up') return candidate.y < origin.y;
		return candidate.y > origin.y;
	});
	if (candidates.length === 0) return current.id;
	return candidates.reduce((best, candidate) => {
		const bestCenter = center(best);
		const candidateCenter = center(candidate);
		const bestPrimary = direction === 'left' || direction === 'right'
			? Math.abs(bestCenter.x - origin.x)
			: Math.abs(bestCenter.y - origin.y);
		const candidatePrimary = direction === 'left' || direction === 'right'
			? Math.abs(candidateCenter.x - origin.x)
			: Math.abs(candidateCenter.y - origin.y);
		const bestSecondary = direction === 'left' || direction === 'right'
			? Math.abs(bestCenter.y - origin.y)
			: Math.abs(bestCenter.x - origin.x);
		const candidateSecondary = direction === 'left' || direction === 'right'
			? Math.abs(candidateCenter.y - origin.y)
			: Math.abs(candidateCenter.x - origin.x);
		return candidatePrimary * 4 + candidateSecondary < bestPrimary * 4 + bestSecondary ? candidate : best;
	}).id;
}
