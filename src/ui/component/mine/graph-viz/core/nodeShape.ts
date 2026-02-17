/**
 * Pure node shape geometry. No D3, no DOM.
 * Returns SVG path `d` for non-circle types; circle and tag are handled by caller.
 */

import type { GraphVizNode } from '../types';

/**
 * Path d for non-circle node types. Tag returns null (caller uses icon).
 * Topic = diamond; concept = triangle; document/default = circle (caller uses circle).
 */
export function getNodeShapePath(d: GraphVizNode): string | null {
	const r = d.r ?? 10;
	const t = (d.type || 'document').toLowerCase();
	if (t === 'tag') return null;
	if (t === 'topic') return `M0,${-r} L${r},0 L0,${r} L${-r},0Z`;
	if (t === 'concept') return `M0,${-r} L${r},${r} L${-r},${r}Z`;
	return null;
}
