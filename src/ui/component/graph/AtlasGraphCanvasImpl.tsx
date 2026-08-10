/**
 * Shared cytoscape graph canvas.
 *
 * The single graph renderer for the plugin. Extracted from the Vault Search
 * Result Graph so File Atlas's read-only document-neighborhood graph reuses the
 * exact same rendering stack (spec Decision 2026-07-09: "reuse the Vault Search
 * Result Graph View rendering stack … do NOT build a second graph renderer").
 *
 * Feature parity with the 2026-07-07 sandbox: 5 presets (Constellation / Flow ↓
 * / Flow → / Folder tree / Orbit), full-depth vertical folder-tree projection,
 * isolated grid, hover neighborhood + ancestor spotlight with marching-ants on
 * semantic edges, and copy-as-Mermaid / copy-as-image.
 *
 * This component is data-source agnostic: it takes a {@link ResultSubgraphOutput}
 * plus a preset + semantic toggle and emits generic node events. Search-specific
 * concerns (behavior recorder, hub subview, inspector selection) live in the
 * caller.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core, EdgeSingular, ElementDefinition, NodeSingular } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import cise from 'cytoscape-cise';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';
import { Check, Image as ImageIcon, List, PanelRightOpen, Workflow } from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';
import { Button } from '@/ui/component/shared-ui/button';
import { GraphSemanticToggle } from './GraphSemanticToggle';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import { coalesceGraphEdges } from '@/core/types/graph-edge';
import {
	buildVisibleFolderTree,
	folderTreeSelectionScope,
	toggleFolderTreeSelection,
	type VisibleFolderTreeProjection,
} from './folderTreeModel';
import {
	buildFolderTreeLayout,
	FOLDER_TREE_LAYOUT_DEFAULTS,
} from './folderTreeLayoutModel';
import { findDirectionalGraphNode } from '@/ui/keyboard/graphKeyboardNavigation';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_KEYBOARD_A11Y_STRINGS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

// ─── One-time Cytoscape extension registration ──────────────────────────────
let extensionsRegistered = false;
function ensureExtensionsRegistered(): void {
	if (extensionsRegistered) return;
	cytoscape.use(fcose as never);
	cytoscape.use(cise as never);
	cytoscape.use(cola as never);
	cytoscape.use(dagre as never);
	extensionsRegistered = true;
}

// ─── Presets ────────────────────────────────────────────────────────────────
export type AtlasGraphPreset = 'constellation' | 'flow-tb' | 'flow-lr' | 'folder' | 'orbit';

interface PresetBundle {
	layout: 'fcose' | 'cola' | 'dagre-tb' | 'dagre-lr' | 'concentric-hub' | 'folder-tree';
	folderTree: boolean;
}
const PRESETS: Record<AtlasGraphPreset, PresetBundle> = {
	constellation: { layout: 'fcose',          folderTree: false },
	'flow-tb':     { layout: 'dagre-tb',       folderTree: false },
	'flow-lr':     { layout: 'dagre-lr',       folderTree: false },
	folder:        { layout: 'folder-tree',    folderTree: true },
	orbit:         { layout: 'concentric-hub', folderTree: false },
};

/**
 * Turn subgraph → cytoscape elements. Physical reference and Hub membership
 * edges both establish visible structure; semantic edges remain optional.
 */
function buildElements(
	sub: ResultSubgraphOutput,
	opts: { showSemantic: boolean; folderTree: boolean },
): ElementDefinition[] {
	const els: ElementDefinition[] = [];
	const visibleEdges = coalesceGraphEdges(
		sub.edges.filter((edge) => (
			(edge.kind !== 'semantic' || opts.showSemantic)
			&& edge.from !== edge.to
		)),
	);
	const degreeMap = new Map<string, number>();
	for (const edge of visibleEdges) {
		degreeMap.set(edge.from, (degreeMap.get(edge.from) ?? 0) + 1);
		degreeMap.set(edge.to, (degreeMap.get(edge.to) ?? 0) + 1);
	}

	const folderTree = opts.folderTree ? buildVisibleFolderTree(sub.resultNodes) : null;
	const folderTreeLayout = folderTree
		? buildFolderTreeLayout(folderTree, {
			labelById: new Map(sub.resultNodes.map((node) => [
				node.id,
				node.title || node.path || node.id,
			])),
			linkCountByDocumentId: degreeMap,
		})
		: null;
	const folderTreePositions = new Map<string, { x: number; y: number }>();
	if (folderTreeLayout) {
		for (const row of folderTreeLayout.rows) {
			folderTreePositions.set(row.id, { x: row.centerX, y: row.centerY });
		}
		const lastRow = folderTreeLayout.rows[folderTreeLayout.rows.length - 1];
		const hubStartY = (lastRow?.top ?? FOLDER_TREE_LAYOUT_DEFAULTS.originY)
			+ (lastRow?.height ?? 0)
			+ FOLDER_TREE_LAYOUT_DEFAULTS.rootSectionGap
			+ FOLDER_TREE_LAYOUT_DEFAULTS.rowStep;
		sub.hubAnchors.forEach((hub, index) => {
			folderTreePositions.set(hub.id, {
				x: FOLDER_TREE_LAYOUT_DEFAULTS.originX + 110,
				y: hubStartY + index * FOLDER_TREE_LAYOUT_DEFAULTS.rowStep,
			});
		});
	}

	const refEndpoints = new Set<string>();
	for (const e of visibleEdges) {
		if (e.kind !== 'reference' && e.kind !== 'hub_constituent') continue;
		refEndpoints.add(e.from);
		refEndpoints.add(e.to);
	}
	const isolatedIds = new Set<string>(
		sub.resultNodes.filter((n) => !refEndpoints.has(n.id)).map((n) => n.id),
	);

	if (folderTree) {
		for (const folder of folderTree.folders) {
			const visual = folderTreeLayout?.rowById.get(folder.id);
			if (!visual) continue;
			els.push({
				group: 'nodes',
				data: {
					id: folder.id,
					label: folder.label,
					path: folder.path,
					kind: 'folderGroup',
					depth: folder.depth,
					documentIds: folder.documentIds,
					nodeWidth: visual.width,
					nodeHeight: visual.height,
				},
				classes: `folderGroup folderTreeNode${folder.depth === 0 ? ' folderRoot' : ''}`,
				position: folderTreePositions.get(folder.id),
				locked: true,
			});
		}
	}

	const DEGREE_CAP = 8;
	const HUBLIKE_THRESHOLD = 3;
	const normDegree = (id: string) => Math.min(degreeMap.get(id) ?? 0, DEGREE_CAP) / DEGREE_CAP;

	const maxScore = sub.resultNodes.reduce((m, n) => Math.max(m, n.score), 0) || 1;
	for (const h of sub.hubAnchors) {
		els.push({
			group: 'nodes',
			data: { id: h.id, label: `${h.title || h.path || h.id}\n(${h.constituentCount} constituents)`, path: h.path ?? '', kind: 'hub', score: 1, degreeNorm: normDegree(h.id) },
			classes: `hub${folderTree ? ' folderTreeHub' : ''}`,
			position: folderTreePositions.get(h.id),
		});
	}
	for (const n of sub.resultNodes) {
		const degree = degreeMap.get(n.id) ?? 0;
		const isHublike = !folderTree && degree >= HUBLIKE_THRESHOLD;
		const visual = folderTreeLayout?.rowById.get(n.id);
		els.push({
			group: 'nodes',
			data: {
				id: n.id,
				label: n.title || n.path || n.id,
				path: n.path ?? '',
				kind: 'doc',
				score: n.score / maxScore,
				degree,
				degreeNorm: normDegree(n.id),
				folder: (n.path ? n.path.split('/')[0] : '') || '',
				nodeWidth: visual?.width,
				nodeHeight: visual?.height,
			},
			classes: `doc ${isolatedIds.has(n.id) ? 'isolated' : ''}${isHublike ? ' hublike' : ''}${folderTree ? ' folderTreeDoc' : ''}`.trim(),
			position: folderTreePositions.get(n.id),
			locked: Boolean(folderTree),
		});
	}

	if (folderTreeLayout) {
		for (const row of folderTreeLayout.rows) {
			const labelWidth = Math.max(24, row.width - row.badgeWidth - 40);
			const labelLeft = row.left + 28;
			const decorationBase = {
				ownerId: row.id,
				ownerKind: row.kind,
			};
			els.push({
				group: 'nodes',
				data: {
					id: `tree-icon:${row.id}`,
					...decorationBase,
				},
				classes: `folderTreeDecoration folderTreeIcon ${row.kind === 'folder' ? 'folderTreeFolderIcon' : 'folderTreeFileIcon'}`,
				position: { x: row.left + 15, y: row.centerY },
				locked: true,
				selectable: false,
				grabbable: false,
			});
			els.push({
				group: 'nodes',
				data: {
					id: `tree-label:${row.id}`,
					...decorationBase,
					label: row.label,
					labelWidth,
				},
				classes: `folderTreeDecoration folderTreeLabel ${row.kind === 'folder' ? 'folderTreeFolderLabel' : 'folderTreeFileLabel'}`,
				position: { x: labelLeft + labelWidth / 2, y: row.centerY },
				locked: true,
				selectable: false,
				grabbable: false,
			});
			els.push({
				group: 'nodes',
				data: {
					id: `tree-badge:${row.id}`,
					...decorationBase,
					label: String(row.count),
					badgeWidth: row.badgeWidth,
				},
				classes: `folderTreeDecoration ${row.kind === 'folder' ? 'folderTreeCountBadge' : 'folderTreeLinkBadge'}${row.root ? ' folderTreeRootBadge' : ''}`,
				position: {
					x: row.left + row.width - row.badgeWidth / 2 - 6,
					y: row.centerY,
				},
				locked: true,
				selectable: false,
				grabbable: false,
			});
		}

		for (const point of folderTreeLayout.railPoints) {
			els.push({
				group: 'nodes',
				data: {
					id: point.id,
					parentNodeId: point.parentId,
					childNodeId: point.childId ?? '',
				},
				classes: 'folderTreeRailNode',
				position: { x: point.x, y: point.y },
				locked: true,
				selectable: false,
				grabbable: false,
			});
		}
		for (const segment of folderTreeLayout.railSegments) {
			els.push({
				group: 'edges',
				data: {
					id: segment.id,
					source: segment.sourceId,
					target: segment.targetId,
					kind: 'hierarchy',
					directionality: 'undirected',
					parentNodeId: segment.parentId,
					childNodeId: segment.childId,
				},
				classes: `hierarchy folderHierarchy folderHierarchy${segment.kind === 'rail' ? 'Rail' : 'Branch'}`,
			});
		}
	}

	const seen = new Set<string>();
	visibleEdges.forEach((e, index) => {
		const key = `${e.kind}|${e.directionality}|${e.from}|${e.to}`;
		if (seen.has(key)) return;
		seen.add(key);
		const sourcePosition = folderTreePositions.get(e.from);
		const targetPosition = folderTreePositions.get(e.to);
		const verticalDistance = sourcePosition && targetPosition
			? Math.abs(targetPosition.y - sourcePosition.y)
			: 0;
		const arcDepth = Math.min(240, Math.max(100, 88 + verticalDistance * 0.22 + (index % 5) * 14));
		const curveDistance = sourcePosition && targetPosition && targetPosition.y >= sourcePosition.y
			? -arcDepth
			: arcDepth;
		els.push({
			group: 'edges',
			data: {
				id: key,
				source: e.from,
				target: e.to,
				kind: e.kind,
				directionality: e.directionality,
				curveDistance,
			},
			classes: `${e.kind}${folderTree ? ' folderRelation' : ''}`,
		});
	});

	return els;
}

