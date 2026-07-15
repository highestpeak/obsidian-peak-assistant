/**
 * Result Graph View — cytoscape.js port of the 2026-07-07 sandbox design.
 * `docs/research/2026-07-07-result-graph-layout/index.html` is the reference
 * implementation; this component keeps parity with it feature-for-feature:
 *
 *  - 5 presets (Constellation / Flow ↓ / Flow → / Folder tree / Orbit)
 *    switched via the store's `graphPreset` field; `graphShowSemantic`
 *    layered on top.
 *  - Full-depth folder tree grouping (Folder preset only) — every path
 *    segment becomes a compound parent, nested inside the previous.
 *  - Isolated docs relocate to a labeled grid below the connected cluster
 *    (sorted alphabetically for stable scanning).
 *  - Hover highlight expands to the closed neighborhood + ancestor
 *    breadcrumb (compound hover expands to the whole subtree).
 *  - Marching-ants animation on hovered semantic (dashed) edges; reference
 *    edges keep a static accent stroke.
 *  - Copy button emits a Mermaid flowchart for LLM analysis; icon swaps to
 *    a checkmark for 1.5 s after copy.
 *
 * `hub_constituent` edges are dropped entirely — hub docs are documents
 * themselves and their real cross-links show up as reference / semantic.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core, EdgeSingular, ElementDefinition, NodeSingular } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import cise from 'cytoscape-cise';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';
import { Check, Image as ImageIcon, Workflow } from 'lucide-react';
import { behaviorRecorder } from '@/ui/view/quick-search/rewrite/BehaviorContextRecorder';
import { useVaultSearchStore } from '../../store';
import type { GraphPreset } from '../../store/vaultSearchStore';
import { buildResultSubgraph, type ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { IconButton } from '@/ui/components/primitives';
import type { SearchResultItem } from '@/core/search/searchTypes';

const NODE_CAP = 100;

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

// ─── Preset bundle ──────────────────────────────────────────────────────────
interface PresetBundle {
	layout: 'fcose' | 'cola' | 'dagre-tb' | 'dagre-lr' | 'concentric-hub';
	groupFolder: boolean;
}
const PRESETS: Record<GraphPreset, PresetBundle> = {
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

/** Numeric match score of a raw search result. */
/** Resolve a Cytoscape node id back to its vault path (best-effort). Used to
 *  feed the AI-Suggest behavior recorder with real file paths, not opaque ids. */
function pathForNodeId(nodeId: string, results: SearchResultItem[]): string | null {
	const found = results.find((r) => (r.docId ?? r.path ?? r.id) === nodeId);
	return found?.path ?? null;
}

function scoreOf(r: SearchResultItem): number {
	const s = r.finalScore ?? r.score ?? 0;
	return Number.isFinite(s) ? s : 0;
}

/**
 * Turn subgraph → cytoscape elements. Isolation is decided by reference
 * edges only (hub_constituent is dropped from render + isolation logic
 * altogether). folderPicker seeds the depth-0 folder wash colors.
 */
