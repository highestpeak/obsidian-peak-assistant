/**
 * Hit testing for canvas graph: find node under screen point.
 * Uses slightly enlarged hit radius (1.3x) for easier pointer targeting.
 */

import type { GraphVizNode } from '../../types';

const HIT_RADIUS_SCALE = 1.3;

export function hitTestNode(
	screenX: number,
	screenY: number,
	nodes: GraphVizNode[],
	toWorld: (sx: number, sy: number) => { x: number; y: number }
): GraphVizNode | null {
	const { x: wx, y: wy } = toWorld(screenX, screenY);
	let best: GraphVizNode | null = null;
	let bestDist = Infinity;
	for (const n of nodes) {
		const nx = n.x ?? 0;
		const ny = n.y ?? 0;
		const r = (n.r ?? 10) * HIT_RADIUS_SCALE;
		const dx = wx - nx;
		const dy = wy - ny;
		const d = Math.sqrt(dx * dx + dy * dy);
		if (d <= r && d < bestDist) {
			bestDist = d;
			best = n;
		}
	}
	return best;
}