function graphIconDataUri(paths: string, color: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const FOLDER_ICON_PURPLE = graphIconDataUri(
	'<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"/>',
	'#7c3aed',
);
const FOLDER_ICON_WHITE = graphIconDataUri(
	'<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"/>',
	'#ffffff',
);
const FILE_ICON_NEUTRAL = graphIconDataUri(
	'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
	'#8a8490',
);
const FILE_ICON_WHITE = graphIconDataUri(
	'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
	'#ffffff',
);
const LINK_ICON_NEUTRAL = graphIconDataUri(
	'<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
	'#88818e',
);
const LINK_ICON_PURPLE = graphIconDataUri(
	'<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
	'#6937ad',
);
const LINK_ICON_WHITE = graphIconDataUri(
	'<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
	'#ffffff',
);

// ─── Style — mirrors the sandbox's CSS spec ────────────────────────────────
const CYTOSCAPE_STYLES: cytoscape.Stylesheet[] = [
	{ selector: 'node.hub', style: { 'background-color': '#a78bfa', 'border-color': '#4c1d95', 'border-width': 4, shape: 'round-rectangle', width: 'label', height: 'label', 'padding-left': '18px', 'padding-right': '18px', 'padding-top': '12px', 'padding-bottom': '12px', label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '360px', 'font-size': 15, 'font-weight': 800, 'text-valign': 'center', 'text-halign': 'center', color: '#2e1065' } as never },
	{ selector: 'node.doc', style: { 'background-color': 'mapData(score, 0, 1, #f5f3ff, #c4b5fd)', 'border-color': '#a78bfa', 'border-width': 1, shape: 'round-rectangle', width: 'label', height: 'label', 'padding-left': '10px', 'padding-right': '10px', 'padding-top': '5px', 'padding-bottom': '5px', label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '360px', 'font-size': 10, 'text-valign': 'center', 'text-halign': 'center', color: '#1e1b4b', 'min-width': '80px' } as never },
	{ selector: 'node.doc.hublike', style: { 'background-color': '#c4b5fd', 'border-color': '#6d28d9', 'border-width': 3, 'padding-left': '14px', 'padding-right': '14px', 'padding-top': '9px', 'padding-bottom': '9px', 'font-size': 13, 'font-weight': 700, color: '#4c1d95' } as never },
	{ selector: 'node.doc.isolated', style: { opacity: 0.55, 'border-style': 'dashed' } as never },
	{ selector: 'node.folderGroup', style: { 'background-color': '#f7f2fc', 'background-opacity': 1, 'border-width': 0, shape: 'round-rectangle', width: 'label', height: 'label', 'padding-left': '11px', 'padding-right': '11px', 'padding-top': '6px', 'padding-bottom': '6px', label: 'data(label)', 'font-size': 11, 'font-weight': 700, color: '#51475e', 'text-valign': 'center', 'text-halign': 'center', 'min-width': '120px', 'z-index': 4 } as never },
	{ selector: 'edge', style: { 'curve-style': 'bezier', 'source-arrow-shape': 'none', 'target-arrow-shape': 'none', 'source-arrow-color': '#94a3b8', 'target-arrow-color': '#94a3b8', 'line-color': '#94a3b8', width: 1, 'arrow-scale': 0.7 } as never },
	{ selector: 'edge[directionality = "directed"]', style: { 'target-arrow-shape': 'triangle' } as never },
	{ selector: 'edge[directionality = "bidirectional"]', style: { 'source-arrow-shape': 'triangle', 'target-arrow-shape': 'triangle' } as never },
	{ selector: 'edge[directionality = "undirected"]', style: { 'source-arrow-shape': 'none', 'target-arrow-shape': 'none' } as never },
	{ selector: 'edge.reference', style: { 'line-color': '#334155', 'source-arrow-color': '#334155', 'target-arrow-color': '#334155', width: 1.4 } as never },
	{ selector: 'edge.hub_constituent', style: { 'line-color': '#8b5cf6', 'source-arrow-color': '#8b5cf6', 'target-arrow-color': '#8b5cf6', 'line-style': 'dotted', width: 1.8, opacity: 0.85 } as never },
	{ selector: 'edge.semantic', style: { 'line-color': '#cbd5e1', 'source-arrow-color': '#cbd5e1', 'target-arrow-color': '#cbd5e1', 'line-style': 'dashed', width: 0.8, opacity: 0.7 } as never },
	{ selector: 'node', style: { 'transition-property': 'background-color, border-color, border-width, opacity', 'transition-duration': 260, 'transition-timing-function': 'ease-out' } as never },
	{ selector: 'edge', style: { 'transition-property': 'line-color, source-arrow-color, target-arrow-color, width, opacity', 'transition-duration': 260, 'transition-timing-function': 'ease-out' } as never },
	{ selector: '.dimmed', style: { opacity: 0.12 } as never },
	{ selector: 'node.highlighted', style: { 'border-color': '#f59e0b', 'border-width': 3, opacity: 1, 'z-index': 999 } as never },
	{ selector: 'node.keyboard-active', style: { 'border-color': '#2563eb', 'border-width': 5, opacity: 1, 'z-index': 1000 } as never },
	{ selector: 'edge.highlighted', style: { 'line-color': '#f59e0b', 'source-arrow-color': '#f59e0b', 'target-arrow-color': '#f59e0b', opacity: 1, 'z-index': 999, 'arrow-scale': 1.4 } as never },
	{ selector: 'edge.reference.highlighted', style: { 'line-style': 'solid', width: 2.6 } as never },
	{ selector: 'edge.semantic.highlighted', style: { 'line-style': 'dashed', 'line-dash-pattern': [10, 6], width: 2.0 } as never },
	{ selector: 'node.regionLabel', style: { 'background-opacity': 0, 'border-width': 0, label: 'data(label)', 'font-size': 11, 'font-weight': 700, color: '#94a3b8', 'text-transform': 'uppercase', 'letter-spacing': '2px', 'text-valign': 'center', 'text-halign': 'center', width: 200, height: 20 } as never },
	{ selector: 'node.folderTreeNode', style: { label: '', width: 'data(nodeWidth)', height: 'data(nodeHeight)', padding: 0, 'min-width': 0, 'background-color': '#faf7fd', 'border-width': 0, shape: 'round-rectangle', opacity: 1, 'shadow-blur': 4, 'shadow-color': '#2d2637', 'shadow-opacity': 0.055, 'shadow-offset-y': 1, 'z-index': 4 } as never },
	{ selector: 'node.folderTreeNode.folderRoot', style: { 'background-color': '#f3ecfd', 'shadow-blur': 7, 'shadow-color': '#523178', 'shadow-opacity': 0.075, 'shadow-offset-y': 2 } as never },
	{ selector: 'node.doc.folderTreeDoc', style: { label: '', 'background-color': '#fbfafc', 'border-width': 0, width: 'data(nodeWidth)', height: 'data(nodeHeight)', padding: 0, 'min-width': 0, opacity: 1, 'shadow-blur': 4, 'shadow-color': '#2d2637', 'shadow-opacity': 0.055, 'shadow-offset-y': 1, 'z-index': 4 } as never },
	{ selector: 'node.doc.folderTreeDoc.isolated', style: { opacity: 1, 'border-width': 0, 'background-color': '#fbfafc' } as never },
	{ selector: 'node.hub.folderTreeHub', style: { 'background-color': '#efe5fb', 'border-width': 0, 'padding-left': '12px', 'padding-right': '12px', 'padding-top': '7px', 'padding-bottom': '7px', 'font-size': 11, color: '#5b2d96' } as never },
	{ selector: 'node.folderTreeRailNode', style: { width: 1, height: 1, padding: 0, 'background-opacity': 0, 'border-width': 0, label: '', events: 'no', 'z-index': 0 } as never },
	{ selector: 'edge.folderHierarchy', style: { 'curve-style': 'straight', 'line-color': '#e9e5ec', 'source-arrow-shape': 'none', 'target-arrow-shape': 'none', width: 1, opacity: 0.9, 'line-cap': 'round', 'z-index': 1 } as never },
	{ selector: 'node.folderTreeDecoration', style: { events: 'yes', 'border-width': 0, 'z-index': 6 } as never },
	{ selector: 'node.folderTreeIcon', style: { width: 14, height: 14, padding: 0, 'background-opacity': 0, 'background-fit': 'contain', 'background-width': '100%', 'background-height': '100%', 'background-repeat': 'no-repeat', label: '' } as never },
	{ selector: 'node.folderTreeFolderIcon', style: { 'background-image': FOLDER_ICON_PURPLE } as never },
	{ selector: 'node.folderTreeFileIcon', style: { 'background-image': FILE_ICON_NEUTRAL } as never },
	{ selector: 'node.folderTreeLabel', style: { width: 'data(labelWidth)', height: 18, padding: 0, 'background-opacity': 0, label: 'data(label)', color: '#4d4853', 'font-size': 10.8, 'font-weight': 500, 'text-wrap': 'ellipsis', 'text-max-width': 'data(labelWidth)', 'text-valign': 'center', 'text-halign': 'center' } as never },
	{ selector: 'node.folderTreeFolderLabel', style: { color: '#51475e', 'font-size': 11, 'font-weight': 680 } as never },
	{ selector: 'node.folderTreeCountBadge', style: { width: 'data(badgeWidth)', height: 17, padding: 0, shape: 'round-rectangle', 'background-color': '#f1e9fb', label: 'data(label)', color: '#8450c4', 'font-size': 9.5, 'font-weight': 740, 'text-valign': 'center', 'text-halign': 'center' } as never },
	{ selector: 'node.folderTreeRootBadge', style: { 'background-color': '#7c3aed', color: '#ffffff' } as never },
	{ selector: 'node.folderTreeLinkBadge', style: { width: 'data(badgeWidth)', height: 17, padding: 0, shape: 'round-rectangle', 'background-color': '#f7f6f8', 'background-image': LINK_ICON_NEUTRAL, 'background-fit': 'none', 'background-width': '9px', 'background-height': '9px', 'background-repeat': 'no-repeat', 'background-position-x': '5px', 'background-position-y': '50%', label: 'data(label)', color: '#88818e', 'font-size': 9, 'font-weight': 700, 'text-margin-x': 5, 'text-valign': 'center', 'text-halign': 'center' } as never },
	{ selector: 'edge.folderRelation', style: { 'curve-style': 'unbundled-bezier', 'control-point-distances': 'data(curveDistance)', 'control-point-weights': 0.5, 'line-color': '#9566df', 'source-arrow-color': '#9566df', 'target-arrow-color': '#9566df', width: 1.65, opacity: 0.82, 'arrow-scale': 0.9, 'z-index': 3 } as never },
	{ selector: 'edge.folderRelation.reference', style: { 'line-color': '#9566df', 'source-arrow-color': '#9566df', 'target-arrow-color': '#9566df', width: 1.65 } as never },
	{ selector: 'edge.folderRelation.hub_constituent', style: { 'line-color': '#9566df', 'source-arrow-color': '#9566df', 'target-arrow-color': '#9566df', 'line-style': 'dotted', width: 1.7, opacity: 0.82 } as never },
	{ selector: 'edge.folderRelation.semantic', style: { 'line-color': '#0f9d83', 'source-arrow-color': '#0f9d83', 'target-arrow-color': '#0f9d83', 'line-style': 'dashed', 'line-dash-pattern': [8, 7], width: 1.7, opacity: 0.88 } as never },
	{ selector: 'node.folderFocusSelected', style: { 'background-color': '#7c3aed', color: '#ffffff', 'border-width': 0, opacity: 1, 'z-index': 1000 } as never },
	{ selector: 'node.folderFocusScope', style: { 'background-color': '#eee3fb', color: '#5b2d96', 'border-width': 0, opacity: 1, 'z-index': 800 } as never },
	{ selector: 'node.folderFocusConnected', style: { 'background-color': '#f7f1fd', color: '#51475e', opacity: 1, 'z-index': 700 } as never },
	{ selector: 'node.folderFocusDimmed', style: { opacity: 0.45 } as never },
	{ selector: 'edge.folderFocusHidden', style: { opacity: 0.04 } as never },
	{ selector: 'edge.folderFocusActive', style: { opacity: 1, width: 2.05, 'arrow-scale': 1.08, 'z-index': 900 } as never },
	{ selector: 'edge.folderFocusIncoming', style: { 'line-color': '#0f9d83', 'target-arrow-color': '#0f9d83', 'target-arrow-shape': 'vee', 'source-arrow-color': '#9566df' } as never },
	{ selector: 'edge.folderFocusOutgoing', style: { 'line-color': '#9566df', 'target-arrow-color': '#9566df', 'source-arrow-color': '#0f9d83' } as never },
	{ selector: 'edge.folderFocusInternal', style: { 'line-color': '#9566df', 'source-arrow-color': '#9566df', 'target-arrow-color': '#9566df' } as never },
	{ selector: 'edge.folderHierarchy.folderHierarchyActive', style: { 'line-color': '#d6c3ec', width: 1.2, opacity: 0.95 } as never },
	{ selector: 'node.folderTreeNode.highlighted, node.folderTreeDoc.highlighted', style: { 'background-color': '#f1e8fb', 'border-width': 0, opacity: 1 } as never },
	{ selector: 'node.folderTreeDecoration.highlighted', style: { 'border-width': 0, opacity: 1 } as never },
	{ selector: 'edge.folderRelation.highlighted', style: { 'line-color': '#7c3aed', 'source-arrow-color': '#7c3aed', 'target-arrow-color': '#7c3aed', opacity: 1, width: 2.2 } as never },
	// Focus meaning stays legible while the pointer is still over the node.
	// These more-specific rules deliberately outrank generic hover highlighting.
	{ selector: 'node.folderTreeNode.folderFocusSelected, node.folderTreeDoc.folderFocusSelected', style: { 'background-color': '#7c3aed', color: '#ffffff', 'border-width': 0, opacity: 1, 'z-index': 1001 } as never },
	{ selector: 'node.folderTreeDecoration.folderFocusSelected', style: { opacity: 1, 'z-index': 1002 } as never },
	{ selector: 'node.folderTreeDecoration.folderFocusScope', style: { opacity: 1, 'z-index': 802 } as never },
	{ selector: 'node.folderTreeDecoration.folderFocusConnected', style: { opacity: 1, 'z-index': 702 } as never },
	{ selector: 'node.folderTreeLabel.folderFocusSelected', style: { color: '#ffffff' } as never },
	{ selector: 'node.folderTreeIcon.folderFocusSelected', style: { 'background-image': FILE_ICON_WHITE } as never },
	{ selector: 'node.folderTreeFolderIcon.folderFocusSelected', style: { 'background-image': FOLDER_ICON_WHITE } as never },
	{ selector: 'node.folderTreeCountBadge.folderFocusSelected', style: { 'background-color': '#ffffff', color: '#7c3aed' } as never },
	{ selector: 'node.folderTreeLinkBadge.folderFocusSelected', style: { 'background-color': '#9360ef', 'background-image': LINK_ICON_WHITE, color: '#ffffff' } as never },
	{ selector: 'node.folderTreeFolderLabel.folderFocusScope', style: { color: '#6433a2' } as never },
	{ selector: 'node.folderTreeCountBadge.folderFocusScope', style: { 'background-color': '#eadcf8', color: '#6f36af' } as never },
	{ selector: 'node.folderTreeLinkBadge.folderFocusConnected', style: { 'background-color': '#eee5fb', 'background-image': LINK_ICON_PURPLE, color: '#6937ad' } as never },
	{ selector: 'edge.folderRelation.folderFocusIncoming', style: { 'line-color': '#0f9d83', 'target-arrow-color': '#0f9d83', 'target-arrow-shape': 'vee', 'source-arrow-color': '#9566df' } as never },
	{ selector: 'edge.folderRelation.folderFocusOutgoing', style: { 'line-color': '#9566df', 'target-arrow-color': '#9566df', 'target-arrow-shape': 'triangle', 'source-arrow-color': '#0f9d83' } as never },
	{ selector: 'edge.folderRelation.folderFocusInternal', style: { 'line-color': '#9566df', 'source-arrow-color': '#9566df', 'target-arrow-color': '#9566df' } as never },
];

// ─── Layout config picker ──────────────────────────────────────────────────
function layoutConfig(name: PresetBundle['layout']): cytoscape.LayoutOptions {
	switch (name) {
		case 'fcose':
			return { name: 'fcose', animate: true, animationDuration: 500, nodeRepulsion: 8000, idealEdgeLength: 90, edgeElasticity: 0.3, gravity: 0.25, tile: true, randomize: true, packComponents: true, nodeSeparation: 80 } as never;
		case 'cola':
			return { name: 'cola', animate: true, maxSimulationTime: 3000, nodeSpacing: 20, edgeLength: 90, avoidOverlap: true } as never;
		case 'dagre-tb':
			return { name: 'dagre', rankDir: 'TB', nodeSep: 20, edgeSep: 12, rankSep: 70, animate: true } as never;
		case 'dagre-lr':
			return { name: 'dagre', rankDir: 'LR', nodeSep: 20, edgeSep: 12, rankSep: 100, animate: true } as never;
		case 'concentric-hub':
			return { name: 'concentric', animate: true, concentric: (n: NodeSingular) => { if (n.data('kind') === 'hub') return 3; if (n.hasClass('isolated')) return 1; return 2; }, levelWidth: () => 1, minNodeSpacing: 22, spacingFactor: 1.1 } as never;
		case 'folder-tree':
			return { name: 'preset', fit: false, animate: true, animationDuration: 320 } as never;
	}
}

function layoutIsolatedGrid(cy: Core): void {
	const isolated = cy.nodes('.isolated').sort((a, b) => {
		const la = (a.data('label') || a.id() || '').toLowerCase();
		const lb = (b.data('label') || b.id() || '').toLowerCase();
		return la.localeCompare(lb, 'zh');
	});
	if (isolated.length === 0) return;
	const connected = cy.nodes().not('.isolated').not('.regionLabel');
	let baseY = 0, centerX = 0, gridWidth = 700;
	if (connected.length > 0) {
		const bbox = connected.boundingBox({});
		baseY = bbox.y2 + 140;
		centerX = (bbox.x1 + bbox.x2) / 2;
		gridWidth = Math.max(bbox.x2 - bbox.x1, 700);
	}
	const cellW = 160, cellH = 44;
	const cols = Math.max(4, Math.min(8, Math.floor(gridWidth / cellW)));
	const gridStartX = centerX - (cols * cellW) / 2;
	cy.add({ group: 'nodes', data: { id: '__label:isolated', label: 'Isolated matches', kind: 'regionLabel' }, classes: 'regionLabel', position: { x: centerX, y: baseY - 40 } });
	isolated.forEach((n, i) => {
		const col = i % cols;
		const row = Math.floor(i / cols);
		n.position({ x: gridStartX + col * cellW, y: baseY + row * cellH });
	});
}

const FOLDER_TREE_MIN_INITIAL_ZOOM = 1;

function fitGraphViewport(cy: Core, folderTree: boolean): void {
	cy.fit(undefined, 40);
	if (!folderTree || cy.zoom() >= FOLDER_TREE_MIN_INITIAL_ZOOM) return;

	// A long tree should open at a readable scale and continue below the fold,
	// like the regular Tree view. The user can pan vertically to later rows;
	// shrinking every label to fit the entire tree defeats this preset.
	const bounds = cy.nodes().not('.folderTreeRailNode').boundingBox({ includeLabels: true });
	cy.zoom(FOLDER_TREE_MIN_INITIAL_ZOOM);
	cy.pan({
		x: 56 - bounds.x1 * FOLDER_TREE_MIN_INITIAL_ZOOM,
		y: 52 - bounds.y1 * FOLDER_TREE_MIN_INITIAL_ZOOM,
	});
}

const FOLDER_FOCUS_NODE_CLASSES = 'folderFocusSelected folderFocusScope folderFocusConnected folderFocusDimmed';
const FOLDER_FOCUS_EDGE_CLASSES = 'folderFocusHidden folderFocusActive folderFocusIncoming folderFocusOutgoing folderFocusInternal folderHierarchyActive';

function mirrorFolderTreeFocusToDecorations(cy: Core): void {
	cy.nodes('.folderTreeDecoration').forEach((decoration) => {
		const ownerId = String(decoration.data('ownerId') ?? '');
		const owner = ownerId ? cy.getElementById(ownerId) : null;
		if (!owner || owner.empty()) return;
		for (const className of FOLDER_FOCUS_NODE_CLASSES.split(' ')) {
			if (owner.hasClass(className)) decoration.addClass(className);
		}
	});
}

function folderAncestorIds(
	projection: VisibleFolderTreeProjection,
	selectedNodeId: string,
): Set<string> {
	const folderById = new Map(projection.folders.map((folder) => [folder.id, folder]));
	const selectedFolderId = folderById.has(selectedNodeId)
		? selectedNodeId
		: projection.documentFolderIdById.get(selectedNodeId);
	const ids = new Set<string>();
	let cursor = selectedFolderId ? folderById.get(selectedFolderId) : undefined;
	while (cursor) {
		ids.add(cursor.id);
		cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
	}
	return ids;
}

function applyFolderTreeFocus(
	cy: Core,
	projection: VisibleFolderTreeProjection,
	selectedNodeId: string | null,
): void {
	cy.batch(() => {
		cy.nodes().removeClass(FOLDER_FOCUS_NODE_CLASSES);
		cy.edges().removeClass(FOLDER_FOCUS_EDGE_CLASSES);
		if (!selectedNodeId) return;

		const selectedNode = cy.getElementById(selectedNodeId);
		if (!selectedNode || selectedNode.empty()) return;
		const scope = folderTreeSelectionScope(projection, selectedNodeId);
		const ancestorFolderIds = folderAncestorIds(projection, selectedNodeId);
		const readableNodeIds = new Set<string>([
			selectedNodeId,
			...scope.documentIds,
			...scope.folderIds,
			...ancestorFolderIds,
		]);

		selectedNode.addClass('folderFocusSelected');
		for (const id of [...scope.documentIds, ...scope.folderIds, ...ancestorFolderIds]) {
			if (id === selectedNodeId) continue;
			cy.getElementById(id).addClass('folderFocusScope');
		}

		cy.edges('.folderRelation').forEach((edge) => {
			const sourceSelected = scope.documentIds.has(edge.source().id());
			const targetSelected = scope.documentIds.has(edge.target().id());
			if (!sourceSelected && !targetSelected) {
				edge.addClass('folderFocusHidden');
				return;
			}

			edge.addClass('folderFocusActive');
			readableNodeIds.add(edge.source().id());
			readableNodeIds.add(edge.target().id());
			if (edge.data('directionality') === 'undirected') return;
			if (sourceSelected && targetSelected) {
				edge.addClass('folderFocusInternal');
				return;
			}
			edge.addClass(sourceSelected ? 'folderFocusOutgoing' : 'folderFocusIncoming');
		});

		cy.nodes().not('.regionLabel').forEach((node) => {
			if (readableNodeIds.has(node.id())) {
				if (!node.hasClass('folderFocusSelected') && !node.hasClass('folderFocusScope')) {
					node.addClass('folderFocusConnected');
				}
				return;
			}
			node.addClass('folderFocusDimmed');
		});

		const activeHierarchyNodeIds = new Set<string>([
			...scope.documentIds,
			...scope.folderIds,
			...ancestorFolderIds,
		]);
		cy.edges('.folderHierarchy').forEach((edge) => {
			const parentNodeId = String(edge.data('parentNodeId') ?? '');
			const childNodeId = String(edge.data('childNodeId') ?? '');
			if (!activeHierarchyNodeIds.has(parentNodeId)) return;
			if (!activeHierarchyNodeIds.has(childNodeId)) return;
			edge.addClass('folderHierarchyActive');
		});
		mirrorFolderTreeFocusToDecorations(cy);
	});
}

/** Turn subgraph → Mermaid flowchart string for copy-to-clipboard. */
function subgraphToMermaid(sub: ResultSubgraphOutput): string {
	const lines: string[] = ['flowchart TD'];
	const sid = (id: string) => `n${id.slice(0, 10)}`;
	const escape = (s: string) => s.replace(/["`]/g, '').replace(/\n/g, ' ').slice(0, 60);
	for (const h of sub.hubAnchors) lines.push(`  ${sid(h.id)}[["${escape(h.title || h.path || h.id)} · hub (${h.constituentCount})"]]:::hub`);
	const isolatedSet = new Set(sub.isolatedDocIds);
	for (const n of sub.resultNodes) {
		const cls = isolatedSet.has(n.id) ? ':::iso' : '';
		lines.push(`  ${sid(n.id)}["${escape(n.title || n.path || n.id)}"]${cls}`);
	}
	for (const e of coalesceGraphEdges(sub.edges)) {
		if (e.from === e.to) continue;
		if (e.directionality === 'bidirectional') {
			lines.push(`  ${sid(e.from)} <-->|${e.kind === 'semantic' ? 'sem' : e.kind === 'hub_constituent' ? 'member' : 'ref'}| ${sid(e.to)}`);
			continue;
		}
		if (e.directionality === 'undirected') {
			lines.push(`  ${sid(e.from)} -.- ${sid(e.to)}`);
			continue;
		}
		lines.push(`  ${sid(e.from)} -->|${e.kind === 'semantic' ? 'sem' : e.kind === 'hub_constituent' ? 'member' : 'ref'}| ${sid(e.to)}`);
	}
	lines.push('  classDef hub fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#4c1d95');
	lines.push('  classDef iso fill:#f5f5f5,stroke:#cbd5e1,stroke-dasharray:3 3,color:#64748b');
	return lines.join('\n');
}

export interface AtlasGraphNodeTap {
	id: string;
	path: string;
	isHub: boolean;
	modKey: boolean;
}

export interface AtlasGraphViewport {
	zoom: number;
	pan: { x: number; y: number };
}

export interface AtlasGraphKeyTipKeys {
	nodeList: string;
	copyMermaid: string;
	copyImage: string;
}

export interface AtlasGraphCanvasProps {
	subgraph: ResultSubgraphOutput | null;
	preset: AtlasGraphPreset;
	showSemantic: boolean;
	/** Optional controlled layer action. When present, the canvas owns its visible placement. */
	onShowSemanticChange?: (on: boolean) => void;
	semanticKeyTipKey?: string;
	/** For the overflow badge ("Showing top N of …"). Default 100. */
	nodeCap?: number;
	/** Message when the subgraph has no nodes. Default "No results to graph." */
	emptyLabel?: string;
	/** Building state message. Default "Building graph…". */
	buildingLabel?: string;
	/** Optional secondary information shown beside the copy controls. */
	summary?: string;
	/** Format the overflow badge. */
	overflowLabel?: (shown: number, total: number) => string;
	onNodeTap?: (node: AtlasGraphNodeTap) => void;
	onNodeDblTap?: (node: { id: string; path: string }) => void;
	/** Immediate hover in/out on real-file nodes (null = out). For recorders. */
	onNodeHover?: (node: { id: string; path: string } | null) => void;
	/** Optional session-only viewport restored after layout completes. */
	initialViewport?: AtlasGraphViewport | null;
	/** Emitted for user and keyboard pan/zoom changes. */
	onViewportChange?: (viewport: AtlasGraphViewport) => void;
	/** Surface-owned direct-action keys for the stable graph toolbar. */
	keyTipKeys?: AtlasGraphKeyTipKeys;
}

export const AtlasGraphCanvas: React.FC<AtlasGraphCanvasProps> = ({
	subgraph,
	preset,
	showSemantic,
	onShowSemanticChange,
	semanticKeyTipKey,
	nodeCap = 100,
	emptyLabel = 'No results to graph.',
	buildingLabel = 'Building graph…',
	summary,
	overflowLabel,
	onNodeTap,
	onNodeDblTap,
	onNodeHover,
	initialViewport,
	onViewportChange,
	keyTipKeys,
}) => {
	const [copiedMode, setCopiedMode] = useState<'mermaid' | 'image' | null>(null);
	const [hoveredLabel, setHoveredLabel] = useState<{ label: string; path: string } | null>(null);
	const [keyboardNodeId, setKeyboardNodeId] = useState<string | null>(null);
	const [keyboardNodeLabel, setKeyboardNodeLabel] = useState('');
	const [nodeListOpen, setNodeListOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const nodeListRef = useRef<HTMLDivElement | null>(null);
	const cyRef = useRef<Core | null>(null);
	const animRef = useRef<number | null>(null);

	// Keep the latest callbacks without re-running the (expensive) cytoscape mount.
	const tapRef = useRef(onNodeTap);
	const dblRef = useRef(onNodeDblTap);
	const hoverRef = useRef(onNodeHover);
	const initialViewportRef = useRef(initialViewport);
	const viewportChangeRef = useRef(onViewportChange);
	tapRef.current = onNodeTap;
	dblRef.current = onNodeDblTap;
	hoverRef.current = onNodeHover;
	initialViewportRef.current = initialViewport;
	viewportChangeRef.current = onViewportChange;
	useRovingComposite(nodeListRef, {
		itemSelector: '[role="option"]',
		enabled: nodeListOpen,
		orientation: 'vertical',
		rememberBy: 'data-node-id',
		onActiveItem: (item) => {
			const nodeId = item.dataset.nodeId;
			if (nodeId) setKeyboardNodeId(nodeId);
		},
	});

	useEffect(() => {
		ensureExtensionsRegistered();
		return () => {
			if (animRef.current) cancelAnimationFrame(animRef.current);
			animRef.current = null;
			cyRef.current?.destroy();
			cyRef.current = null;
		};
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !subgraph) return;
		const bundle = PRESETS[preset];
		const folderProjection = bundle.folderTree ? buildVisibleFolderTree(subgraph.resultNodes) : null;
		const els = buildElements(subgraph, { showSemantic, folderTree: bundle.folderTree });
		if (animRef.current) cancelAnimationFrame(animRef.current);
		animRef.current = null;
		cyRef.current?.destroy();
		const cy = cytoscape({
			container,
			elements: els,
			style: CYTOSCAPE_STYLES,
			// Cytoscape's constructor otherwise runs its default grid layout before
			// our preset layout and discards the explicit folder-tree positions.
			layout: bundle.folderTree ? { name: 'preset' } : undefined,
			minZoom: 0.15,
			maxZoom: 3,
			wheelSensitivity: 0.2,
		});
		cyRef.current = cy;

		const shouldSplitIsolated = !bundle.folderTree;
		const connectedEles = shouldSplitIsolated
			? cy.elements().filter((el) => {
				if (el.isNode()) return !el.hasClass('isolated') && !el.hasClass('regionLabel');
				const s = (el as EdgeSingular).source();
				const t = (el as EdgeSingular).target();
				return !(s.hasClass('isolated') || t.hasClass('isolated'));
			})
			: cy.elements();

		const layoutObj = connectedEles.layout(layoutConfig(bundle.layout));
		layoutObj.one('layoutstop', () => {
			if (shouldSplitIsolated) layoutIsolatedGrid(cy);
			const restored = initialViewportRef.current;
			if (restored) {
				cy.zoom(restored.zoom);
				cy.pan(restored.pan);
				return;
			}
			fitGraphViewport(cy, bundle.folderTree);
		});
		layoutObj.run();
		cy.on('pan zoom', () => {
			viewportChangeRef.current?.({ zoom: cy.zoom(), pan: cy.pan() });
		});

		let hoverTimer: ReturnType<typeof setTimeout> | null = null;
		let focusedFolderTreeNodeId: string | null = null;
		const prefersReducedMotion = container.ownerDocument.defaultView
			?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		const startEdgeAnimation = () => {
			if (prefersReducedMotion || animRef.current) return;
			let offset = 0;
			let last = performance.now();
			const tick = (now: number) => {
				const dt = Math.min(now - last, 50);
				last = now;
				offset -= dt * 0.024;
				const edges = bundle.folderTree
					? cy.edges('edge.folderRelation.semantic').not('.folderFocusHidden')
					: cy.edges('edge.semantic.highlighted');
				if (edges.length === 0) { animRef.current = null; return; }
				edges.style('line-dash-offset', offset);
				animRef.current = requestAnimationFrame(tick);
			};
			animRef.current = requestAnimationFrame(tick);
		};
		const stopEdgeAnimation = () => {
			if (animRef.current) cancelAnimationFrame(animRef.current);
			animRef.current = null;
		};
		const resolveFolderTreeOwner = (node: NodeSingular): NodeSingular | null => {
			if (node.hasClass('folderTreeRailNode')) return null;
			if (!node.hasClass('folderTreeDecoration')) return node;
			const ownerId = String(node.data('ownerId') ?? '');
			if (!ownerId) return null;
			const owner = cy.getElementById(ownerId);
			return owner && !owner.empty() ? owner as NodeSingular : null;
		};

		cy.on('mouseover', 'node', (evt) => {
			const n = resolveFolderTreeOwner(evt.target as NodeSingular);
			if (!n) return;
			if (n.hasClass('regionLabel')) return;
			const raw = (n.data('label') as string | undefined) ?? '';
			const rawPath = (n.data('path') as string | undefined) ?? '';
			if (raw) setHoveredLabel({ label: raw, path: rawPath });
			if (!n.hasClass('folderGroup')) hoverRef.current?.({ id: n.id(), path: rawPath });
			if (hoverTimer) clearTimeout(hoverTimer);
			hoverTimer = setTimeout(() => {
				const isCompound = n.hasClass('folderGroup');
				let highlight;
				if (isCompound && folderProjection) {
					const scope = folderTreeSelectionScope(folderProjection, n.id());
					const ancestorIds = folderAncestorIds(folderProjection, n.id());
					const scopedNodes = cy.nodes().filter((node) => (
						scope.documentIds.has(node.id())
						|| scope.folderIds.has(node.id())
						|| ancestorIds.has(node.id())
					));
					highlight = n.union(scopedNodes).union(scopedNodes.connectedEdges('.folderRelation'));
				} else if (isCompound) {
					const descendants = n.descendants();
					highlight = n.union(descendants).union(descendants.connectedEdges());
				} else {
					highlight = n.closedNeighborhood();
				}
				highlight = highlight.union(n.ancestors());
				if (bundle.folderTree) {
					const highlightedNodeIds = new Set(highlight.nodes().map((node) => node.id()));
					const decorations = cy.nodes('.folderTreeDecoration').filter((decoration) => (
						highlightedNodeIds.has(String(decoration.data('ownerId') ?? ''))
					));
					highlight = highlight.union(decorations);
				}
				cy.batch(() => {
					cy.elements().addClass('dimmed');
					highlight.removeClass('dimmed').addClass('highlighted');
					n.addClass('highlighted');
				});
				startEdgeAnimation();
			}, 80);
		});
		cy.on('mouseout', 'node', () => {
			setHoveredLabel(null);
			hoverRef.current?.(null);
			if (hoverTimer) clearTimeout(hoverTimer);
			hoverTimer = setTimeout(() => {
				if (!bundle.folderTree) stopEdgeAnimation();
				cy.batch(() => {
					cy.elements().removeClass('dimmed').removeClass('highlighted');
					cy.edges().removeStyle('line-dash-offset');
				});
			}, 120);
		});

		cy.on('tap', 'node', (evt) => {
			const n = resolveFolderTreeOwner(evt.target as NodeSingular);
			if (!n) return;
			if (n.hasClass('regionLabel')) return;
			const originalEvent = (evt as { originalEvent?: MouseEvent }).originalEvent;
			const modKey = !!(originalEvent && (originalEvent.metaKey || originalEvent.ctrlKey));
			if (bundle.folderTree && folderProjection && (n.hasClass('folderTreeNode') || n.hasClass('folderTreeDoc'))) {
				focusedFolderTreeNodeId = toggleFolderTreeSelection(focusedFolderTreeNodeId, n.id());
				applyFolderTreeFocus(cy, folderProjection, focusedFolderTreeNodeId);
				if (focusedFolderTreeNodeId && n.hasClass('folderTreeDoc')) {
					tapRef.current?.({ id: n.id(), path: (n.data('path') as string | undefined) ?? '', isHub: false, modKey });
				}
				return;
			}
			if (n.hasClass('folderGroup')) return;
			tapRef.current?.({ id: n.id(), path: (n.data('path') as string | undefined) ?? '', isHub: n.hasClass('hub'), modKey });
		});
		cy.on('dbltap', 'node', (evt) => {
			const n = resolveFolderTreeOwner(evt.target as NodeSingular);
			if (!n) return;
			if (n.hasClass('regionLabel') || n.hasClass('folderGroup') || n.hasClass('hub')) return;
			dblRef.current?.({ id: n.id(), path: (n.data('path') as string | undefined) ?? '' });
		});
		if (bundle.folderTree) startEdgeAnimation();
		return () => {
			if (hoverTimer) clearTimeout(hoverTimer);
			stopEdgeAnimation();
			cy.destroy();
			if (cyRef.current === cy) cyRef.current = null;
		};
	}, [subgraph, preset, showSemantic]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || typeof ResizeObserver === 'undefined') return;
		let frame = 0;
		const observer = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const cy = cyRef.current;
				if (!cy || container.clientWidth === 0 || container.clientHeight === 0) return;
				cy.resize();
				if (!viewportChangeRef.current) fitGraphViewport(cy, PRESETS[preset].folderTree);
			});
		});
		observer.observe(container);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		const cy = cyRef.current;
		if (!cy) return;
		cy.nodes().removeClass('keyboard-active');
		if (!keyboardNodeId) return;
		const node = cy.getElementById(keyboardNodeId);
		if (!node || node.empty()) return;
		node.addClass('keyboard-active');
		setKeyboardNodeLabel(String(node.data('label') ?? node.id()).replace(/\n/g, ' '));
		cy.animate({ center: { eles: node }, duration: 120 });
	}, [keyboardNodeId, subgraph, preset, showSemantic]);

	const graphNodes = useCallback((): NodeSingular[] => {
		const cy = cyRef.current;
		if (!cy) return [];
		return cy.nodes()
				.filter((node) => (
					!node.hasClass('regionLabel')
					&& !node.hasClass('folderTreeDecoration')
					&& !node.hasClass('folderTreeRailNode')
				))
				.toArray() as NodeSingular[];
	}, []);

	const handleGraphKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		const nodes = graphNodes();
		if (nodes.length === 0) return;
		const active = nodes.find((node) => node.id() === keyboardNodeId) ?? nodes[0];
		if (event.key === 'Home') {
			event.preventDefault();
			setKeyboardNodeId(nodes[0].id());
			return;
		}
		if (event.key === 'End') {
			event.preventDefault();
			setKeyboardNodeId(nodes[nodes.length - 1].id());
			return;
		}
		if (event.key === '0') {
			event.preventDefault();
			const cy = cyRef.current;
			if (cy) fitGraphViewport(cy, PRESETS[preset].folderTree);
			return;
		}
		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			const cy = cyRef.current;
			if (cy) cy.zoom({ level: Math.min(cy.maxZoom(), cy.zoom() * 1.2), renderedPosition: active.renderedPosition() });
			return;
		}
		if (event.key === '-') {
			event.preventDefault();
			const cy = cyRef.current;
			if (cy) cy.zoom({ level: Math.max(cy.minZoom(), cy.zoom() / 1.2), renderedPosition: active.renderedPosition() });
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			if (active.hasClass('folderTreeNode')) {
				active.emit('tap');
				return;
			}
			const path = String(active.data('path') ?? '');
			dblRef.current?.({ id: active.id(), path });
			return;
		}
		if (event.key === ' ') {
			event.preventDefault();
			active.emit('tap');
			return;
		}
		const direction = event.key === 'ArrowLeft' ? 'left'
			: event.key === 'ArrowRight' ? 'right'
				: event.key === 'ArrowUp' ? 'up'
					: event.key === 'ArrowDown' ? 'down'
						: null;
		if (!direction) return;
		event.preventDefault();
		const currentPosition = active.renderedPosition();
		const nextId = findDirectionalGraphNode(
			{ id: active.id(), x: currentPosition.x, y: currentPosition.y },
			nodes.map((node) => {
				const point = node.renderedPosition();
				return { id: node.id(), x: point.x, y: point.y };
			}),
			direction,
		);
		if (nextId) setKeyboardNodeId(nextId);
	}, [graphNodes, keyboardNodeId, preset]);

	const handleCopyMermaid = useCallback(() => {
		if (!subgraph) return;
		try {
			void navigator.clipboard.writeText(subgraphToMermaid(subgraph));
			setCopiedMode('mermaid');
			window.setTimeout(() => setCopiedMode(null), 1500);
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn('[AtlasGraphCanvas] clipboard write failed', err);
		}
	}, [subgraph]);

	const handleCopyImage = useCallback(async () => {
		const cy = cyRef.current;
		if (!cy) return;
		try {
			const dataUrl = (cy.png as unknown as (opts: Record<string, unknown>) => string)({ full: true, bg: '#ffffff', scale: 2, maxWidth: 4096, maxHeight: 4096 });
			const commaIdx = dataUrl.indexOf(',');
			if (commaIdx < 0) throw new Error('unexpected png dataURL shape');
			const base64 = dataUrl.slice(commaIdx + 1);
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			const blob = new Blob([bytes], { type: 'image/png' });
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
			setCopiedMode('image');
			window.setTimeout(() => setCopiedMode(null), 1500);
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn('[AtlasGraphCanvas] copy-as-image failed', err);
		}
	}, []);

	const overflowCount = subgraph?.overflowCount ?? 0;
	const emptyMessage = useMemo(() => {
		if (!subgraph) return buildingLabel;
		if (!subgraph.resultNodes.length) return emptyLabel;
		return null;
	}, [subgraph, buildingLabel, emptyLabel]);
	const nodeListLabel = nodeListOpen
		? PEAK_KEYBOARD_A11Y_STRINGS.closeGraphNodeList
		: PEAK_KEYBOARD_A11Y_STRINGS.openGraphNodeList;

	return (
		<div
			className="pktw-relative pktw-w-full pktw-h-full pktw-overflow-hidden pktw-min-h-[420px]"
			tabIndex={0}
			role="application"
			aria-label={PEAK_KEYBOARD_A11Y_STRINGS.graphInstructions}
			data-peak-keyboard-entry
			onFocus={() => {
				if (!keyboardNodeId) setKeyboardNodeId(graphNodes()[0]?.id() ?? null);
			}}
			onKeyDown={handleGraphKeyDown}
		>
			<span className="pk-keyboard-live-region" aria-live="polite">
				{keyboardNodeLabel}
			</span>
			<div ref={containerRef} className="pktw-absolute pktw-inset-0" />
			{emptyMessage && (
				<div className="pktw-absolute pktw-inset-0 pktw-flex pktw-items-center pktw-justify-center pktw-p-6 pktw-text-sm pktw-text-pk-text-tertiary">
					{emptyMessage}
				</div>
			)}
			<div className="pktw-absolute pktw-top-2 pktw-right-2 pktw-z-20 pktw-flex pktw-items-center pktw-gap-1">
				{summary && (
					<>
						<span className="pktw-px-1 pktw-text-xs pktw-font-medium pktw-text-pk-text-tertiary pktw-whitespace-nowrap">
							{summary}
						</span>
						<span
							aria-hidden="true"
							className="pktw-mx-1 pktw-h-4 pktw-w-px pktw-bg-pk-border"
						/>
					</>
				)}
				{onShowSemanticChange && (
					<>
						<GraphSemanticToggle
							checked={showSemantic}
							onCheckedChange={onShowSemanticChange}
							keyTipKey={semanticKeyTipKey}
							label="Semantic edges"
						/>
						<span aria-hidden="true" className="pktw-mx-1 pktw-h-4 pktw-w-px pktw-bg-pk-border" />
					</>
				)}
				{onShowSemanticChange ? (
					<Button
						type="button"
						variant="ghost"
						geometry="toolbar"
						title={nodeListLabel}
						aria-label={nodeListLabel}
						aria-expanded={nodeListOpen}
						data-peak-keytip-key={keyTipKeys?.nodeList}
						data-peak-keytip-label={nodeListLabel}
						onClick={() => setNodeListOpen((open) => !open)}
						data-active={nodeListOpen ? 'true' : undefined}
						className="pktw-gap-1.5 pktw-px-2.5 pktw-text-pk-foreground-muted"
					>
						<PanelRightOpen className="pktw-h-3.5 pktw-w-3.5" />
						<span>Nodes</span>
					</Button>
				) : (
					<IconButton
						label={nodeListLabel}
						title={nodeListLabel}
						aria-expanded={nodeListOpen}
						data-peak-keytip-key={keyTipKeys?.nodeList}
						data-peak-keytip-label={nodeListLabel}
						onClick={() => setNodeListOpen((open) => !open)}
						data-active={nodeListOpen ? 'true' : undefined}
					>
						<List className="pktw-h-3.5 pktw-w-3.5" />
					</IconButton>
				)}
				{onShowSemanticChange && (
					<span aria-hidden="true" className="pktw-mx-1 pktw-h-4 pktw-w-px pktw-bg-pk-border" />
				)}
				<IconButton
					label={copiedMode === 'mermaid' ? 'Copied Mermaid to clipboard' : 'Copy graph as Mermaid'}
					title="Copy graph as Mermaid"
					data-peak-keytip-key={keyTipKeys?.copyMermaid}
					data-peak-keytip-label="Copy graph as Mermaid"
					onClick={handleCopyMermaid}
					data-active={copiedMode === 'mermaid' ? 'true' : undefined}
				>
					{copiedMode === 'mermaid'
						? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" />
						: <Workflow className="pktw-w-3.5 pktw-h-3.5" />}
				</IconButton>
				<IconButton
					label={copiedMode === 'image' ? 'Copied image to clipboard' : 'Copy graph as image'}
					title="Copy graph as image"
					data-peak-keytip-key={keyTipKeys?.copyImage}
					data-peak-keytip-label="Copy graph as image"
					onClick={handleCopyImage}
					data-active={copiedMode === 'image' ? 'true' : undefined}
				>
					{copiedMode === 'image'
						? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" />
						: <ImageIcon className="pktw-w-3.5 pktw-h-3.5" />}
				</IconButton>
			</div>
			{nodeListOpen && subgraph && (
				<div
					ref={nodeListRef}
					className="pk-graph-node-list"
					role="listbox"
					aria-label={PEAK_KEYBOARD_A11Y_STRINGS.graphNodes}
				>
					{subgraph.resultNodes.map((node, index) => (
						<Button
							key={node.id}
							variant="unstyled"
							type="button"
							role="option"
							aria-selected={keyboardNodeId === node.id}
							tabIndex={keyboardNodeId === node.id || (!keyboardNodeId && index === 0) ? 0 : -1}
							data-node-id={node.id}
							data-peak-focus-id={`graph-node-${node.id}`}
							className="pk-graph-node-list__item"
							onClick={() => {
								setKeyboardNodeId(node.id);
								dblRef.current?.({ id: node.id, path: node.path });
							}}
							onKeyDown={(event) => {
								if (event.key !== ' ') return;
								event.preventDefault();
								event.stopPropagation();
								tapRef.current?.({
									id: node.id,
									path: node.path,
									isHub: false,
									modKey: false,
								});
							}}
						>
							<span>{node.title || node.path || node.id}</span>
							<span>{node.path}</span>
						</Button>
					))}
			</div>
			)}
			{hoveredLabel && (() => {
				const [title, ...rest] = hoveredLabel.label.split('\n');
				const meta = rest.join(' ').trim();
				const path = hoveredLabel.path;
				return (
					<div className="pktw-absolute pktw-bottom-10 pktw-left-1/2 pktw--translate-x-1/2 pktw-z-30 pktw-pointer-events-none pktw-max-w-[80%]">
						<div className="pktw-rounded-lg pktw-bg-pk-surface-raised pktw-border pktw-border-pk-border pktw-shadow-md pktw-px-5 pktw-py-3 pktw-text-center">
							<span className="pktw-block pktw-text-lg pktw-font-semibold pktw-text-pk-text-primary pktw-break-all">{title}</span>
							{path && <span className="pktw-block pktw-mt-1 pktw-text-xs pktw-text-pk-text-tertiary pktw-break-all">{path}</span>}
							{meta && <span className="pktw-block pktw-mt-1 pktw-text-xs pktw-text-pk-text-tertiary">{meta}</span>}
						</div>
					</div>
				);
			})()}
			{overflowCount > 0 && (
				<span className="pktw-absolute pktw-bottom-2 pktw-left-1/2 pktw--translate-x-1/2 pktw-rounded-md pktw-bg-pk-surface-raised pktw-px-3 pktw-py-1 pktw-text-pk-sm pktw-text-pk-text-tertiary pktw-border pktw-border-pk-border pktw-z-10">
					{(overflowLabel ?? ((shown, total) => `Showing top ${shown} of ${total} results`))(nodeCap, nodeCap + overflowCount)}
				</span>
			)}
		</div>
	);
};