function buildElements(
	sub: ResultSubgraphOutput,
	opts: { showSemantic: boolean; groupFolder: boolean },
	folderPicker: (folder: string) => string,
): ElementDefinition[] {
	const els: ElementDefinition[] = [];

	// Isolation criterion — only reference edges keep a doc "connected".
	const refEndpoints = new Set<string>();
	for (const e of sub.edges) {
		if (e.kind !== 'reference') continue;
		refEndpoints.add(e.from);
		refEndpoints.add(e.to);
	}
	const isolatedIds = new Set<string>(
		sub.resultNodes.filter((n) => !refEndpoints.has(n.id)).map((n) => n.id),
	);

	// Full-depth folder compound tree (Folder preset only). Each path segment
	// becomes a parent, nested inside the previous one; docs live inside the
	// deepest segment.
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
					data: {
						id: seg.id,
						label: seg.label,
						kind: 'folderGroup',
						parent: seg.parentId,
						color: folderPicker(seg.top),
						depth: seg.depth,
					},
					classes: 'folderGroup',
				});
			}
		}
	}

	// Degree map for visual weighting. Same filtering as edge emission so the
	// count matches what the user actually sees.
	const degreeMap = new Map<string, number>();
	for (const e of sub.edges) {
		if (e.kind === 'hub_constituent') continue;
		if (e.kind === 'semantic' && !opts.showSemantic) continue;
		if (e.from === e.to) continue;
		degreeMap.set(e.from, (degreeMap.get(e.from) ?? 0) + 1);
		degreeMap.set(e.to, (degreeMap.get(e.to) ?? 0) + 1);
	}
	// Cap at 8 so a runaway super-connector doesn't compress the rest of the
	// scale to invisibility. degreeNorm in [0,1] feeds cytoscape `mapData`.
	const DEGREE_CAP = 8;
	const HUBLIKE_THRESHOLD = 3;
	const normDegree = (id: string) => Math.min(degreeMap.get(id) ?? 0, DEGREE_CAP) / DEGREE_CAP;

	// Nodes
	const maxScore = sub.resultNodes.reduce((m, n) => Math.max(m, n.score), 0) || 1;
	for (const h of sub.hubAnchors) {
		els.push({
			group: 'nodes',
			data: {
				id: h.id,
				label: `${h.title || h.path || h.id}\n(${h.constituentCount} constituents)`,
				path: h.path ?? '',
				kind: 'hub',
				score: 1,
				degreeNorm: normDegree(h.id),
			},
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

	// Edges. reference always renders; semantic respects the store toggle;
	// hub_constituent is intentionally never emitted.
	const seen = new Set<string>();
	for (const e of sub.edges) {
		if (e.kind === 'hub_constituent') continue;
		if (e.kind === 'semantic' && !opts.showSemantic) continue;
		if (e.kind === 'reference' && !e) continue;
		if (e.from === e.to) continue;
		const key = `${e.kind}|${e.from}|${e.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		els.push({
			group: 'edges',
			data: { id: key, source: e.from, target: e.to, kind: e.kind },
			classes: e.kind,
		});
	}

	return els;
}

// ─── Style — mirrors the sandbox's CSS spec ────────────────────────────────
const CYTOSCAPE_STYLES: cytoscape.Stylesheet[] = [
	{
		selector: 'node.hub',
		style: {
			'background-color': '#a78bfa',
			'border-color': '#4c1d95',
			'border-width': 4,
			shape: 'round-rectangle',
			width: 'label',
			height: 'label',
			'padding-left': '18px', 'padding-right': '18px',
			'padding-top': '12px',  'padding-bottom': '12px',
			label: 'data(label)',
			'text-wrap': 'wrap',
			'text-max-width': '360px',
			'font-size': 15,
			'font-weight': 800,
			'text-valign': 'center',
			'text-halign': 'center',
			color: '#2e1065',
		} as never,
	},
	{
		selector: 'node.doc',
		style: {
			'background-color': 'mapData(score, 0, 1, #f5f3ff, #c4b5fd)',
			'border-color': '#a78bfa',
			'border-width': 1,
			shape: 'round-rectangle',
			width: 'label',
			height: 'label',
			'padding-left': '10px', 'padding-right': '10px',
			'padding-top': '5px',   'padding-bottom': '5px',
			label: 'data(label)',
			'text-wrap': 'wrap',
			'text-max-width': '360px',
			'font-size': 10,
			'text-valign': 'center',
			'text-halign': 'center',
			color: '#1e1b4b',
			'min-width': '80px',
		} as never,
	},
	{
		selector: 'node.doc.hublike',
		style: {
			'background-color': '#c4b5fd',
			'border-color': '#6d28d9',
			'border-width': 3,
			'padding-left': '14px', 'padding-right': '14px',
			'padding-top': '9px',   'padding-bottom': '9px',
			'font-size': 13,
			'font-weight': 700,
			color: '#4c1d95',
		} as never,
	},
	{
		selector: 'node.doc.isolated',
		style: {
			opacity: 0.55,
			'border-style': 'dashed',
		} as never,
	},
	{
		selector: 'node.folderGroup',
		style: {
			'background-color': 'data(color)',
			'background-opacity': 'mapData(depth, 0, 4, 0.55, 0.08)',
			'border-color': '#94a3b8',
			'border-width': 'mapData(depth, 0, 4, 1.6, 0.6)',
			'border-style': 'dashed',
			shape: 'round-rectangle',
			label: 'data(label)',
			'font-size': 'mapData(depth, 0, 4, 11, 8)',
			'font-weight': 700,
			color: '#334155',
			'text-valign': 'top',
			'text-halign': 'left',
			'text-margin-y': -4,
			'text-margin-x': 8,
			padding: 'mapData(depth, 0, 4, 22, 10)',
		} as never,
	},
	{
		selector: 'edge',
		style: {
			'curve-style': 'bezier',
			'target-arrow-shape': 'triangle',
			'target-arrow-color': '#94a3b8',
			'line-color': '#94a3b8',
			width: 1,
			'arrow-scale': 0.7,
		} as never,
	},
	{
		selector: 'edge.reference',
		style: { 'line-color': '#334155', 'target-arrow-color': '#334155', width: 1.4 } as never,
	},
	{
		selector: 'edge.semantic',
		style: {
			'line-color': '#cbd5e1',
			'target-arrow-color': '#cbd5e1',
			'line-style': 'dashed',
			width: 0.8,
			opacity: 0.7,
		} as never,
	},
	{ selector: 'node', style: { 'transition-property': 'background-color, border-color, border-width, opacity', 'transition-duration': 260, 'transition-timing-function': 'ease-out' } as never },
	{ selector: 'edge', style: { 'transition-property': 'line-color, target-arrow-color, width, opacity', 'transition-duration': 260, 'transition-timing-function': 'ease-out' } as never },
	{ selector: '.dimmed', style: { opacity: 0.12 } as never },
	{ selector: 'node.highlighted', style: { 'border-color': '#f59e0b', 'border-width': 3, opacity: 1, 'z-index': 999 } as never },
	{ selector: 'edge.highlighted', style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', opacity: 1, 'z-index': 999, 'arrow-scale': 1.4 } as never },
	{ selector: 'edge.reference.highlighted', style: { 'line-style': 'solid', width: 2.6 } as never },
	{ selector: 'edge.semantic.highlighted', style: { 'line-style': 'dashed', 'line-dash-pattern': [10, 6], width: 2.0 } as never },
	{
		selector: 'node.regionLabel',
		style: {
			'background-opacity': 0,
			'border-width': 0,
			label: 'data(label)',
			'font-size': 11,
			'font-weight': 700,
			color: '#94a3b8',
			'text-transform': 'uppercase',
			'letter-spacing': '2px',
			'text-valign': 'center',
			'text-halign': 'center',
			width: 200,
			height: 20,
		} as never,
	},
];

// ─── Layout config picker (matches sandbox `layoutConfig`) ─────────────────
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
			return {
				name: 'concentric',
				animate: true,
				concentric: (n: NodeSingular) => {
					if (n.data('kind') === 'hub') return 3;
					if (n.hasClass('isolated')) return 1;
					return 2;
				},
				levelWidth: () => 1,
				minNodeSpacing: 22,
				spacingFactor: 1.1,
			} as never;
	}
}

// ─── Isolated grid — same behavior as sandbox `layoutIsolatedGrid` ─────────
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
	cy.add({
		group: 'nodes',
		data: { id: '__label:isolated', label: 'Isolated matches', kind: 'regionLabel' },
		classes: 'regionLabel',
		position: { x: centerX, y: baseY - 40 },
	});
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
	for (const h of sub.hubAnchors) {
		lines.push(`  ${sid(h.id)}[["${escape(h.title || h.path || h.id)} · hub (${h.constituentCount})"]]:::hub`);
	}
	const isolatedSet = new Set(sub.isolatedDocIds);
	for (const n of sub.resultNodes) {
		const cls = isolatedSet.has(n.id) ? ':::iso' : '';
		lines.push(`  ${sid(n.id)}["${escape(n.title || n.path || n.id)}"]${cls}`);
	}
	for (const e of sub.edges) {
		if (e.from === e.to) continue;
		if (e.kind === 'reference') lines.push(`  ${sid(e.from)} -->|ref| ${sid(e.to)}`);
		else if (e.kind === 'semantic') lines.push(`  ${sid(e.from)} -.->|sem| ${sid(e.to)}`);
	}
	lines.push('  classDef hub fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#4c1d95');
	lines.push('  classDef iso fill:#f5f5f5,stroke:#cbd5e1,stroke-dasharray:3 3,color:#64748b');
	return lines.join('\n');
}

interface ResultGraphViewProps {
	onClose?: () => void;
	onOpenHubGraphSubview?: (hubNodeId: string) => void;
	onSelectForInspector?: (path: string) => void;
}

export const ResultGraphView: React.FC<ResultGraphViewProps> = ({ onClose, onOpenHubGraphSubview, onSelectForInspector }) => {
	const results = useVaultSearchStore((s) => s.lastSearchResults);
	const preset = useVaultSearchStore((s) => s.graphPreset);
	const showSemantic = useVaultSearchStore((s) => s.graphShowSemantic);
	const { vaultNavigation, resultSubgraph: resultSubgraphDeps } = useServiceContext();

	const [subgraph, setSubgraph] = useState<ResultSubgraphOutput | null>(null);
	const [copiedMode, setCopiedMode] = useState<'mermaid' | 'image' | null>(null);
	const [hoveredLabel, setHoveredLabel] = useState<{ label: string; path: string } | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const cyRef = useRef<Core | null>(null);
	const animRef = useRef<number | null>(null);
	const folderPickerRef = useRef(makeFolderColorPicker());

	// Rebuild subgraph when results change. Baseline synth (from raw results)
	// runs first so the graph is never blank; enrichment refines it.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!results.length) {
				setSubgraph({ resultNodes: [], hubAnchors: [], edges: [], isolatedDocIds: [], overflowCount: 0 });
				return;
			}
			const scoreById = new Map<string, number>();
			const baselineNodes: ResultSubgraphOutput['resultNodes'] = [];
			const baselineIds: string[] = [];
			for (const r of results) {
				const id = r.docId ?? r.path ?? r.id;
				if (!id) continue;
				if (scoreById.has(id)) {
					scoreById.set(id, Math.max(scoreById.get(id)!, scoreOf(r)));
					continue;
				}
				scoreById.set(id, scoreOf(r));
				baselineIds.push(id);
				baselineNodes.push({
					id,
					path: r.path ?? '',
					title: r.title || r.path || id,
					score: scoreOf(r),
					communityId: null,
					folder: r.path ? (r.path.split('/')[0] ?? '') : '',
				});
			}
			const baseline: ResultSubgraphOutput = {
				resultNodes: baselineNodes,
				hubAnchors: [],
				edges: [],
				isolatedDocIds: baselineIds,
				overflowCount: 0,
			};
			if (!cancelled) setSubgraph(baseline);
			if (!resultSubgraphDeps) return;
			try {
				const sub = await buildResultSubgraph(resultSubgraphDeps, {
					resultDocIds: baselineIds,
					matchScores: scoreById,
					nodeCap: NODE_CAP,
				});
				const byId = new Map(baselineNodes.map((n) => [n.id, n]));
				const enriched: ResultSubgraphOutput = {
					...sub,
					resultNodes: sub.resultNodes.map((n) => {
						const src = byId.get(n.id);
						return {
							...n,
							title: n.title || src?.title || src?.path || n.id,
							path: n.path || src?.path || '',
							folder: n.folder || src?.folder || '',
						};
					}),
				};
				if (!cancelled) setSubgraph(enriched);
			} catch (err) {
				// eslint-disable-next-line no-console
				console.warn('[ResultGraphView] buildResultSubgraph failed, keeping baseline', err);
			}
		})();
		return () => { cancelled = true; };
	}, [results, resultSubgraphDeps]);

	// Mount / tear down cytoscape when the mount point appears / disappears.
	useEffect(() => {
		ensureExtensionsRegistered();
		return () => {
			if (animRef.current) cancelAnimationFrame(animRef.current);
			animRef.current = null;
			cyRef.current?.destroy();
			cyRef.current = null;
		};
	}, []);

	// Full redraw whenever subgraph, preset, or semantic toggle changes.
	useEffect(() => {
		if (!containerRef.current || !subgraph) return;
		const bundle = PRESETS[preset];
		const els = buildElements(subgraph, { showSemantic, groupFolder: bundle.groupFolder }, folderPickerRef.current);
		if (animRef.current) cancelAnimationFrame(animRef.current);
		animRef.current = null;
		cyRef.current?.destroy();
		const cy = cytoscape({
			container: containerRef.current,
			elements: els,
			style: CYTOSCAPE_STYLES,
			minZoom: 0.15,
			maxZoom: 3,
			wheelSensitivity: 0.2,
		});
		cyRef.current = cy;

		// Folder tree preset needs the isolated grid to skip splitting so the
		// folder parent doesn't stretch to swallow the moved grid area.
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

		// Hover neighborhood + ancestor breadcrumb spotlight
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

		// Behavior recorder timer for Graph hover — same 800ms threshold as
		// the list / tree rows so signals are comparable across views.
		let recorderHoverTimer: ReturnType<typeof setTimeout> | null = null;
		cy.on('mouseover', 'node', (evt) => {
			const n = evt.target as NodeSingular;
			if (n.hasClass('regionLabel')) return;
			// Update the bottom preview immediately so users can read tiny labels
			// without waiting for the 80ms spotlight debounce.
			const raw = (n.data('label') as string | undefined) ?? '';
			const rawPath = (n.data('path') as string | undefined) ?? '';
			if (raw) setHoveredLabel({ label: raw, path: rawPath });
			// Report to AI-Suggest recorder after 800ms of hover on any node
			// that maps to a real file (skip compound folder groups).
			if (recorderHoverTimer) clearTimeout(recorderHoverTimer);
			if (!n.hasClass('folderGroup') && !n.hasClass('regionLabel')) {
				recorderHoverTimer = setTimeout(() => {
					const path = pathForNodeId(n.id(), results);
					if (path) behaviorRecorder.push('focusedFile', { path, durationMs: 800 });
				}, 800);
			}
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
			if (recorderHoverTimer) { clearTimeout(recorderHoverTimer); recorderHoverTimer = null; }
			if (hoverTimer) clearTimeout(hoverTimer);
			hoverTimer = setTimeout(() => {
				stopEdgeAnimation();
				cy.batch(() => {
					cy.elements().removeClass('dimmed').removeClass('highlighted');
					cy.edges().removeStyle('line-dash-offset');
				});
			}, 120);
		});

		// Selection surfaces to inspector; double-click opens the doc; Cmd+click
		// on a hub anchor triggers the hub-graph subview.
		cy.on('tap', 'node', async (evt) => {
			const n = evt.target as NodeSingular;
			if (n.hasClass('regionLabel') || n.hasClass('folderGroup')) return;
			const originalEvent = (evt as { originalEvent?: MouseEvent }).originalEvent;
			const modKey = !!(originalEvent && (originalEvent.metaKey || originalEvent.ctrlKey));
			if (modKey && n.hasClass('hub')) {
				onOpenHubGraphSubview?.(n.id());
				return;
			}
			if (n.hasClass('hub')) {
				const hub = subgraph.hubAnchors.find((h) => h.id === n.id());
				if (hub?.path) await vaultNavigation.openLink(hub.path, { newLeaf: 'tab' });
				return;
			}
			// resultDoc: propagate to inspector
			const found = results.find((r) => (r.docId ?? r.path ?? r.id) === n.id());
			if (found?.path) {
				behaviorRecorder.push('focusedFile', { path: found.path });
				onSelectForInspector?.(found.path);
			}
		});
		cy.on('dbltap', 'node', async (evt) => {
			const n = evt.target as NodeSingular;
			if (n.hasClass('regionLabel') || n.hasClass('folderGroup') || n.hasClass('hub')) return;
			const found = results.find((r) => (r.docId ?? r.path ?? r.id) === n.id());
			if (!found) return;
			behaviorRecorder.push('openedFile', { path: found.path });
			await createOpenSourceCallback(onClose, true, vaultNavigation)(found);
		});
	}, [subgraph, preset, showSemantic, results, resultSubgraphDeps, vaultNavigation, onOpenHubGraphSubview, onSelectForInspector, onClose]);

	const handleCopyMermaid = useCallback(() => {
		if (!subgraph) return;
		try {
			void navigator.clipboard.writeText(subgraphToMermaid(subgraph));
			setCopiedMode('mermaid');
			window.setTimeout(() => setCopiedMode(null), 1500);
		} catch (err) {
			// eslint-disable-next-line no-console
			console.warn('[ResultGraphView] clipboard write failed', err);
		}
	}, [subgraph]);

	const handleCopyImage = useCallback(async () => {
		const cy = cyRef.current;
		if (!cy) return;
		try {
			// Cytoscape's `blob-promise` output routes through `canvas.toBlob()`
			// which returns null in Electron for large offscreen canvases. Take
			// the base64 dataURL path and decode manually — reliable across
			// canvas sizes. `maxWidth`/`maxHeight` clamp scale to keep the PNG
			// under Electron's clipboard ceiling for very large graphs.
			const dataUrl = (cy.png as unknown as (opts: Record<string, unknown>) => string)({
				full: true,
				bg: '#ffffff',
				scale: 2,
				maxWidth: 4096,
				maxHeight: 4096,
			});
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
			console.warn('[ResultGraphView] copy-as-image failed', err);
		}
	}, []);

	const overflowCount = subgraph?.overflowCount ?? 0;
	const emptyMessage = useMemo(() => {
		if (!subgraph) return 'Building graph…';
		if (!subgraph.resultNodes.length) return 'No results to graph.';
		return null;
	}, [subgraph]);

	return (
		<div className="pktw-relative pktw-w-full pktw-h-full pktw-overflow-hidden" style={{ minHeight: 420 }}>
			<div ref={containerRef} className="pktw-absolute pktw-inset-0" />
			{emptyMessage && (
				<div className="pktw-absolute pktw-inset-0 pktw-flex pktw-items-center pktw-justify-center pktw-p-6 pktw-text-sm pktw-text-pk-text-tertiary">
					{emptyMessage}
				</div>
			)}
			<div className="pktw-absolute pktw-top-2 pktw-right-2 pktw-z-20 pktw-flex pktw-gap-1">
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
					<div
						className="pktw-absolute pktw-bottom-10 pktw-left-1/2 pktw--translate-x-1/2 pktw-z-30 pktw-pointer-events-none pktw-max-w-[80%]"
					>
						<div className="pktw-rounded-lg pktw-bg-pk-surface-raised pktw-border pktw-border-pk-border pktw-shadow-md pktw-px-5 pktw-py-3 pktw-text-center">
							<span className="pktw-block pktw-text-lg pktw-font-semibold pktw-text-pk-text-primary pktw-break-all">
								{title}
							</span>
							{path && (
								<span className="pktw-block pktw-mt-1 pktw-text-xs pktw-text-pk-text-tertiary pktw-break-all">
									{path}
								</span>
							)}
							{meta && (
								<span className="pktw-block pktw-mt-1 pktw-text-xs pktw-text-pk-text-tertiary">
									{meta}
								</span>
							)}
						</div>
					</div>
				);
			})()}
			{overflowCount > 0 && (
				<span className="pktw-absolute pktw-bottom-2 pktw-left-1/2 pktw--translate-x-1/2 pktw-rounded-md pktw-bg-pk-surface-raised pktw-px-3 pktw-py-1 pktw-text-[11px] pktw-text-pk-text-tertiary pktw-border pktw-border-pk-border pktw-z-10">
					{`Showing top ${NODE_CAP} of ${NODE_CAP + overflowCount} results`}
				</span>
			)}
		</div>
	);
};
