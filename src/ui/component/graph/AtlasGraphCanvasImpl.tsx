/**
 * Shared cytoscape graph canvas.
 *
 * The single graph renderer for the plugin. Extracted from the Vault Search
 * Result Graph so File Atlas's read-only document-neighborhood graph reuses the
 * exact same rendering stack (spec Decision 2026-07-09: "reuse the Vault Search
 * Result Graph View rendering stack … do NOT build a second graph renderer").
 *
 * Feature parity with the 2026-07-07 sandbox: 5 presets (Constellation / Flow ↓
 * / Flow → / Folder tree / Orbit), full-depth folder compound grouping, isolated
 * grid, hover neighborhood + ancestor spotlight with marching-ants on hovered
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
import { Check, Image as ImageIcon, Workflow } from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import { coalesceGraphEdges } from '@/core/types/graph-edge';

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
	layout: 'fcose' | 'cola' | 'dagre-tb' | 'dagre-lr' | 'concentric-hub';
	groupFolder: boolean;
}
const PRESETS: Record<AtlasGraphPreset, PresetBundle> = {
	constellation: { layout: 'fcose',          groupFolder: false },
	'flow-tb':     { layout: 'dagre-tb',       groupFolder: false },
	'flow-lr':     { layout: 'dagre-lr',       groupFolder: false },
	folder:        { layout: 'cola',           groupFolder: true },
	orbit:         { layout: 'concentric-hub', groupFolder: false },
};

// ─── Palette (folder wash background) ───────────────────────────────────────
const FOLDER_COLORS = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#e0e7ff', '#fed7aa', '#ccfbf1', '#f5d0fe', '#fef9c3'];
function makeFolderColorPicker(): (folder: string) => string {
	const map = new Map<string, string>();
	return (folder) => {
		if (!folder) return '#f5f5f5';
		let c = map.get(folder);
		if (!c) {
			c = FOLDER_COLORS[map.size % FOLDER_COLORS.length];
			map.set(folder, c);
		}
		return c;
	};
}

/**
 * Turn subgraph → cytoscape elements. Isolation is decided by reference edges
 * only (hub_constituent is dropped from render + isolation logic altogether).
 */
