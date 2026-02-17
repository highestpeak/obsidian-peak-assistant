/**
 * Transform helpers for canvas rendering: screen (pixel) <-> world (graph) coordinates.
 */

export type ZoomTransform = { x: number; y: number; k: number };

/** Convert world (graph) coords to screen (canvas pixel) coords. */
export function worldToScreen(
	tx: number,
	ty: number,
	k: number
): (wx: number, wy: number) => { x: number; y: number } {
	return (wx: number, wy: number) => ({
		x: wx * k + tx,
		y: wy * k + ty,
	});
}

/** Convert screen (canvas pixel) coords to world (graph) coords. */
export function screenToWorld(
	tx: number,
	ty: number,
	k: number
): (sx: number, sy: number) => { x: number; y: number } {
	return (sx: number, sy: number) => ({
		x: (sx - tx) / k,
		y: (sy - ty) / k,
	});
}
