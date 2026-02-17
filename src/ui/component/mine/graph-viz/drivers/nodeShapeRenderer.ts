/**
 * D3-driven node shape rendering: append circle, path, or Lucide tag icon into node g.
 * Isolates D3 selection and DOM mutation from React and business logic.
 */

import * as d3Selection from 'd3-selection';
import { icons } from 'lucide';
import type { GraphVizNode } from '../types';
import { getNodeShapePath } from '../core/nodeShape';
import { LUCIDE_VIEWBOX } from '../core/constants';

const LUCIDE_TAG_ICON = icons.Tag as Array<[string, Record<string, string>]>;

/**
 * Append Lucide Tag icon into node g; scale to fit node radius.
 */
export function appendLucideTagIcon(
	g: d3Selection.Selection<SVGGElement, unknown, null, undefined>,
	d: GraphVizNode,
	fill: string
): void {
	const r = d.r ?? 10;
	const scale = (2 * r) / LUCIDE_VIEWBOX;
	const iconG = g.append('g').attr('class', 'lucide-icon').attr('transform', `scale(${scale}) translate(-12,-12)`);
	for (const [tag, attrs] of LUCIDE_TAG_ICON) {
		const el = iconG.append(tag);
		Object.entries(attrs).forEach(([key, value]) => {
			if (key === 'key') return;
			if (key === 'fill' || key === 'stroke') el.attr(key, fill);
			else el.attr(key, value);
		});
		el.attr('stroke', '#fff').attr('stroke-width', 2);
	}
}

/**
 * Append shape (circle, path, or Lucide icon) into node g.
 * Used on enter and as fallback when shape is missing.
 */
export function appendNodeShapeContent(
	g: d3Selection.Selection<SVGGElement, unknown, null, undefined>,
	d: GraphVizNode,
	fill: string
): void {
	const t = (d.type || 'document').toLowerCase();
	if (t === 'tag') {
		appendLucideTagIcon(g, d, fill);
	} else {
		const pathD = getNodeShapePath(d);
		if (pathD != null) {
			g.append('path')
				.attr('class', 'node-shape-path')
				.attr('d', pathD)
				.attr('stroke', '#fff')
				.attr('stroke-width', 2)
				.attr('fill', fill);
		} else {
			g.append('circle')
				.attr('class', 'node-shape-circle')
				.attr('r', d.r)
				.attr('stroke', '#fff')
				.attr('stroke-width', 2)
				.attr('fill', fill);
		}
	}
}
