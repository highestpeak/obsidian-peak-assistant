/**
 * Pure bounds and fit-to-view transform. No D3, no DOM.
 */

import type { GraphVizNode } from '../types';

export type Bounds = {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
};

/**
 * Compute axis-aligned bounds of nodes that have x/y.
 * Returns infinite bounds if no valid node.
 */
export function computeNodeBounds(nodes: GraphVizNode[]): Bounds | null {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const n of nodes) {
		if (n.x != null && n.y != null) {
			minX = Math.min(minX, n.x);
			maxX = Math.max(maxX, n.x);
			minY = Math.min(minY, n.y);
			maxY = Math.max(maxY, n.y);
		}
	}
	if (minX === Infinity || maxX === -Infinity) return null;
	return { minX, maxX, minY, maxY };
}

export type FitTransform = {
	scale: number;
	translateX: number;
	translateY: number;
};

/**
 * Compute scale and translate to fit bounds into container with padding.
 * scale clamped to [minScale, maxScale]. minScale avoids over-zoom-out; maxScale allows zoom-in for compact graphs.
 */
export function computeFitTransform(
	bounds: Bounds,
	containerWidth: number,
	containerHeight: number,
	options: { padding?: number; minScale?: number; maxScale?: number } = {}
): FitTransform {
	const { padding = 40, minScale = 0.08, maxScale = 5 } = options;
	const boundsWidth = bounds.maxX - bounds.minX;
	const boundsHeight = bounds.maxY - bounds.minY;
	const boundsCenterX = (bounds.minX + bounds.maxX) / 2;
	const boundsCenterY = (bounds.minY + bounds.maxY) / 2;
	const scaleX = (containerWidth - padding * 2) / boundsWidth;
	const scaleY = (containerHeight - padding * 2) / boundsHeight;
	const scale = Math.max(minScale, Math.min(scaleX, scaleY, maxScale));
	const translateX = containerWidth / 2 - boundsCenterX * scale;
	const translateY = containerHeight / 2 - boundsCenterY * scale;
	return { scale, translateX, translateY };
}
