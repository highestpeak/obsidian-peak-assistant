export interface GraphViewport {
	zoom: number;
	pan: Point;
}

export interface GraphInlineViewportSnapshot {
	projectionKey: string;
	viewport: GraphViewport;
}

export function resolveInlineViewportRestore(input: {
	snapshot: GraphInlineViewportSnapshot | null;
	currentProjectionKey: string;
}): GraphViewport | null {
	const { snapshot, currentProjectionKey } = input;
	if (!snapshot || snapshot.projectionKey !== currentProjectionKey) return null;
	return {
		zoom: snapshot.viewport.zoom,
		pan: { ...snapshot.viewport.pan },
	};
}

export function updateGraphSelection(
	current: readonly string[],
	nodeId: string,
	additive: boolean,
): string[] {
	if (!additive) return [nodeId];
	if (current.includes(nodeId)) return current.filter((id) => id !== nodeId);
	return [...current, nodeId];
}

export function retainGraphSelection(
	current: readonly string[],
	availableNodeIds: ReadonlySet<string>,
): string[] {
	return current.filter((id) => availableNodeIds.has(id));
}

export type GraphEscapeAction = 'inspect-card' | 'node-list' | 'fullscreen' | null;

export function resolveGraphEscapeAction(state: {
	inspectCardOpen: boolean;
	nodeListOpen: boolean;
	fullscreen: boolean;
}): GraphEscapeAction {
	if (state.inspectCardOpen) return 'inspect-card';
	if (state.nodeListOpen) return 'node-list';
	if (state.fullscreen) return 'fullscreen';
	return null;
}

interface Point {
	x: number;
	y: number;
}

interface Size {
	width: number;
	height: number;
}

export interface GraphInspectCardPlacement {
	left: number;
	top: number;
	side: 'left' | 'right';
}

const CARD_VIEWPORT_MARGIN = 12;

export function placeGraphInspectCard(input: {
	anchor: Point;
	connectedPoints: readonly Point[];
	viewport: Size;
	card: Size;
	offset: number;
}): GraphInspectCardPlacement {
	const { anchor, connectedPoints, viewport, card, offset } = input;
	const connectionsOnLeft = connectedPoints.filter((point) => point.x < anchor.x).length;
	const connectionsOnRight = connectedPoints.length - connectionsOnLeft;
	const roomOnLeft = anchor.x - offset - CARD_VIEWPORT_MARGIN;
	const roomOnRight = viewport.width - anchor.x - offset - CARD_VIEWPORT_MARGIN;
	const leftFits = roomOnLeft >= card.width;
	const rightFits = roomOnRight >= card.width;

	let side: GraphInspectCardPlacement['side'];
	if (leftFits && !rightFits) side = 'left';
	else if (rightFits && !leftFits) side = 'right';
	else if (connectionsOnRight !== connectionsOnLeft) {
		side = connectionsOnRight > connectionsOnLeft ? 'left' : 'right';
	} else {
		side = roomOnRight >= roomOnLeft ? 'right' : 'left';
	}

	const desiredLeft = side === 'left'
		? anchor.x - offset - card.width
		: anchor.x + offset;
	const maximumLeft = Math.max(CARD_VIEWPORT_MARGIN, viewport.width - card.width - CARD_VIEWPORT_MARGIN);
	const left = Math.min(Math.max(CARD_VIEWPORT_MARGIN, desiredLeft), maximumLeft);
	const belowTop = anchor.y + offset;
	const desiredTop = belowTop + card.height <= viewport.height - CARD_VIEWPORT_MARGIN
		? belowTop
		: anchor.y - card.height - offset;
	const maximumTop = Math.max(CARD_VIEWPORT_MARGIN, viewport.height - card.height - CARD_VIEWPORT_MARGIN);
	const top = Math.min(Math.max(CARD_VIEWPORT_MARGIN, desiredTop), maximumTop);

	return { left, top, side };
}

export function centerViewportOnSameModelPoint(input: {
	viewport: GraphViewport;
	before: Size;
	after: Size;
}): GraphViewport {
	const { viewport, before, after } = input;
	const modelCenter = {
		x: (before.width / 2 - viewport.pan.x) / viewport.zoom,
		y: (before.height / 2 - viewport.pan.y) / viewport.zoom,
	};
	return {
		zoom: viewport.zoom,
		pan: {
			x: after.width / 2 - modelCenter.x * viewport.zoom,
			y: after.height / 2 - modelCenter.y * viewport.zoom,
		},
	};
}
