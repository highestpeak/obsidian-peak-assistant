/**
 * Canvas drawing for graph: edges, nodes, labels. Pure drawing logic, no React.
 */

import type { GraphConfig } from '../../config';
import type { GraphVizLink, GraphVizNode } from '../../types';
import type { EdgeStyle } from '../../types';
import { linkKey } from '../../utils/link-key';
import { HOVER_DIM_OPACITY, NODE_ENTER_FADE_MS } from '../constants';
import { getNodeShapePath2D } from './shapeCache';

export type DrawGraphOptions = {
	ctx: CanvasRenderingContext2D;
	width: number;
	height: number;
	/** devicePixelRatio for sharp rendering on HiDPI. */
	dpr?: number;
	transform: { x: number; y: number; k: number };
	nodes: GraphVizNode[];
	links: GraphVizLink[];
	config: GraphConfig;
	getEdgeStyle: (e: { kind: string; weight: number }) => EdgeStyle;
	getNodeFill: (d: GraphVizNode) => string;
	getNodeLabel: (d: GraphVizNode, mode: 'full' | 'short') => string;
	normalizeNodeId: (id: string) => string;
	/** When set, dim non-neighbor nodes/links. */
	hoveredNodeId: string | null;
	neighborIds: Set<string>;
	highlightLinkKeys: Set<string>;
	/** When skeleton mode: link keys for leaf edges (keep semantic/physical style, not MST). */
	leafEdgeKeys?: Set<string>;
	/** When path mode: highlight path links and nodes with pathColor. */
	pathLinkKeys?: Set<string>;
	pathNodeIds?: Set<string>;
	pathColor?: string;
	/** When path select: node id chosen as start (show dashed ring for feedback). */
	pathStartId?: string | null;
};

const isPhysicalLink = (k: string) => k === 'path' || k === 'physical';

/** Read mindflow opacityHint from node/edge attributes (0–1). */
function mindflowOpacityHint(obj: { attributes?: Record<string, unknown> } | undefined): number | undefined {
	const mf = obj?.attributes && typeof obj.attributes === 'object' && (obj.attributes as any).mindflow;
	if (mf && typeof mf === 'object' && typeof (mf as any).opacityHint === 'number') {
		const v = (mf as any).opacityHint;
		return Math.max(0, Math.min(1, v));
	}
	return undefined;
}

/** Check if edge is main path from mindflow attributes. */
function isMindflowMain(l: GraphVizLink): boolean {
	const mf = l.attributes && typeof l.attributes === 'object' && (l.attributes as any).mindflow;
	return !!(mf && typeof mf === 'object' && (mf as any).main);
}
/** Non-semantic links (physical, path, wiki, file, etc.) use physical config styling. */
const isPhysicalLikeLink = (k: string) => k !== 'semantic';

function getLinkStroke(
	d: GraphVizLink,
	config: GraphConfig,
	getEdgeStyle: (e: { kind: string; weight: number }) => EdgeStyle,
	skeletonMode?: boolean,
	linkKeyVal?: string,
	leafEdgeKeys?: Set<string>
): string {
	// Non-MST edges in skeleton mode: dimmed (same stroke as semantic/physical)
	if (skeletonMode && !d.isMSTEdge) {
		return d.kind === 'semantic' ? config.semanticLinkStroke : isPhysicalLikeLink(d.kind) ? config.physicalLinkStroke : (getEdgeStyle({ kind: d.kind, weight: d.weight }).stroke ?? '#d1d5db');
	}
	// Backbone (MST, non-terminal) use MST style
	if (skeletonMode && (!leafEdgeKeys || !linkKeyVal || !leafEdgeKeys.has(linkKeyVal))) {
		return config.mstColor ?? '#374151';
	}
	return d.kind === 'semantic'
		? config.semanticLinkStroke
		: isPhysicalLikeLink(d.kind)
			? config.physicalLinkStroke
			: (getEdgeStyle({ kind: d.kind, weight: d.weight }).stroke ?? '#d1d5db');
}

function getLinkOpacity(
	d: GraphVizLink,
	config: GraphConfig,
	getEdgeStyle: (e: { kind: string; weight: number }) => EdgeStyle,
	highlighted: boolean,
	skeletonMode?: boolean,
	linkKeyVal?: string,
	leafEdgeKeys?: Set<string>
): number {
	const mfHint = mindflowOpacityHint(d);
	if (mfHint !== undefined) return highlighted ? 1 : mfHint;
	if (highlighted) return 1;
	if (skeletonMode && !d.isMSTEdge) return 0.2;
	// Backbone use MST opacity; terminal (leaf) use original
	if (skeletonMode) {
		const isLeaf = leafEdgeKeys != null && linkKeyVal != null && leafEdgeKeys.has(linkKeyVal);
		if (!isLeaf) return config.mstEdgeOpacity ?? 0.7;
	}
	return d.kind === 'semantic'
		? config.semanticEdgeOpacity
		: isPhysicalLikeLink(d.kind)
			? config.physicalEdgeOpacity
			: (getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeOpacity ?? 0.4);
}

