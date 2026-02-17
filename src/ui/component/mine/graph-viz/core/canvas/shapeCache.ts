/**
 * Path2D cache for node shapes (circle, diamond, triangle) and Lucide Tag icon.
 * Avoids per-frame Path2D allocations.
 */

import { icons } from 'lucide';
import type { GraphVizNode } from '../../types';
import { LUCIDE_VIEWBOX } from '../constants';

const LUCIDE_TAG_ICON = icons.Tag as Array<[string, Record<string, string>]>;

const shapeCache = new Map<string, Path2D>();

function getOrCreatePath2D(key: string, factory: () => Path2D): Path2D {
	let p = shapeCache.get(key);
	if (!p) {
		p = factory();
		shapeCache.set(key, p);
	}
	return p;
}

/** Circle path centered at 0,0 with radius r. */
function circlePath(r: number): Path2D {
	return getOrCreatePath2D(`circle-${r}`, () => {
		const p = new Path2D();
		p.arc(0, 0, r, 0, Math.PI * 2);
		return p;
	});
}

/** Diamond (topic) path. */
function diamondPath(r: number): Path2D {
	return getOrCreatePath2D(`diamond-${r}`, () => {
		const p = new Path2D();
		p.moveTo(0, -r);
		p.lineTo(r, 0);
		p.lineTo(0, r);
		p.lineTo(-r, 0);
		p.closePath();
		return p;
	});
}

/** Triangle (concept) path. */
function trianglePath(r: number): Path2D {
	return getOrCreatePath2D(`triangle-${r}`, () => {
		const p = new Path2D();
		p.moveTo(0, -r);
		p.lineTo(r, r);
		p.lineTo(-r, r);
		p.closePath();
		return p;
	});
}

let cachedTagPath: Path2D | null = null;

function getTagIconPath(): Path2D {
	if (cachedTagPath) return cachedTagPath;
	const p = new Path2D();
	for (const item of LUCIDE_TAG_ICON) {
		const tag = item[0];
		const attrs = (item as [string, Record<string, string>])[1] ?? {};
		if (tag === 'path' && attrs.d) p.addPath(new Path2D(attrs.d));
		if (tag === 'circle' && attrs.cx != null && attrs.cy != null && attrs.r != null) {
			const cx = parseFloat(attrs.cx);
			const cy = parseFloat(attrs.cy);
			const r = parseFloat(attrs.r);
			p.arc(cx, cy, r, 0, Math.PI * 2);
		}
	}
	cachedTagPath = p;
	return p;
}

export type NodeShapeKind = 'circle' | 'diamond' | 'triangle' | 'tag';

export function getNodeShapePath2D(d: GraphVizNode): { path: Path2D; kind: NodeShapeKind; scale?: number } {
	const r = d.r ?? 10;
	const t = (d.type || 'document').toLowerCase();
	if (t === 'tag') {
		const scale = (2 * r) / LUCIDE_VIEWBOX;
		return { path: getTagIconPath(), kind: 'tag', scale };
	}
	if (t === 'topic') return { path: diamondPath(r), kind: 'diamond' };
	if (t === 'concept') return { path: trianglePath(r), kind: 'triangle' };
	return { path: circlePath(r), kind: 'circle' };
}

/** Clear cache when config changes (e.g. radius scale). Call rarely. */
export function clearShapeCache(): void {
	shapeCache.clear();
}
