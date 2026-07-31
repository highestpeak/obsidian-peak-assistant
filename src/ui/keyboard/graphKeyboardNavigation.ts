export interface GraphPoint {
	id: string;
	x: number;
	y: number;
}

/**
 * Pick the visually nearest graph node inside the requested half-plane.
 * Perpendicular drift is weighted so keyboard movement follows rows/columns
 * before jumping to a diagonally closer but visually surprising node.
 */
export function findDirectionalGraphNode(
	current: GraphPoint,
	candidates: GraphPoint[],
	direction: 'left' | 'right' | 'up' | 'down',
): string | null {
	const ranked = candidates
		.filter((candidate) => candidate.id !== current.id)
		.map((candidate) => {
			const dx = candidate.x - current.x;
			const dy = candidate.y - current.y;
			const primary = direction === 'left' ? -dx
				: direction === 'right' ? dx
					: direction === 'up' ? -dy
						: dy;
			if (primary <= 0) return null;
			const perpendicular = direction === 'left' || direction === 'right'
				? Math.abs(dy)
				: Math.abs(dx);
			return {
				id: candidate.id,
				score: primary + perpendicular * 1.8,
			};
		})
		.filter((candidate): candidate is { id: string; score: number } => Boolean(candidate))
		.sort((left, right) => left.score - right.score);
	return ranked[0]?.id ?? null;
}
