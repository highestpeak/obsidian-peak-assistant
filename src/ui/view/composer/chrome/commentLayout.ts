export type CommentRailMode = 'rail' | 'drawer';

export interface CommentCardMetric {
	id: string;
	desiredTop: number;
	height: number;
}

export interface PositionedCommentCard extends CommentCardMetric {
	top: number;
}

export interface CommentConnectorPoints {
	sourceX: number;
	sourceY: number;
	cardX: number;
	cardY: number;
}

export function resolveCommentRailMode(hostWidth: number, breakpointPx: number): CommentRailMode {
	return hostWidth >= breakpointPx ? 'rail' : 'drawer';
}

/**
 * Route a document-to-comment connector without running the line through the
 * comment card. The final short horizontal segment makes the ownership of the
 * card unambiguous even when stacked threads move away from their source.
 */
export function commentConnectorPath(points: CommentConnectorPoints): string {
	const sourceX = finiteCoordinate(points.sourceX);
	const sourceY = finiteCoordinate(points.sourceY);
	const cardX = finiteCoordinate(points.cardX);
	const cardY = finiteCoordinate(points.cardY);
	const elbowX = Math.max(sourceX + 12, cardX - 22);
	return `M ${sourceX} ${sourceY} H ${elbowX} V ${cardY} H ${cardX}`;
}

/**
 * Keep cards close to their document anchor while preventing nearby threads
 * from overlapping. The result is deterministic and source-order stable.
 */
export function stackCommentCards(
	metrics: readonly CommentCardMetric[],
	gapPx = 12,
): PositionedCommentCard[] {
	const ordered = [...metrics].sort((a, b) =>
		a.desiredTop === b.desiredTop
			? a.id.localeCompare(b.id)
			: a.desiredTop - b.desiredTop);
	let cursor = 0;
	return ordered.map((metric) => {
		const height = Math.max(1, metric.height);
		const top = Math.max(metric.desiredTop, cursor);
		cursor = top + height + gapPx;
		return { ...metric, height, top };
	});
}

function finiteCoordinate(value: number): number {
	return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}