function buildElements(
	sub: ResultSubgraphOutput,
	opts: { showSemantic: boolean; groupFolder: boolean },
	folderPicker: (folder: string) => string,
): ElementDefinition[] {
	const els: ElementDefinition[] = [];
	const visibleEdges = coalesceGraphEdges(
		sub.edges.filter((edge) => (
			edge.kind !== 'hub_constituent'
			&& (edge.kind !== 'semantic' || opts.showSemantic)
			&& edge.from !== edge.to
		)),
	);

	const refEndpoints = new Set<string>();
	for (const e of visibleEdges) {
		if (e.kind !== 'reference') continue;
		refEndpoints.add(e.from);
		refEndpoints.add(e.to);
	}
	const isolatedIds = new Set<string>(
		sub.resultNodes.filter((n) => !refEndpoints.has(n.id)).map((n) => n.id),
	);

	const folderChainMemo = new Map<string, Array<{ id: string; label: string; parentId?: string; depth: number; top: string }>>();
	const chainForPath = (rawPath: string) => {
		if (!rawPath) return [];
		let hit = folderChainMemo.get(rawPath);
		if (hit) return hit;
		const parts = rawPath.split('/');
		parts.pop();
		let cum = '';
		let prevId: string | undefined;
		const chain: Array<{ id: string; label: string; parentId?: string; depth: number; top: string }> = [];
		const top = parts[0] ?? '';
		for (const p of parts) {
			cum = cum ? `${cum}/${p}` : p;
			const id = `group:folder:${cum}`;
			chain.push({ id, label: p, parentId: prevId, depth: chain.length, top });
			prevId = id;
		}
		hit = chain;
		folderChainMemo.set(rawPath, hit);
		return hit;
	};

	if (opts.groupFolder) {
		const seen = new Set<string>();
		for (const n of sub.resultNodes) {
			for (const seg of chainForPath(n.path)) {
				if (seen.has(seg.id)) continue;
				seen.add(seg.id);
				els.push({
					group: 'nodes',
					data: { id: seg.id, label: seg.label, kind: 'folderGroup', parent: seg.parentId, color: folderPicker(seg.top), depth: seg.depth },
					classes: 'folderGroup',
				});
			}
		}
	}

	const degreeMap = new Map<string, number>();
	for (const e of visibleEdges) {
		degreeMap.set(e.from, (degreeMap.get(e.from) ?? 0) + 1);
		degreeMap.set(e.to, (degreeMap.get(e.to) ?? 0) + 1);
	}
	const DEGREE_CAP = 8;
	const HUBLIKE_THRESHOLD = 3;
	const normDegree = (id: string) => Math.min(degreeMap.get(id) ?? 0, DEGREE_CAP) / DEGREE_CAP;

	const maxScore = sub.resultNodes.reduce((m, n) => Math.max(m, n.score), 0) || 1;
	for (const h of sub.hubAnchors) {
		els.push({
			group: 'nodes',
			data: { id: h.id, label: `${h.title || h.path || h.id}\n(${h.constituentCount} constituents)`, path: h.path ?? '', kind: 'hub', score: 1, degreeNorm: normDegree(h.id) },
			classes: 'hub',
		});
	}
	for (const n of sub.resultNodes) {
		let parent: string | undefined;
		if (opts.groupFolder) {
			const chain = chainForPath(n.path);
			if (chain.length) parent = chain[chain.length - 1].id;
		}
		const degree = degreeMap.get(n.id) ?? 0;
		const isHublike = degree >= HUBLIKE_THRESHOLD;
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
				parent,
			},
			classes: `doc ${isolatedIds.has(n.id) ? 'isolated' : ''}${isHublike ? ' hublike' : ''}`.trim(),
		});
	}

	const seen = new Set<string>();
	for (const e of visibleEdges) {
		const key = `${e.kind}|${e.directionality}|${e.from}|${e.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		els.push({
			group: 'edges',
			data: {
				id: key,
				source: e.from,
				target: e.to,
				kind: e.kind,
				directionality: e.directionality,
			},
			classes: e.kind,
		});
	}

	return els;
}

// ─── Style — mirrors the sandbox's CSS spec ────────────────────────────────
const CYTOSCAPE_STYLES: cytoscape.Stylesheet[] = [
	{ selector: 'node.hub', style: { 'background-color': '#a78bfa', 'border-color': '#4c1d95', 'border-width': 4, shape: 'round-rectangle', width: 'label', height: 'label', 'padding-left': '18px', 'padding-right': '18px', 'padding-top': '12px', 'padding-bottom': '12px', label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '360px', 'font-size': 15, 'font-weight': 800, 'text-valign': 'center', 'text-halign': 'center', color: '#2e1065' } as never },
	{ selector: 'node.doc', style: { 'background-color': 'mapData(score, 0, 1, #f5f3ff, #c4b5fd)', 'border-color': '#a78bfa', 'border-width': 1, shape: 'round-rectangle', width: 'label', height: 'label', 'padding-left': '10px', 'padding-right': '10px', 'padding-top': '5px', 'padding-bottom': '5px', label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '360px', 'font-size': 10, 'text-valign': 'center', 'text-halign': 'center', color: '#1e1b4b', 'min-width': '80px' } as never },
	{ selector: 'node.doc.hublike', style: { 'background-color': '#c4b5fd', 'border-color': '#6d28d9', 'border-width': 3, 'padding-left': '14px', 'padding-right': '14px', 'padding-top': '9px', 'padding-bottom': '9px', 'font-size': 13, 'font-weight': 700, color: '#4c1d95' } as never },
	{ selector: 'node.doc.isolated', style: { opacity: 0.55, 'border-style': 'dashed' } as never },
	{ selector: 'node.folderGroup', style: { 'background-color': 'data(color)', 'background-opacity': 'mapData(depth, 0, 4, 0.55, 0.08)', 'border-color': '#94a3b8', 'border-width': 'mapData(depth, 0, 4, 1.6, 0.6)', 'border-style': 'dashed', shape: 'round-rectangle', label: 'data(label)', 'font-size': 'mapData(depth, 0, 4, 11, 8)', 'font-weight': 700, color: '#334155', 'text-valign': 'top', 'text-halign': 'left', 'text-margin-y': -4, 'text-margin-x': 8, padding: 'mapData(depth, 0, 4, 22, 10)' } as never },
	{ selector: 'edge', style: { 'curve-style': 'bezier', 'source-arrow-shape': 'none', 'target-arrow-shape': 'none', 'source-arrow-color': '#94a3b8', 'target-arrow-color': '#94a3b8', 'line-color': '#94a3b8', width: 1, 'arrow-scale': 0.7 } as never },
	{ selector: 'edge[directionality = "directed"]', style: { 'target-arrow-shape': 'triangle' } as never },
	{ selector: 'edge[directionality = "bidirectional"]', style: { 'source-arrow-shape': 'triangle', 'target-arrow-shape': 'triangle' } as never },
	{ selector: 'edge[directionality = "undirected"]', style: { 'source-arrow-shape': 'none', 'target-arrow-shape': 'none' } as never },
	{ selector: 'edge.reference', style: { 'line-color': '#334155', 'source-arrow-color': '#334155', 'target-arrow-color': '#334155', width: 1.4 } as never },
	{ selector: 'edge.semantic', style: { 'line-color': '#cbd5e1', 'source-arrow-color': '#cbd5e1', 'target-arrow-color': '#cbd5e1', 'line-style': 'dashed', width: 0.8, opacity: 0.7 } as never },
	{ selector: 'node', style: { 'transition-property': 'background-color, border-color, border-width, opacity', 'transition-duration': 260, 'transition-timing-function': 'ease-out' } as never },
	{ selector: 'edge', style: { 'transition-property': 'line-color, source-arrow-color, target-arrow-color, width, opacity', 'transition-duration': 260, 'transition-timing-function': 'ease-out' } as never },
	{ selector: '.dimmed', style: { opacity: 0.12 } as never },
	{ selector: 'node.highlighted', style: { 'border-color': '#f59e0b', 'border-width': 3, opacity: 1, 'z-index': 999 } as never },
	{ selector: 'edge.highlighted', style: { 'line-color': '#f59e0b', 'source-arrow-color': '#f59e0b', 'target-arrow-color': '#f59e0b', opacity: 1, 'z-index': 999, 'arrow-scale': 1.4 } as never },
	{ selector: 'edge.reference.highlighted', style: { 'line-style': 'solid', width: 2.6 } as never },
	{ selector: 'edge.semantic.highlighted', style: { 'line-style': 'dashed', 'line-dash-pattern': [10, 6], width: 2.0 } as never },
	{ selector: 'node.regionLabel', style: { 'background-opacity': 0, 'border-width': 0, label: 'data(label)', 'font-size': 11, 'font-weight': 700, color: '#94a3b8', 'text-transform': 'uppercase', 'letter-spacing': '2px', 'text-valign': 'center', 'text-halign': 'center', width: 200, height: 20 } as never },
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
		if (e.from === e.to || e.kind === 'hub_constituent') continue;
		if (e.directionality === 'bidirectional') {
			lines.push(`  ${sid(e.from)} <-->|${e.kind === 'semantic' ? 'sem' : 'ref'}| ${sid(e.to)}`);
			continue;
		}
		if (e.directionality === 'undirected') {
			lines.push(`  ${sid(e.from)} -.- ${sid(e.to)}`);
			continue;
		}
		lines.push(`  ${sid(e.from)} -->|${e.kind === 'semantic' ? 'sem' : 'ref'}| ${sid(e.to)}`);
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

export interface AtlasGraphCanvasProps {
	subgraph: ResultSubgraphOutput | null;
	preset: AtlasGraphPreset;
	showSemantic: boolean;
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
}

export const AtlasGraphCanvas: React.FC<AtlasGraphCanvasProps> = ({
	subgraph,
	preset,
	showSemantic,
	nodeCap = 100,
	emptyLabel = 'No results to graph.',
	buildingLabel = 'Building graph…',
	summary,
	overflowLabel,
	onNodeTap,
	onNodeDblTap,
	onNodeHover,
}) => {
	const [copiedMode, setCopiedMode] = useState<'mermaid' | 'image' | null>(null);
	const [hoveredLabel, setHoveredLabel] = useState<{ label: string; path: string } | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const cyRef = useRef<Core | null>(null);
	const animRef = useRef<number | null>(null);
	const folderPickerRef = useRef(makeFolderColorPicker());

	// Keep the latest callbacks without re-running the (expensive) cytoscape mount.
	const tapRef = useRef(onNodeTap);
	const dblRef = useRef(onNodeDblTap);
	const hoverRef = useRef(onNodeHover);
	tapRef.current = onNodeTap;
	dblRef.current = onNodeDblTap;
	hoverRef.current = onNodeHover;

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
		if (!containerRef.current || !subgraph) return;
		const bundle = PRESETS[preset];
		const els = buildElements(subgraph, { showSemantic, groupFolder: bundle.groupFolder }, folderPickerRef.current);
		if (animRef.current) cancelAnimationFrame(animRef.current);
		animRef.current = null;
		cyRef.current?.destroy();
		const cy = cytoscape({ container: containerRef.current, elements: els, style: CYTOSCAPE_STYLES, minZoom: 0.15, maxZoom: 3, wheelSensitivity: 0.2 });
		cyRef.current = cy;

		const shouldSplitIsolated = !bundle.groupFolder;
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
			cy.fit(undefined, 40);
		});
		layoutObj.run();

		let hoverTimer: ReturnType<typeof setTimeout> | null = null;
		const startEdgeAnimation = () => {
			if (animRef.current) cancelAnimationFrame(animRef.current);
			let offset = 0;
			let last = performance.now();
			const tick = (now: number) => {
				const dt = Math.min(now - last, 50);
				last = now;
				offset -= dt * 0.024;
				const edges = cy.edges('edge.highlighted');
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

		cy.on('mouseover', 'node', (evt) => {
			const n = evt.target as NodeSingular;
			if (n.hasClass('regionLabel')) return;
			const raw = (n.data('label') as string | undefined) ?? '';
			const rawPath = (n.data('path') as string | undefined) ?? '';
			if (raw) setHoveredLabel({ label: raw, path: rawPath });
			if (!n.hasClass('folderGroup')) hoverRef.current?.({ id: n.id(), path: rawPath });
			if (hoverTimer) clearTimeout(hoverTimer);
			hoverTimer = setTimeout(() => {
				const isCompound = n.hasClass('folderGroup');
				let highlight;
				if (isCompound) {
					const descendants = n.descendants();
					highlight = n.union(descendants).union(descendants.connectedEdges());
				} else {
					highlight = n.closedNeighborhood();
				}
				highlight = highlight.union(n.ancestors());
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
				stopEdgeAnimation();
				cy.batch(() => {
					cy.elements().removeClass('dimmed').removeClass('highlighted');
					cy.edges().removeStyle('line-dash-offset');
				});
			}, 120);
		});

		cy.on('tap', 'node', (evt) => {
			const n = evt.target as NodeSingular;
			if (n.hasClass('regionLabel') || n.hasClass('folderGroup')) return;
			const originalEvent = (evt as { originalEvent?: MouseEvent }).originalEvent;
			const modKey = !!(originalEvent && (originalEvent.metaKey || originalEvent.ctrlKey));
			tapRef.current?.({ id: n.id(), path: (n.data('path') as string | undefined) ?? '', isHub: n.hasClass('hub'), modKey });
		});
		cy.on('dbltap', 'node', (evt) => {
			const n = evt.target as NodeSingular;
			if (n.hasClass('regionLabel') || n.hasClass('folderGroup') || n.hasClass('hub')) return;
			dblRef.current?.({ id: n.id(), path: (n.data('path') as string | undefined) ?? '' });
		});
	}, [subgraph, preset, showSemantic]);

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

	return (
		<div className="pktw-relative pktw-w-full pktw-h-full pktw-overflow-hidden pktw-min-h-[420px]">
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
				<IconButton
					label={copiedMode === 'mermaid' ? 'Copied Mermaid to clipboard' : 'Copy graph as Mermaid'}
					onClick={handleCopyMermaid}
					data-active={copiedMode === 'mermaid' ? 'true' : undefined}
				>
					{copiedMode === 'mermaid'
						? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" />
						: <Workflow className="pktw-w-3.5 pktw-h-3.5" />}
				</IconButton>
				<IconButton
					label={copiedMode === 'image' ? 'Copied image to clipboard' : 'Copy graph as image'}
					onClick={handleCopyImage}
					data-active={copiedMode === 'image' ? 'true' : undefined}
				>
					{copiedMode === 'image'
						? <Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" />
						: <ImageIcon className="pktw-w-3.5 pktw-h-3.5" />}
				</IconButton>
			</div>
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