function getLinkDash(
	d: GraphVizLink,
	config: GraphConfig,
	getEdgeStyle: (e: { kind: string; weight: number }) => EdgeStyle,
	skeletonMode?: boolean,
	linkKeyVal?: string,
	leafEdgeKeys?: Set<string>
): number[] | null {
	if (skeletonMode && !d.isMSTEdge) {
		return d.kind === 'semantic' ? (config.semanticEdgeStyle === 'dashed' ? [4, 3] : config.semanticEdgeStyle === 'dotted' ? [2, 2] : null) : (config.physicalEdgeStyle === 'dashed' ? [4, 3] : config.physicalEdgeStyle === 'dotted' ? [2, 2] : null);
	}
	if (skeletonMode && (!leafEdgeKeys || !linkKeyVal || !leafEdgeKeys.has(linkKeyVal))) {
		return config.mstEdgeStyle === 'dashed' ? [4, 3] : config.mstEdgeStyle === 'dotted' ? [2, 2] : null;
	}
	if (d.kind === 'semantic') {
		return config.semanticEdgeStyle === 'dashed' ? [4, 3] : config.semanticEdgeStyle === 'dotted' ? [2, 2] : null;
	}
	if (isPhysicalLikeLink(d.kind)) {
		return config.physicalEdgeStyle === 'dashed' ? [4, 3] : config.physicalEdgeStyle === 'dotted' ? [2, 2] : null;
	}
	const ds = getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeDasharray;
	if (!ds) return null;
	return ds.split(/\s+/).map(Number).filter((n) => !isNaN(n));
}

function getLinkWidth(
	l: GraphVizLink,
	config: GraphConfig,
	getEdgeStyle: (e: { kind: string; weight: number }) => EdgeStyle,
	skeletonMode?: boolean,
	linkKeyVal?: string,
	leafEdgeKeys?: Set<string>
): number {
	let base = getEdgeStyle({ kind: l.kind, weight: l.weight }).strokeWidth ?? 1;
	if (isMindflowMain(l)) base = Math.max(base, 2.5);
	if (skeletonMode && !l.isMSTEdge) {
		return l.kind === 'semantic' ? base * config.semanticEdgeWidthScale : isPhysicalLikeLink(l.kind) ? base * config.physicalEdgeWidthScale : base;
	}
	if (skeletonMode && (!leafEdgeKeys || !linkKeyVal || !leafEdgeKeys.has(linkKeyVal))) {
		return base * (config.mstWidthScale ?? 2.5);
	}
	return l.kind === 'semantic'
		? base * config.semanticEdgeWidthScale
		: isPhysicalLikeLink(l.kind)
			? base * config.physicalEdgeWidthScale
			: base;
}

