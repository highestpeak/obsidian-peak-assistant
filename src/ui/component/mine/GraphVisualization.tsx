import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3-force';
import * as d3Selection from 'd3-selection';
import * as d3Drag from 'd3-drag';
import * as d3Zoom from 'd3-zoom';
import { ZoomIn, ZoomOut, Maximize2, Settings, Copy, ChevronDown, Check } from 'lucide-react';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { GraphPatch, GraphPatchEdge } from '@/ui/view/quick-search/store/graphPatches';
import type { GraphVisualEffect } from '@/ui/view/quick-search/store/graphAnimationStore';
import { ProgressBarSlider } from '@/ui/component/mine/ProgressBarSlider';
import { Button } from '../shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { openFile } from '@/core/utils/obsidian-utils';

interface GraphConfig {
	linkDistance: number;
	chargeStrength: number;
	collisionRadius: number;
}

const DEFAULT_CONFIG: GraphConfig = {
	linkDistance: 60,
	chargeStrength: -50,
	collisionRadius: 20,
};

const SLIDER_CONFIGS = {
	linkDistance: { min: 30, max: 500, step: 10 },
	chargeStrength: { min: -100, max: 50, step: 5 },
	collisionRadius: { min: 10, max: 80, step: 2 },
} as const;

type GraphVizEdgeKind = NonNullable<GraphPatchEdge['kind']>;

type GraphVizNode = {
	id: string;
	label: string;
	type: string;
	badges?: string[];
	r: number;
	x?: number;
	y?: number;
	fx?: number | null;
	fy?: number | null;
};

type GraphVizLink = {
	source: string | GraphVizNode;
	target: string | GraphVizNode;
	weight: number;
	kind: GraphVizEdgeKind;
};

function getLinkEndpointId(v: string | GraphVizNode): string {
	return typeof v === 'string' ? v : v.id;
}

/**
 * Clean node ID by removing common prefixes for better matching and display.
 * Normalizes various ID formats to a consistent form.
 */
function cleanNodeId(nodeId: string): string {
	if (!nodeId) return nodeId;

	// List of prefixes to remove for normalization
	const prefixes = ['node:', 'document:', 'file:', 'src:', 'note:'];

	let cleaned = nodeId;
	for (const prefix of prefixes) {
		if (cleaned.startsWith(prefix)) {
			cleaned = cleaned.substring(prefix.length);
			break; // Only remove one prefix
		}
	}

	// Normalize case for concept and tag IDs to improve matching
	// But keep the prefix for uniqueness
	if (cleaned.startsWith('concept:') || cleaned.startsWith('tag:') || cleaned.startsWith('edge:')) {
		return cleaned.toLowerCase();
	}

	return cleaned;
}

/**
 * Normalize node ID for matching purposes.
 * This is used to find nodes that might have different ID formats but represent the same entity.
 */
function normalizeNodeIdForMatching(nodeId: string): string {
	const cleaned = cleanNodeId(nodeId);

	// Remove common prefixes for matching
	const matchPrefixes = ['concept:', 'tag:', 'edge:'];
	for (const prefix of matchPrefixes) {
		if (cleaned.startsWith(prefix)) {
			return cleaned.substring(prefix.length).toLowerCase().trim();
		}
	}

	// For file paths, extract just the filename without extension for matching
	if (cleaned.includes('/')) {
		const parts = cleaned.split('/');
		const filename = parts[parts.length - 1];
		return filename.replace(/\.md$/i, '').toLowerCase().trim();
	}

	return cleaned.toLowerCase().trim();
}

function linkKey(l: GraphVizLink): string {
	const sourceId = cleanNodeId(getLinkEndpointId(l.source));
	const targetId = cleanNodeId(getLinkEndpointId(l.target));
	return `edge-${sourceId}::${targetId}::${l.kind}`;
}

export type GraphVisualizationHandle = {
	applyPatch: (patch: GraphPatch) => Promise<void>;
	clear: () => void;
	fitToView: () => void;
};

export type GraphSnapshot = {
	nodes: Array<Pick<GraphVizNode, 'id' | 'label' | 'type' | 'badges'>>;
	edges: Array<{ source: string; target: string; kind: GraphVizEdgeKind; weight: number }>;
};

type GraphCopyFormat = 'markdown' | 'json' | 'mermaid';

