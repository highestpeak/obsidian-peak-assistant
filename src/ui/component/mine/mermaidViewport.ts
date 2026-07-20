export interface MermaidViewport {
	scale: number;
	x: number;
	y: number;
}

export interface MermaidZoomAnchor {
	x: number;
	y: number;
}

export const MERMAID_MIN_SCALE = 0.35;
export const MERMAID_MAX_SCALE = 4;
export const MERMAID_SCALE_STEP = 0.2;
export const MERMAID_INITIAL_VIEWPORT: MermaidViewport = { scale: 1, x: 0, y: 0 };

export function clampMermaidScale(scale: number): number {
	return Math.min(MERMAID_MAX_SCALE, Math.max(MERMAID_MIN_SCALE, scale));
}

/**
 * Zoom while keeping the selected viewport coordinate under the cursor.
 * `anchor` is measured from the canvas centre, matching CSS transform-origin.
 */
export function zoomMermaidViewport(
	current: MermaidViewport,
	requestedScale: number,
	anchor?: MermaidZoomAnchor,
): MermaidViewport {
	const scale = clampMermaidScale(requestedScale);
	if (!anchor || scale === current.scale) return { ...current, scale };
	const ratio = scale / current.scale;
	return {
		scale,
		x: anchor.x - (anchor.x - current.x) * ratio,
		y: anchor.y - (anchor.y - current.y) * ratio,
	};
}

export function panMermaidViewport(
	current: MermaidViewport,
	deltaX: number,
	deltaY: number,
): MermaidViewport {
	return { ...current, x: current.x + deltaX, y: current.y + deltaY };
}