export function drawGraph(opts: DrawGraphOptions): void {
	const { ctx, width, height, dpr = 1, transform, nodes, links, config, getEdgeStyle, getNodeFill, getNodeLabel, normalizeNodeId, hoveredNodeId, neighborIds, highlightLinkKeys, leafEdgeKeys, pathLinkKeys, pathNodeIds, pathColor, pathStartId } = opts;
	const { x: tx, y: ty, k } = transform;
	const hasPath = pathColor && pathLinkKeys && pathNodeIds && pathLinkKeys.size > 0;

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, width * dpr, height * dpr);
	ctx.setTransform(dpr * k, 0, 0, dpr * k, tx * dpr, ty * dpr);

	// 1. Edges: in skeleton mode draw backbone first (trunk), then terminal/branches so structure is clear
	const skeletonMode = config.skeletonMode ?? false;
	const drawOneLink = (l: GraphVizLink) => {
		const src = l.source as GraphVizNode;
		const tgt = l.target as GraphVizNode;
		const x1 = src.x ?? 0;
		const y1 = src.y ?? 0;
		const x2 = tgt.x ?? 0;
		const y2 = tgt.y ?? 0;
		const key = linkKey(l, normalizeNodeId);
		const onPath = hasPath && pathLinkKeys!.has(key);
		const highlighted = highlightLinkKeys.has(key);
		const opacity = hoveredNodeId == null ? getLinkOpacity(l, config, getEdgeStyle, false, skeletonMode, key, leafEdgeKeys) : (highlighted ? 1 : HOVER_DIM_OPACITY * getLinkOpacity(l, config, getEdgeStyle, false, skeletonMode, key, leafEdgeKeys));
		ctx.strokeStyle = onPath ? pathColor! : getLinkStroke(l, config, getEdgeStyle, skeletonMode, key, leafEdgeKeys);
		ctx.globalAlpha = onPath ? 1 : opacity;
		const baseWidth = getLinkWidth(l, config, getEdgeStyle, skeletonMode, key, leafEdgeKeys);
		ctx.lineWidth = (onPath ? Math.max(baseWidth, 3) : baseWidth) / k;
		const dash = onPath ? null : getLinkDash(l, config, getEdgeStyle, skeletonMode, key, leafEdgeKeys);
		if (dash) ctx.setLineDash(dash);
		else ctx.setLineDash([]);
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
	};
	if (skeletonMode && leafEdgeKeys && leafEdgeKeys.size > 0) {
		// Pass 1: backbone (non-terminal) edges
		for (const l of links) {
			const key = linkKey(l, normalizeNodeId);
			if (!leafEdgeKeys.has(key)) drawOneLink(l);
		}
		// Pass 2: terminal (branch) edges
		for (const l of links) {
			const key = linkKey(l, normalizeNodeId);
			if (leafEdgeKeys.has(key)) drawOneLink(l);
		}
	} else {
		for (const l of links) drawOneLink(l);
	}
	// Path edges drawn on top so they are always visible
	if (hasPath && pathLinkKeys && pathColor) {
		ctx.strokeStyle = pathColor;
		ctx.globalAlpha = 1;
		ctx.setLineDash([]);
		const pathLineWidth = Math.max(3, 4 / k);
		ctx.lineWidth = pathLineWidth;
		for (const l of links) {
			const key = linkKey(l, normalizeNodeId);
			if (!pathLinkKeys.has(key)) continue;
			const src = l.source as GraphVizNode;
			const tgt = l.target as GraphVizNode;
			ctx.beginPath();
			ctx.moveTo(src.x ?? 0, src.y ?? 0);
			ctx.lineTo(tgt.x ?? 0, tgt.y ?? 0);
			ctx.stroke();
		}
	}
	ctx.setLineDash([]);
	ctx.globalAlpha = 1;

	// 2. Nodes
	const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
	for (const d of nodes) {
		const nx = d.x ?? 0;
		const ny = d.y ?? 0;
		const r = d.r ?? 10;
		const dimmed = hoveredNodeId != null && !neighborIds.has(d.id);
		let alpha = dimmed ? HOVER_DIM_OPACITY : 1;
		if (d.enterTime != null) {
			const fade = Math.min(1, (now - d.enterTime) / NODE_ENTER_FADE_MS);
			alpha *= fade;
		}
		const mfHint = mindflowOpacityHint(d);
		if (mfHint !== undefined) alpha *= mfHint;
		ctx.globalAlpha = alpha;

		const fill = getNodeFill(d);
		const { path, kind, scale } = getNodeShapePath2D(d);

		ctx.save();
		ctx.translate(nx, ny);
		if ((kind === 'tag' || kind === 'concept') && scale != null) {
			ctx.scale(scale, scale);
			ctx.translate(-12, -12);
			ctx.fillStyle = fill;
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 2 / (scale * k);
			ctx.fill(path);
			ctx.stroke(path);
		} else {
			ctx.fillStyle = fill;
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 2 / k;
			ctx.fill(path);
			ctx.stroke(path);
		}
		ctx.restore();
		// Path result: solid ring around path nodes (pathNodeIds are in normalized id space)
		if (hasPath && pathNodeIds!.has(normalizeNodeId(d.id))) {
			ctx.save();
			ctx.strokeStyle = pathColor!;
			ctx.lineWidth = 2.5 / k;
			ctx.globalAlpha = 1;
			ctx.setLineDash([]);
			ctx.beginPath();
			ctx.arc(nx, ny, r + 4, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		}
		// Path select: dashed ring around start node (feedback before second click; compare normalized)
		if (pathStartId && pathColor && normalizeNodeId(d.id) === normalizeNodeId(pathStartId)) {
			ctx.save();
			ctx.strokeStyle = pathColor;
			ctx.lineWidth = 2 / k;
			ctx.globalAlpha = 1;
			ctx.setLineDash([6 / k, 4 / k]);
			ctx.beginPath();
			ctx.arc(nx, ny, r + 6, 0, Math.PI * 2);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.restore();
		}
	}
	ctx.globalAlpha = 1;

	// 3. Labels (font size scales with node radius so larger nodes get readable labels)
	ctx.textAlign = 'center';
	ctx.textBaseline = 'hanging';
	ctx.fillStyle = '#4b5563';
	const baseFontSize = 9;
	const minFontSize = 9;
	const maxFontSize = 16;
	const baseR = 10;
	for (const d of nodes) {
		const nx = d.x ?? 0;
		const ny = d.y ?? 0;
		const r = d.r ?? 10;
		const fontSize = Math.round(Math.min(maxFontSize, Math.max(minFontSize, baseFontSize + (r - baseR) * 0.45)));
		ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
		const dimmed = hoveredNodeId != null && !neighborIds.has(d.id);
		let alpha = dimmed ? HOVER_DIM_OPACITY : 1;
		if (d.enterTime != null) {
			const fade = Math.min(1, (now - d.enterTime) / NODE_ENTER_FADE_MS);
			alpha *= fade;
		}
		const mfHintLabels = mindflowOpacityHint(d);
		if (mfHintLabels !== undefined) alpha *= mfHintLabels;
		ctx.globalAlpha = alpha;
		const short = getNodeLabel(d, 'short');
		ctx.fillText(short, nx, ny + r + 12);
	}
	ctx.globalAlpha = 1;

	ctx.restore();
}