export const GraphVisualization = forwardRef<GraphVisualizationHandle, {
	graph?: GraphPreview | null;
	effect?: GraphVisualEffect;
	onSnapshotChange?: (snapshot: GraphSnapshot) => void;
}>(({ graph, effect, onSnapshotChange }, ref) => {
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const simulationRef = useRef<d3.Simulation<any, any> | null>(null);
	const zoomRef = useRef<d3Zoom.ZoomBehavior<Element, unknown> | null>(null);
	const zoomTransformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });

	const rootGRef = useRef<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>(null);
	const linksLayerRef = useRef<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>(null);
	const nodesLayerRef = useRef<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>(null);
	const labelsLayerRef = useRef<d3Selection.Selection<SVGGElement, unknown, null, undefined> | null>(null);

	const linkSelRef = useRef<d3Selection.Selection<SVGLineElement, GraphVizLink, SVGGElement, unknown> | null>(null);
	const nodeSelRef = useRef<d3Selection.Selection<SVGCircleElement, GraphVizNode, SVGGElement, unknown> | null>(null);
	const labelSelRef = useRef<d3Selection.Selection<SVGTextElement, GraphVizNode, SVGGElement, unknown> | null>(null);

	const nodesRef = useRef<GraphVizNode[]>([]);
	const linksRef = useRef<GraphVizLink[]>([]);

	const [config, setConfig] = useState<GraphConfig>(DEFAULT_CONFIG);
	const [showControls, setShowControls] = useState(false);
	const [zoomLevel, setZoomLevel] = useState(1);
	const [resizeTick, setResizeTick] = useState(0);
	const [version, setVersion] = useState(0);
	const [copyFormat, setCopyFormat] = useState<GraphCopyFormat>('markdown');
	const [copyMenuOpen, setCopyMenuOpen] = useState(false);
	const [copiedTick, setCopiedTick] = useState(0);

	const previewToPatch = useMemo(() => {
		return (g: GraphPreview): GraphPatch => ({
			upsertNodes: (g.nodes ?? []).map((n) => ({
				id: String(n.id),
				label: String(n.label ?? n.id),
				type: String((n as any).type ?? 'document'),
			})),
			upsertEdges: (g.edges ?? []).map((e) => ({
				from_node_id: String(e.from_node_id),
				to_node_id: String(e.to_node_id),
				weight: typeof e.weight === 'number' ? e.weight : 1,
				kind: 'physical',
			})),
			meta: { toolName: 'graph', label: 'Syncing graph…' },
		});
	}, []);

	// Track container resize for consistent viewBox.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setResizeTick((t) => t + 1));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	/**
	 * Initialize SVG layers and simulation once.
	 */
	useEffect(() => {
		if (!svgRef.current || !containerRef.current) return;

		const svg = d3Selection.select(svgRef.current);
		svg.selectAll('*').remove();

		const container = containerRef.current;
		const width = container.clientWidth || 400;
		const height = container.clientHeight || 400;
		svg.attr('viewBox', `0 0 ${width} ${height}`);

		const g = svg.append('g');
		rootGRef.current = g as any;
		linksLayerRef.current = g.append('g').attr('data-layer', 'links') as any;
		nodesLayerRef.current = g.append('g').attr('data-layer', 'nodes') as any;
		labelsLayerRef.current = g.append('g').attr('data-layer', 'labels') as any;

		const zoom = d3Zoom
			.zoom()
			.scaleExtent([0.01, 10])
			.on('zoom', (event) => {
				g.attr('transform', event.transform);
				setZoomLevel(event.transform.k);
				zoomTransformRef.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
			});
		zoomRef.current = zoom;
		svg.call(zoom as any);

		const simulation = d3
			.forceSimulation([] as any)
			.force(
				'link',
				d3
					.forceLink([] as any)
					.id((d: any) => d.id)
					.distance((d: any) => config.linkDistance + (1 - (d.weight || 1)) * 20)
					.strength(0.5),
			)
			.force('charge', d3.forceManyBody().strength(config.chargeStrength))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(config.collisionRadius));

		simulation.on('tick', () => {
			const linkSel = linkSelRef.current;
			const nodeSel = nodeSelRef.current;
			const labelSel = labelSelRef.current;
			if (!linkSel || !nodeSel || !labelSel) return;

			linkSel
				.attr('x1', (d: any) => (d.source as any).x)
				.attr('y1', (d: any) => (d.source as any).y)
				.attr('x2', (d: any) => (d.target as any).x)
				.attr('y2', (d: any) => (d.target as any).y);

			nodeSel.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
			labelSel.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
		});

		simulationRef.current = simulation;

		return () => {
			simulation.stop();
			simulationRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/**
	 * Resize: keep viewBox and center force aligned with container.
	 */
	useEffect(() => {
		if (!svgRef.current || !containerRef.current) return;
		const svg = d3Selection.select(svgRef.current);
		const container = containerRef.current;
		const width = container.clientWidth || 400;
		const height = container.clientHeight || 400;
		svg.attr('viewBox', `0 0 ${width} ${height}`);

		// Keep canvas resolution in sync with the container.
		const canvas = canvasRef.current;
		if (canvas) {
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.max(1, Math.floor(width * dpr));
			canvas.height = Math.max(1, Math.floor(height * dpr));
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			}
		}

		const sim = simulationRef.current;
		if (sim) {
			(sim.force('center') as any)?.x(width / 2);
			(sim.force('center') as any)?.y(height / 2);
			sim.alpha(0.2).restart();
		}
	}, [resizeTick]);

	/**
	 * Canvas overlay animations (scan / path / filter / semantic pulse).
	 * Draws in screen space but uses the same zoom transform as the SVG.
	 */
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let raf = 0;
		let alive = true;
		const start = effect?.startedAtMs ?? Date.now();

		const drawGlowDot = (x: number, y: number, r: number, color: string, alpha: number) => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.fillStyle = color;
			ctx.shadowColor = color;
			ctx.shadowBlur = r * 3;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		};

		const drawLineGlow = (x1: number, y1: number, x2: number, y2: number, color: string, width: number, alpha: number) => {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = color;
			ctx.lineWidth = width;
			ctx.shadowColor = color;
			ctx.shadowBlur = width * 4;
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			ctx.restore();
		};

		const loop = () => {
			if (!alive) return;
			const now = Date.now();
			const t = (now - start) / 1000;
			const width = container.clientWidth || 400;
			const height = container.clientHeight || 400;

			// Clear
			ctx.clearRect(0, 0, width, height);

			const effType = effect?.type ?? 'none';
			const intensity = Math.max(0, Math.min(1, effect?.intensity ?? 0));
			if (effType === 'none' || intensity <= 0) {
				raf = requestAnimationFrame(loop);
				return;
			}

			const tr = zoomTransformRef.current;
			const tx = tr.x;
			const ty = tr.y;
			const k = tr.k;
			const toScreen = (x?: number, y?: number) => ({
				x: (x ?? 0) * k + tx,
				y: (y ?? 0) * k + ty,
			});

			// Scan: sweeping band across viewport.
			if (effType === 'scan') {
				const bandY = ((t * 120) % (height + 120)) - 60;
				const grad = ctx.createLinearGradient(0, bandY - 40, 0, bandY + 40);
				grad.addColorStop(0, 'rgba(124,58,237,0)');
				grad.addColorStop(0.5, `rgba(124,58,237,${0.18 * intensity})`);
				grad.addColorStop(1, 'rgba(124,58,237,0)');
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, width, height);
			}

			// Filter: dim everything, then spotlight semantic-ish area (focus or semantic edges).
			if (effType === 'filter') {
				ctx.fillStyle = `rgba(17,24,39,${0.20 * intensity})`;
				ctx.fillRect(0, 0, width, height);

				const focus = new Set((effect?.focusNodeIds ?? []).map(String));
				// If no focus provided, spotlight semantic endpoints.
				if (focus.size === 0) {
					for (const l of linksRef.current) {
						if (l.kind !== 'semantic') continue;
						focus.add(getLinkEndpointId(l.source));
						focus.add(getLinkEndpointId(l.target));
					}
				}

				for (const n of nodesRef.current) {
					if (!focus.has(n.id)) continue;
					const p = toScreen(n.x, n.y);
					const pulse = 0.6 + 0.4 * Math.sin(t * 3);
					drawGlowDot(p.x, p.y, Math.max(6, n.r) * 0.9, '#60a5fa', 0.35 * intensity * pulse);
				}

				// Add a subtle scanline to reinforce "filtering".
				const bandX = ((t * 140) % (width + 140)) - 70;
				const gradX = ctx.createLinearGradient(bandX - 50, 0, bandX + 50, 0);
				gradX.addColorStop(0, 'rgba(96,165,250,0)');
				gradX.addColorStop(0.5, `rgba(96,165,250,${0.10 * intensity})`);
				gradX.addColorStop(1, 'rgba(96,165,250,0)');
				ctx.fillStyle = gradX;
				ctx.fillRect(0, 0, width, height);
			}

			// Path: moving photons along path edges.
			if (effType === 'path') {
				const pathEdges = linksRef.current.filter(l => l.kind === 'path');
				let idx = 0;
				for (const l of pathEdges) {
					const aNode = typeof l.source === 'string'
						? nodesRef.current.find(n => n.id === l.source)
						: l.source;
					const bNode = typeof l.target === 'string'
						? nodesRef.current.find(n => n.id === l.target)
						: l.target;
					if (!aNode || !bNode) continue;
					const a = toScreen(aNode.x, aNode.y);
					const b = toScreen(bNode.x, bNode.y);
					drawLineGlow(a.x, a.y, b.x, b.y, '#22c55e', 2.0, 0.18 * intensity);

					const phase = (t * 0.9 + idx * 0.15) % 1;
					const x = a.x + (b.x - a.x) * phase;
					const y = a.y + (b.y - a.y) * phase;
					drawGlowDot(x, y, 3.0, '#22c55e', 0.75 * intensity);
					idx++;
				}
			}

			// Semantic pulse: glow semantic edges + endpoints.
			if (effType === 'semantic') {
				const pulse = 0.5 + 0.5 * Math.sin(t * 4);
				for (const l of linksRef.current) {
					if (l.kind !== 'semantic') continue;
					const aNode = typeof l.source === 'string'
						? nodesRef.current.find(n => n.id === l.source)
						: l.source;
					const bNode = typeof l.target === 'string'
						? nodesRef.current.find(n => n.id === l.target)
						: l.target;
					if (!aNode || !bNode) continue;
					const a = toScreen(aNode.x, aNode.y);
					const b = toScreen(bNode.x, bNode.y);
					drawLineGlow(a.x, a.y, b.x, b.y, '#60a5fa', 1.5, 0.12 * intensity * pulse);
					drawGlowDot(a.x, a.y, 2.5, '#60a5fa', 0.35 * intensity * pulse);
					drawGlowDot(b.x, b.y, 2.5, '#60a5fa', 0.35 * intensity * pulse);
				}
			}

			raf = requestAnimationFrame(loop);
		};

		raf = requestAnimationFrame(loop);
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			ctx.clearRect(0, 0, container.clientWidth || 400, container.clientHeight || 400);
		};
	}, [effect?.type, effect?.intensity, effect?.startedAtMs, resizeTick]);

	/**
	 * Sync force config when controls change.
	 */
	useEffect(() => {
		const simulation = simulationRef.current;
		if (!simulation) return;

		const linkForce = simulation.force('link') as d3.ForceLink<any, any>;
		const chargeForce = simulation.force('charge') as d3.ForceManyBody<any>;
		const collisionForce = simulation.force('collision') as d3.ForceCollide<any>;

		if (linkForce) {
			linkForce.distance((d: any) => config.linkDistance + (1 - (d.weight || 1)) * 20);
		}
		if (chargeForce) {
			chargeForce.strength(config.chargeStrength);
		}
		if (collisionForce) {
			collisionForce.radius(config.collisionRadius);
		}
		simulation.alpha(0.25).restart();
	}, [config]);

	/**
	 * Emit a lightweight snapshot for parent UI (concept/tag list, external copy, etc.)
	 */
	const emitSnapshot = () => {
		if (!onSnapshotChange) return;
		const nodes = nodesRef.current.map((n) => ({
			id: n.id,
			label: n.label,
			type: n.type,
			badges: n.badges,
		}));
		const edges = linksRef.current.map((e) => ({
			source: getLinkEndpointId(e.source),
			target: getLinkEndpointId(e.target),
			kind: e.kind,
			weight: e.weight,
		}));
		onSnapshotChange({ nodes, edges });
	};

	function extractFilePathFromNode(node: GraphVizNode): string | null {
		const id = node.id ?? '';
		if (id.startsWith('file:')) return id.slice('file:'.length);
		if (id.startsWith('node:')) {
			const rest = id.slice('node:'.length);
			// Heuristic: some graphs use "node:<path>" for documents.
			if (rest.includes('/') || rest.toLowerCase().endsWith('.md')) return rest;
		}
		// If id itself looks like a path, allow it.
		if (id.includes('/') || id.toLowerCase().endsWith('.md')) return id;
		return null;
	}

	async function copyText(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedTick((t) => t + 1);
		} catch (e) {
			console.warn('[GraphVisualization] Failed to copy text:', e);
		}
	}

	function snapshotToMarkdown(snapshot: GraphSnapshot): string {
		const byType = (t: string) => snapshot.nodes.filter((n) => (n.type ?? 'document') === t);
		const docs = snapshot.nodes.filter((n) => !['concept', 'tag'].includes(n.type ?? 'document'));
		const concepts = byType('concept');
		const tags = byType('tag');
		const edgeCounts = snapshot.edges.reduce((acc, e) => {
			acc.total++;
			acc[e.kind] = (acc[e.kind] ?? 0) + 1;
			return acc;
		}, { total: 0 } as Record<string, number>);

		const lines: string[] = [];
		lines.push('## Knowledge Graph');
		lines.push('');
		lines.push(`- Nodes: **${snapshot.nodes.length}** (docs: ${docs.length}, concepts: ${concepts.length}, tags: ${tags.length})`);
		lines.push(`- Edges: **${snapshot.edges.length}** (physical: ${edgeCounts.physical ?? 0}, semantic: ${edgeCounts.semantic ?? 0}, path: ${edgeCounts.path ?? 0})`);
		lines.push('');

		if (concepts.length) {
			lines.push('### Concepts');
			for (const c of concepts.slice(0, 80)) {
				lines.push(`- ${c.label}`);
			}
			lines.push('');
		}

		if (tags.length) {
			lines.push('### Tags');
			for (const t of tags.slice(0, 80)) {
				lines.push(`- ${t.label}`);
			}
			lines.push('');
		}

		if (docs.length) {
			lines.push('### Documents');
			for (const d of docs.slice(0, 80)) {
				lines.push(`- ${d.label}`);
			}
			lines.push('');
		}

		// Keep edges concise to avoid huge clipboard payloads.
		if (snapshot.edges.length) {
			lines.push('### Edges (sample)');
			for (const e of snapshot.edges.slice(0, 120)) {
				lines.push(`- ${e.source} -> ${e.target} (${e.kind})`);
			}
			lines.push('');
		}
		return lines.join('\n');
	}

	function snapshotToMermaid(snapshot: GraphSnapshot): string {
		// Mermaid node IDs cannot contain spaces; create stable synthetic IDs.
		const nodes = snapshot.nodes.slice(0, 60);
		const idMap = new Map<string, string>();
		nodes.forEach((n, idx) => idMap.set(n.id, `n${idx}`));
		const esc = (s: string) => s.replace(/"/g, '\\"');

		const lines: string[] = [];
		lines.push('flowchart TD');
		for (const n of nodes) {
			const nid = idMap.get(n.id)!;
			const label = esc(n.label || n.id);
			lines.push(`${nid}["${label}"]`);
		}
		for (const e of snapshot.edges.slice(0, 120)) {
			const a = idMap.get(e.source);
			const b = idMap.get(e.target);
			if (!a || !b) continue;
			lines.push(`${a} -->|"${e.kind}"| ${b}`);
		}
		return lines.join('\n');
	}

	function snapshotToJson(snapshot: GraphSnapshot): string {
		return JSON.stringify(snapshot, null, 2);
	}

	async function handleCopy(format: GraphCopyFormat) {
		const snapshot: GraphSnapshot = {
			nodes: nodesRef.current.map((n) => ({ id: n.id, label: n.label, type: n.type, badges: n.badges })),
			edges: linksRef.current.map((e) => ({
				source: getLinkEndpointId(e.source),
				target: getLinkEndpointId(e.target),
				kind: e.kind,
				weight: e.weight,
			})),
		};

		if (format === 'json') return copyText(snapshotToJson(snapshot));
		if (format === 'mermaid') return copyText(snapshotToMermaid(snapshot));
		return copyText(snapshotToMarkdown(snapshot));
	}

	function renderJoin() {
		const linksLayer = linksLayerRef.current;
		const nodesLayer = nodesLayerRef.current;
		const labelsLayer = labelsLayerRef.current;
		const simulation = simulationRef.current;
		if (!linksLayer || !nodesLayer || !labelsLayer || !simulation) return;

		const nodes = nodesRef.current;
		const nodeById = new Map(nodes.map(n => [n.id, n] as const));

		// Resolve link endpoints to actual node objects to prevent D3 "node not found" crashes.
		// NOTE: d3-force may throw if forceLink().links(...) is called before simulation.nodes(...)
		// or if some endpoints cannot be resolved. We enforce a strict invariant here.
		const resolvedLinks: GraphVizLink[] = [];
		for (const link of linksRef.current) {
			const sourceId = getLinkEndpointId(link.source);
			const targetId = getLinkEndpointId(link.target);
			const sourceNode = nodeById.get(sourceId);
			const targetNode = nodeById.get(targetId);
			if (!sourceNode || !targetNode) {
				console.warn(
					`[GraphVisualization] Filtering out edge with non-existent node(s): `
					+ `source="${sourceId}" (exists: ${!!sourceNode}), target="${targetId}" (exists: ${!!targetNode})`,
				);
				continue;
			}

			// Force endpoints to be node objects (no implicit lookup in d3-force).
			(link as any).source = sourceNode;
			(link as any).target = targetNode;
			resolvedLinks.push(link);
		}
		linksRef.current = resolvedLinks;
		console.debug('[GraphVisualization] renderJoin', {
			nodes: nodes.length,
			edges: resolvedLinks.length,
		});

		// Always update nodes FIRST, then links, to avoid d3-force endpoint lookup on stale node list.
		simulation.nodes(nodes as any);
		(simulation.force('link') as any).links(resolvedLinks as any);
		simulation.alpha(0.7).restart();

		const linkSel = linksLayer
			.selectAll<SVGLineElement, GraphVizLink>('line')
			.data(resolvedLinks, (d) => linkKey(d));

		const linkEnter = linkSel
			.enter()
			.append('line')
			.attr('stroke', (d) => {
				if (d.kind === 'path') return '#22c55e';
				return '#d1d5db';
			})
			.attr('stroke-opacity', (d) => (d.kind === 'semantic' ? 0.25 : 0.4))
			.attr('stroke-dasharray', (d) => (d.kind === 'semantic' ? '4 3' : (d.kind === 'path' ? '2 2' : null)))
			.attr('stroke-width', (d) => {
				if (d.kind === 'path') return 2.5;
				return Math.max(1, Math.min(3, (d.weight || 1) * 2));
			})
			.attr('opacity', 0);

		linkEnter.transition().duration(200).attr('opacity', 1);
		linkSel.exit().transition().duration(150).attr('opacity', 0).remove();
		linkSelRef.current = linkEnter.merge(linkSel as any);

		const nodeSel = nodesLayer
			.selectAll<SVGCircleElement, GraphVizNode>('circle')
			.data(nodes, (d: any) => `node-${cleanNodeId(d.id)}-${d.type || 'unknown'}`);

		const nodeEnter = nodeSel
			.enter()
			.append('circle')
			.attr('stroke', '#fff')
			.attr('stroke-width', 2)
			.attr('r', 0)
			.attr('fill', (d) => {
				if (d.badges?.includes('Source')) return '#16a34a';
				if (d.badges?.includes('Sink')) return '#f97316';
				if (d.badges?.includes('bridge')) return '#2563eb';
				if (d.badges?.includes('hub')) return '#06b6d4';
				if (d.badges?.includes('authority')) return '#ef4444';
				if (d.type === 'tag') return '#8b5cf6';
				if (d.type === 'concept') return '#0ea5e9';
				return '#7c3aed';
			})
			.attr('opacity', 0)
			.style('cursor', 'grab')
			.on('click', async (_evt: any, d: GraphVizNode) => {
				// Click behavior:
				// - concept/tag: copy label
				// - document/file: try to open file, fallback to copy label
				try {
					if (d.type === 'concept' || d.type === 'tag') {
						await copyText(d.label);
						return;
					}
					const path = extractFilePathFromNode(d);
					if (!path) {
						await copyText(d.label || d.id);
						return;
					}
					const app = AppContext.getInstance().app;
					await openFile(app, path, true);
				} catch (e) {
					console.warn('[GraphVisualization] Node click failed:', e);
				}
			})
			.call(drag(simulation as any) as any);

		// Tooltip: always expose full label/id.
		nodeEnter.append('title').text((d) => `${d.label || d.id}\n${d.id}`);

		const nodeMerged = nodeEnter.merge(nodeSel as any);
		nodeMerged
			.select('title')
			.text((d: any) => `${d.label || d.id}\n${d.id}`);

		nodeEnter.transition().duration(260).attr('opacity', 1).attr('r', (d) => d.r);
		nodeSel.exit().transition().duration(150).attr('opacity', 0).attr('r', 0).remove();
		nodeSelRef.current = nodeMerged;

		const labelSel = labelsLayer
			.selectAll<SVGTextElement, GraphVizNode>('text')
			.data(nodes, (d: any) => `label-${cleanNodeId(d.id)}-${d.type || 'unknown'}`);

		const labelEnter = labelSel
			.enter()
			.append('text')
			.text((d) => {
				const text = d.label || 'Untitled';
				return text.length > 15 ? text.substring(0, 15) + '...' : text;
			})
			.attr('font-size', '9px')
			.attr('fill', '#4b5563')
			.attr('text-anchor', 'middle')
			.attr('dy', '20px')
			.style('pointer-events', 'none')
			.style('user-select', 'none')
			.style('font-weight', '500')
			.attr('opacity', 0);

		labelEnter.append('title').text((d) => `${d.label || d.id}\n${d.id}`);
		const labelMerged = labelEnter.merge(labelSel as any);
		labelMerged.select('title').text((d: any) => `${d.label || d.id}\n${d.id}`);

		labelEnter.transition().duration(260).attr('opacity', 1);
		labelSel.exit().transition().duration(150).attr('opacity', 0).remove();
		labelSelRef.current = labelMerged;
	}

	function upsertNodes(nodes: Array<{ id: string; label: string; type?: string; badges?: string[] }>) {
		const map = new Map(nodesRef.current.map((n) => [n.id, n]));
		for (const n of nodes) {
			const id = String(n.id);
			const existing = map.get(id);
			if (existing) {
				existing.label = String(n.label ?? existing.label);
				existing.type = String(n.type ?? existing.type);
				existing.badges = n.badges ?? existing.badges;
			} else {
				map.set(id, {
					id,
					label: String(n.label ?? id),
					type: String(n.type ?? 'document'),
					badges: n.badges,
					r: String(n.type ?? 'document') === 'document' ? 12 : 10,
				});
			}
		}
		nodesRef.current = Array.from(map.values()).slice(0, 80);
	}

	function upsertEdges(edges: Array<{ from_node_id: string; to_node_id: string; weight?: number; kind?: GraphVizEdgeKind }>) {
		const nodeIds = new Set(nodesRef.current.map(n => n.id));
		const map = new Map(linksRef.current.map((l) => [linkKey(l), l]));
		for (const e of edges) {
			const source = String(e.from_node_id);
			const target = String(e.to_node_id);

			// Skip edges that reference non-existent nodes
			if (!nodeIds.has(source) || !nodeIds.has(target)) {
				console.warn(`[GraphVisualization] Skipping edge with non-existent node(s): source="${source}" (exists: ${nodeIds.has(source)}), target="${target}" (exists: ${nodeIds.has(target)})`);
				continue;
			}

			const kind = (e.kind ?? 'unknown') as GraphVizEdgeKind;
			const weight = typeof e.weight === 'number' ? e.weight : 1;
			const k = `${source}::${target}::${kind}`;
			if (!map.has(k)) {
				map.set(k, { source, target, kind, weight });
			} else {
				map.get(k)!.weight = weight;
			}
		}
		linksRef.current = Array.from(map.values()).slice(0, 160);
	}

	async function applyPatch(patch: GraphPatch) {
		console.debug('[GraphVisualization] applyPatch start', patch?.meta ?? null);
		upsertNodes(patch.upsertNodes ?? []);
		upsertEdges((patch.upsertEdges ?? []) as any);

		if (patch.removeNodeIds?.length) {
			const removeSet = new Set(patch.removeNodeIds.map(String));
			nodesRef.current = nodesRef.current.filter((n) => !removeSet.has(n.id));
			linksRef.current = linksRef.current.filter(
				(l) => !removeSet.has(getLinkEndpointId(l.source)) && !removeSet.has(getLinkEndpointId(l.target)),
			);
		}

		// Seed new nodes near their neighbors to reduce layout jumps.
		const nodeById = new Map(nodesRef.current.map((n) => [n.id, n]));
		for (const l of linksRef.current) {
			const a = nodeById.get(getLinkEndpointId(l.source));
			const b = nodeById.get(getLinkEndpointId(l.target));
			if (!a || !b) continue;
			if ((a.x === undefined || a.y === undefined) && b.x !== undefined && b.y !== undefined) {
				a.x = b.x + (Math.random() - 0.5) * 10;
				a.y = b.y + (Math.random() - 0.5) * 10;
			}
			if ((b.x === undefined || b.y === undefined) && a.x !== undefined && a.y !== undefined) {
				b.x = a.x + (Math.random() - 0.5) * 10;
				b.y = a.y + (Math.random() - 0.5) * 10;
			}
		}

		// Clean up edges that reference non-existent nodes to prevent D3 errors
		const nodeIds = new Set(nodesRef.current.map(n => n.id));
		linksRef.current = linksRef.current.filter(link => {
			const sourceId = getLinkEndpointId(link.source);
			const targetId = getLinkEndpointId(link.target);
			const isValid = nodeIds.has(sourceId) && nodeIds.has(targetId);

			if (!isValid) {
				console.warn(`[GraphVisualization] Removing invalid edge during applyPatch: `
					+ `source="${sourceId}", target="${targetId}"`);
			}
			return isValid;
		});

		setVersion((v) => v + 1);
		renderJoin();
		emitSnapshot();
		console.debug('[GraphVisualization] applyPatch done', {
			meta: patch?.meta ?? null,
			nodes: nodesRef.current.length,
			edges: linksRef.current.length,
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 320));
	}

	/**
	 * Fit graph to viewport.
	 */
	const fitToView = () => {
		if (!svgRef.current || !zoomRef.current || nodesRef.current.length === 0) return;

		const nodes = nodesRef.current;
		let minX = Infinity, maxX = -Infinity;
		let minY = Infinity, maxY = -Infinity;

		nodes.forEach((n: any) => {
			if (n.x !== undefined && n.y !== undefined) {
				minX = Math.min(minX, n.x);
				maxX = Math.max(maxX, n.x);
				minY = Math.min(minY, n.y);
				maxY = Math.max(maxY, n.y);
			}
		});

		if (minX === Infinity || maxX === -Infinity) return;
		const container = containerRef.current;
		if (!container) return;

		const width = container.clientWidth || 400;
		const height = container.clientHeight || 400;
		const boundsWidth = maxX - minX;
		const boundsHeight = maxY - minY;
		const boundsCenterX = (minX + maxX) / 2;
		const boundsCenterY = (minY + maxY) / 2;

		const padding = 40;
		const scaleX = (width - padding * 2) / boundsWidth;
		const scaleY = (height - padding * 2) / boundsHeight;
		const scale = Math.min(scaleX, scaleY, 1);

		const translateX = width / 2 - boundsCenterX * scale;
		const translateY = height / 2 - boundsCenterY * scale;

		const finalTransform = d3Zoom.zoomIdentity.translate(translateX, translateY).scale(scale);
		const svg = d3Selection.select(svgRef.current);
		svg.call(zoomRef.current.transform as any, finalTransform);
		setZoomLevel(scale);
	};

	const handleZoom = (delta: number) => {
		if (!svgRef.current || !zoomRef.current) return;
		const svg = d3Selection.select(svgRef.current);
		const currentTransform = d3Zoom.zoomTransform(svg.node() as SVGSVGElement);
		const newScale = Math.max(0.01, Math.min(10, currentTransform.k * delta));
		const newTransform = d3Zoom.zoomIdentity
			.translate(currentTransform.x, currentTransform.y)
			.scale(newScale);
		svg.call(zoomRef.current.transform as any, newTransform);
		setZoomLevel(newScale);
	};

	const handleResetZoom = () => {
		fitToView();
	};

	const clear = () => {
		nodesRef.current = [];
		linksRef.current = [];
		setVersion((v) => v + 1);
		renderJoin();
		emitSnapshot();
	};

	useImperativeHandle(ref, () => ({ applyPatch, clear, fitToView }), [previewToPatch]);

	// Sync external graph snapshot into the current visualization.
	useEffect(() => {
		if (!graph) return;
		applyPatch(previewToPatch(graph));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [graph]);

	const hasData = nodesRef.current.length > 0;

	return (
		<div
			ref={containerRef}
			className="pktw-w-full pktw-aspect-square pktw-bg-[#fafafa] pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-relative pktw-overflow-hidden"
		>
			{/* Control Panel */}
			<div className="pktw-absolute pktw-top-2 pktw-right-2 pktw-z-10 pktw-flex pktw-gap-1">
				<div className="pktw-relative">
					<Button
						onClick={() => handleCopy(copyFormat)}
						className="pktw-p-1.5 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-shadow-sm hover:pktw-bg-[#f9fafb] pktw-transition-colors"
						title={`Copy (${copyFormat})`}
					>
						{copiedTick > 0 ? (
							<Check className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" />
						) : (
							<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
						)}
					</Button>
					<Button
						onClick={() => setCopyMenuOpen((v) => !v)}
						className="pktw-absolute -pktw-right-1 -pktw-bottom-1 pktw-w-4 pktw-h-4 pktw-p-0 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-shadow-sm hover:pktw-bg-[#f9fafb] pktw-transition-colors"
						title="Copy format"
					>
						<ChevronDown className="pktw-w-3 pktw-h-3 pktw-text-[#6c757d]" />
					</Button>

					{copyMenuOpen ? (
						<div className="pktw-absolute pktw-top-9 pktw-right-0 pktw-z-30 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-shadow-lg pktw-overflow-hidden">
							{(['markdown', 'json', 'mermaid'] as const).map((fmt) => (
								<button
									key={fmt}
									type="button"
									className="pktw-block pktw-w-full pktw-text-left pktw-px-3 pktw-py-2 pktw-text-xs hover:pktw-bg-[#f9fafb] pktw-text-[#2e3338]"
									onClick={() => {
										setCopyFormat(fmt);
										setCopyMenuOpen(false);
									}}
								>
									{fmt.toUpperCase()}
								</button>
							))}
						</div>
					) : null}
				</div>
				<Button
					onClick={() => handleZoom(1.2)}
					className="pktw-p-1.5 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-shadow-sm hover:pktw-bg-[#f9fafb] pktw-transition-colors"
					title="Zoom In"
				>
					<ZoomIn className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
				</Button>
				<Button
					onClick={() => handleZoom(1 / 1.2)}
					className="pktw-p-1.5 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-shadow-sm hover:pktw-bg-[#f9fafb] pktw-transition-colors"
					title="Zoom Out"
				>
					<ZoomOut className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
				</Button>
				<Button
					onClick={handleResetZoom}
					className="pktw-p-1.5 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded pktw-shadow-sm hover:pktw-bg-[#f9fafb] pktw-transition-colors"
					title="Fit to View"
				>
					<Maximize2 className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
				</Button>
				<Button
					onClick={() => setShowControls(!showControls)}
					className={`pktw-p-1.5 pktw-border pktw-rounded pktw-shadow-sm pktw-transition-colors ${showControls
							? 'pktw-bg-[#7c3aed] pktw-text-white pktw-border-[#7c3aed]'
							: 'pktw-bg-white pktw-text-[#6c757d] pktw-border-[#e5e7eb] hover:pktw-bg-[#f9fafb]'
						}`}
					title="Settings"
				>
					<Settings className="pktw-w-3.5 pktw-h-3.5" />
				</Button>
			</div>

			{/* Settings Panel */}
			{showControls && (
				<div className="pktw-absolute pktw-top-10 pktw-right-2 pktw-z-20 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-shadow-lg pktw-p-4 pktw-min-w-[240px]">
					<div className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338] pktw-mb-3">Graph Settings</div>
					<div className="pktw-mb-4">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Link Distance: {config.linkDistance}
						</label>
						<ProgressBarSlider
							value={config.linkDistance}
							min={SLIDER_CONFIGS.linkDistance.min}
							max={SLIDER_CONFIGS.linkDistance.max}
							step={SLIDER_CONFIGS.linkDistance.step}
							onChange={(value) => setConfig(prev => ({ ...prev, linkDistance: value }))}
							showTooltip={false}
						/>
					</div>
					<div className="pktw-mb-4">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Repulsion: {config.chargeStrength}
						</label>
						<ProgressBarSlider
							value={config.chargeStrength}
							min={SLIDER_CONFIGS.chargeStrength.min}
							max={SLIDER_CONFIGS.chargeStrength.max}
							step={SLIDER_CONFIGS.chargeStrength.step}
							onChange={(value) => setConfig(prev => ({ ...prev, chargeStrength: value }))}
							showTooltip={false}
						/>
					</div>
					<div className="pktw-mb-3">
						<label className="pktw-text-xs pktw-text-[#6c757d] pktw-block pktw-mb-1">
							Collision Radius: {config.collisionRadius}
						</label>
						<ProgressBarSlider
							value={config.collisionRadius}
							min={SLIDER_CONFIGS.collisionRadius.min}
							max={SLIDER_CONFIGS.collisionRadius.max}
							step={SLIDER_CONFIGS.collisionRadius.step}
							onChange={(value) => setConfig(prev => ({ ...prev, collisionRadius: value }))}
							showTooltip={false}
						/>
					</div>
					<Button
						onClick={() => {
							setConfig(DEFAULT_CONFIG);
							setTimeout(fitToView, 100);
						}}
						className="pktw-w-full pktw-px-3 pktw-py-1.5 pktw-text-xs pktw-bg-[#f3f4f6] pktw-text-[#6c757d] pktw-rounded pktw-border pktw-border-[#e5e7eb] hover:pktw-bg-[#e5e7eb] pktw-transition-colors"
					>
						Reset to Default
					</Button>
				</div>
			)}

			{/* Zoom Level Indicator */}
			<div className="pktw-absolute pktw-bottom-2 pktw-left-2 pktw-z-10 pktw-bg-white/80 pktw-backdrop-blur-sm pktw-px-2 pktw-py-1 pktw-rounded pktw-text-xs pktw-text-[#6c757d] pktw-border pktw-border-[#e5e7eb]">
				{Math.round(zoomLevel * 100)}%
			</div>

			<svg
				ref={svgRef}
				width="100%"
				height="100%"
				viewBox="0 0 400 400"
				className="pktw-cursor-move"
				style={{ touchAction: 'none' }}
			/>

			{/* Canvas overlay for procedural effects (scan/path/filter/semantic). */}
			<canvas
				ref={canvasRef}
				className="pktw-absolute pktw-inset-0 pktw-z-[5] pktw-pointer-events-none"
			/>

			{!hasData ? (
				<div className="pktw-absolute pktw-inset-0 pktw-flex pktw-items-center pktw-justify-center">
					<div className="pktw-text-sm pktw-text-[#999999]">Waiting for graph events…</div>
				</div>
			) : null}

			{/* Force a re-render when internal graph changes */}
			<span className="pktw-hidden">{version}</span>
		</div>
	);
});

/**
 * Drag behavior for nodes.
 */
function drag(simulation: d3.Simulation<any, any>) {
	function dragstarted(event: any, d: any) {
		if (!event.active) simulation.alphaTarget(0.3).restart();
		d.fx = d.x;
		d.fy = d.y;
	}

	function dragged(event: any, d: any) {
		d.fx = event.x;
		d.fy = event.y;
	}

	function dragended(event: any, d: any) {
		if (!event.active) simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
	}

	return d3Drag
		.drag()
		.on('start', dragstarted)
		.on('drag', dragged)
		.on('end', dragended);
}
