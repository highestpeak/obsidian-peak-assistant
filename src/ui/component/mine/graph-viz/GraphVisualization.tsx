import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3-force';
import * as d3Selection from 'd3-selection';
import * as d3Drag from 'd3-drag';
import type { D3DragEvent } from 'd3-drag';
import * as d3Zoom from 'd3-zoom';
import type { GraphPatch } from '@/ui/component/mine/graph-viz/utils/graphPatches';
import type { GraphVisualEffect } from '@/ui/component/mine/graph-viz/graphAnimationStore';
import {
	DEFAULT_CONFIG,
	SLIDER_CONFIGS,
	type GraphConfig,
	type GraphCopyFormat,
} from './config';
import { snapshotToMarkdown, snapshotToMermaid, snapshotToJson } from './formatters';
import type { SnapshotMarkdownOptions } from './formatters';
import type {
	GraphVizNode,
	GraphVizLink,
	GraphVizNodeInfo,
	GraphVizNodeHoverInfo,
	UIPreviewGraph,
	EdgeStyle,
} from './types';
import { getLinkEndpointId, linkKey } from './utils/link-key';
import { previewToPatch } from './utils/preview-to-patch';
import { GraphToolbar } from './components/GraphToolbar';
import { GraphSettingsPanel } from './components/GraphSettingsPanel';
import { GraphEmptyState } from './components/GraphEmptyState';
import { GraphEffectsCanvas } from './components/GraphEffectsCanvas';

export type { GraphVisualizationHandle, GraphVizNodeInfo, GraphVizNodeHoverInfo, UIPreviewGraph, GraphUINode, GraphUIEdge, GraphSnapshot, EdgeStyle, NodeStyle } from './types';

export interface GraphVisualizationProps {
	graph?: UIPreviewGraph | null;
	effect?: GraphVisualEffect;
	containerClassName?: string;
	showToolbar?: boolean;
	showSettings?: boolean;
	showCopy?: boolean;
	showZoom?: boolean;
	emptyMessage?: string;
	defaultNodeType: string;
	defaultEdgeKind: string;
	normalizeNodeId?: (id: string) => string;
	snapshotMarkdownOptions: SnapshotMarkdownOptions;
	getEdgeStyle: (edge: { kind: string; weight: number }) => EdgeStyle;
	getNodeStyle: (node: GraphVizNode) => { fill?: string; r?: number };
	getNodeLabel: (node: GraphVizNode, mode: 'full' | 'short') => string;
	extractPathFromNode: (node: GraphVizNode) => string | null;
	effectKindMap: Partial<Record<string, string[]>>;
	onNodeClick?: (node: GraphVizNodeInfo) => void | Promise<void>;
	onNodeHover?: (info: GraphVizNodeHoverInfo | null) => void;
	onNodeContextMenu?: (pos: { x: number; y: number }, node: GraphVizNodeInfo) => void;
}

export const GraphVisualization = forwardRef<
	import('./types').GraphVisualizationHandle,
	GraphVisualizationProps
>(function GraphVisualization(
	{
		graph,
		effect,
		containerClassName,
		showToolbar = true,
		showSettings = true,
		showCopy = true,
		showZoom = true,
		emptyMessage = 'Waiting for graph events…',
		defaultNodeType,
		defaultEdgeKind,
		normalizeNodeId = (id) => id,
		snapshotMarkdownOptions,
		getEdgeStyle,
		getNodeStyle,
		getNodeLabel,
		extractPathFromNode,
		onNodeClick: onNodeClickProp,
		onNodeHover,
		onNodeContextMenu,
		effectKindMap,
	},
	ref
) {
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const simulationRef = useRef<d3.Simulation<GraphVizNode, GraphVizLink> | null>(null);
	const zoomRef = useRef<d3Zoom.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
	const zoomTransformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
	const userInteractedRef = useRef<boolean>(false);
	const settleTimerRef = useRef<number | null>(null);

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
	const [copyFormat, setCopyFormat] = useState<GraphCopyFormat>('markdown');
	const [copyMenuOpen, setCopyMenuOpen] = useState(false);
	const [copiedTick, setCopiedTick] = useState(0);
	const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const settingsButtonRef = useRef<HTMLButtonElement>(null);
	const [settingsPanelPosition, setSettingsPanelPosition] = useState<{ top: number; right: number } | null>(null);
	const [version, setVersion] = useState(0);

	const previewToPatchFn = useMemo(
		() => (g: UIPreviewGraph) =>
			previewToPatch(g, { defaultNodeType, defaultEdgeKind }),
		[defaultNodeType, defaultEdgeKind]
	);

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			if (copyResetTimerRef.current != null) {
				clearTimeout(copyResetTimerRef.current);
				copyResetTimerRef.current = null;
			}
			setCopiedTick((t) => t + 1);
			copyResetTimerRef.current = setTimeout(() => {
				setCopiedTick(0);
				copyResetTimerRef.current = null;
			}, 1000);
		} catch (e) {
			console.warn('[GraphVisualization] Failed to copy text:', e);
		}
	};

	const onNodeClick = onNodeClickProp;

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setResizeTick((t) => t + 1));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		if (!svgRef.current || !containerRef.current) return;

		const svg = d3Selection.select(svgRef.current);
		svg.selectAll('*').remove();

		const container = containerRef.current;
		const width = container.clientWidth || 400;
		const height = container.clientHeight || 400;
		svg.attr('viewBox', `0 0 ${width} ${height}`);

		const g = svg.append('g');
		rootGRef.current = g as unknown as typeof rootGRef.current;
		linksLayerRef.current = g.append('g').attr('data-layer', 'links') as unknown as typeof linksLayerRef.current;
		nodesLayerRef.current = g.append('g').attr('data-layer', 'nodes') as unknown as typeof nodesLayerRef.current;
		labelsLayerRef.current = g.append('g').attr('data-layer', 'labels') as unknown as typeof labelsLayerRef.current;

		const zoom = d3Zoom
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.01, 10])
			.on('zoom', (event) => {
				if ((event as { sourceEvent?: unknown }).sourceEvent) {
					userInteractedRef.current = true;
				}
				g.attr('transform', event.transform);
				setZoomLevel(event.transform.k);
				zoomTransformRef.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
			});
		zoomRef.current = zoom;
		svg.call(zoom);

		const simulation = d3
			.forceSimulation<GraphVizNode, GraphVizLink>([] as GraphVizNode[])
			.force(
				'link',
				d3
					.forceLink<GraphVizNode, GraphVizLink>([] as GraphVizLink[])
					.id((d) => d.id)
					.distance((d: { weight?: number }) => config.linkDistance + (1 - (d.weight || 1)) * 20)
					.strength(0.5)
			)
			.force('charge', d3.forceManyBody<GraphVizNode>().strength(config.chargeStrength))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide<GraphVizNode>().radius(config.collisionRadius));
		simulation.velocityDecay(0.6);

		simulation.on('tick', () => {
			const linkSel = linkSelRef.current;
			const nodeSel = nodeSelRef.current;
			const labelSel = labelSelRef.current;
			if (!linkSel || !nodeSel || !labelSel) return;

			linkSel
				.attr('x1', (d) => (d.source as GraphVizNode).x!)
				.attr('y1', (d) => (d.source as GraphVizNode).y!)
				.attr('x2', (d) => (d.target as GraphVizNode).x!)
				.attr('y2', (d) => (d.target as GraphVizNode).y!);

			nodeSel.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!);
			labelSel.attr('x', (d) => d.x!).attr('y', (d) => d.y!);
		});

		simulationRef.current = simulation;

		return () => {
			simulation.stop();
			simulationRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!svgRef.current || !containerRef.current) return;
		const svg = d3Selection.select(svgRef.current);
		const container = containerRef.current;
		const width = container.clientWidth || 400;
		const height = container.clientHeight || 400;
		svg.attr('viewBox', `0 0 ${width} ${height}`);

		if (zoomRef.current) {
			const t = zoomTransformRef.current;
			const transform = d3Zoom.zoomIdentity.translate(t.x, t.y).scale(t.k);
			svg.call(zoomRef.current.transform, transform);
		}

		const canvas = canvasRef.current;
		if (canvas) {
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.max(1, Math.floor(width * dpr));
			canvas.height = Math.max(1, Math.floor(height * dpr));
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			const ctx = canvas.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		const sim = simulationRef.current;
		if (sim) {
			(sim.force('center') as d3.ForceCenter<GraphVizNode>)?.x(width / 2);
			(sim.force('center') as d3.ForceCenter<GraphVizNode>)?.y(height / 2);
			sim.alpha(0.2).restart();
		}
	}, [resizeTick]);

	useEffect(() => {
		const simulation = simulationRef.current;
		if (!simulation) return;

		const linkForce = simulation.force('link') as d3.ForceLink<GraphVizNode, GraphVizLink>;
		const chargeForce = simulation.force('charge') as d3.ForceManyBody<GraphVizNode>;
		const collisionForce = simulation.force('collision') as d3.ForceCollide<GraphVizNode>;

		if (linkForce) linkForce.distance((d: { weight?: number }) => config.linkDistance + (1 - (d.weight || 1)) * 20);
		if (chargeForce) chargeForce.strength(config.chargeStrength);
		if (collisionForce) collisionForce.radius(config.collisionRadius);
		simulation.alpha(0.25).restart();
	}, [config]);

	useEffect(() => () => {
		if (copyResetTimerRef.current != null) clearTimeout(copyResetTimerRef.current);
	}, []);

	function renderJoin() {
		const linksLayer = linksLayerRef.current;
		const nodesLayer = nodesLayerRef.current;
		const labelsLayer = labelsLayerRef.current;
		const simulation = simulationRef.current;
		if (!linksLayer || !nodesLayer || !labelsLayer || !simulation) return;

		const nodes = nodesRef.current;
		const nodeById = new Map(nodes.map((n) => [n.id, n] as const));

		const resolvedLinks: GraphVizLink[] = [];
		for (const link of linksRef.current) {
			const sourceId = getLinkEndpointId(link.source);
			const targetId = getLinkEndpointId(link.target);
			const sourceNode = nodeById.get(sourceId);
			const targetNode = nodeById.get(targetId);
			if (!sourceNode || !targetNode) {
				console.warn(`[GraphVisualization] Filtering out edge with non-existent node(s): source="${sourceId}", target="${targetId}"`);
				continue;
			}
			(link as { source: GraphVizNode; target: GraphVizNode }).source = sourceNode;
			(link as { source: GraphVizNode; target: GraphVizNode }).target = targetNode;
			resolvedLinks.push(link);
		}
		linksRef.current = resolvedLinks;

		simulation.nodes(nodes);
		(simulation.force('link') as d3.ForceLink<GraphVizNode, GraphVizLink>).links(resolvedLinks);
		simulation.alpha(Math.max(simulation.alpha(), 0.18)).alphaTarget(0.06).restart();
		if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
		settleTimerRef.current = window.setTimeout(() => simulation.alphaTarget(0), 900);

		const linkSel = linksLayer
			.selectAll<SVGLineElement, GraphVizLink>('line')
			.data(resolvedLinks, (d) => linkKey(d, normalizeNodeId));

		const linkEnter = linkSel
			.enter()
			.append('line')
			.attr('stroke', (d) => getEdgeStyle({ kind: d.kind, weight: d.weight }).stroke ?? '#d1d5db')
			.attr('stroke-opacity', (d) => getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeOpacity ?? 0.4)
			.attr('stroke-dasharray', (d) => getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeDasharray ?? null)
			.attr('stroke-width', (d) => getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeWidth ?? 1)
			.attr('opacity', 0)
			.attr('stroke-dashoffset', (d) => getEdgeStyle({ kind: d.kind, weight: d.weight }).strokeDashoffset ?? null);

		linkEnter
			.transition()
			.duration(220)
			.attr('opacity', 1)
			.attr('stroke-dashoffset', (d) => {
				const s = getEdgeStyle({ kind: d.kind, weight: d.weight });
				return s.strokeDashoffset != null ? 0 : null;
			});
		linkSel.exit().transition().duration(150).attr('opacity', 0).remove();
		linkSelRef.current = linkEnter.merge(linkSel);

		const nodeSel = nodesLayer
			.selectAll<SVGCircleElement, GraphVizNode>('circle')
			.data(nodes, (d) => `node-${normalizeNodeId(d.id)}-${d.type || 'unknown'}`);

		const nodeInfo = (d: GraphVizNode): GraphVizNodeInfo => ({
			id: d.id,
			label: d.label,
			type: d.type,
			path: extractPathFromNode(d),
		});

		const nodeEnter = nodeSel
			.enter()
			.append('circle')
			.attr('stroke', '#fff')
			.attr('stroke-width', 2)
			.attr('r', 0)
			.attr('fill', (d) => getNodeStyle(d).fill ?? '#7c3aed')
			.attr('opacity', 0)
			.style('cursor', 'grab')
			.on('mouseenter', (evt: MouseEvent, d: GraphVizNode) => {
				onNodeHover?.({ x: evt.clientX, y: evt.clientY, node: nodeInfo(d) });
			})
			.on('mousemove', (evt: MouseEvent, d: GraphVizNode) => {
				onNodeHover?.({ x: evt.clientX, y: evt.clientY, node: nodeInfo(d) });
			})
			.on('mouseleave', () => onNodeHover?.(null))
			.on('contextmenu', (evt: MouseEvent, d: GraphVizNode) => {
				onNodeContextMenu?.(
					{ x: evt.clientX, y: evt.clientY },
					nodeInfo(d)
				);
				evt.preventDefault?.();
			})
			.on('click', async (_evt, d: GraphVizNode) => {
				if (onNodeClick) await onNodeClick(nodeInfo(d));
			})
			.call(drag(simulation) as (sel: d3Selection.Selection<SVGCircleElement, GraphVizNode, SVGGElement, unknown>) => void);

		nodeEnter.append('title').text((d) => `${getNodeLabel(d, 'full')}\n${d.id}`);

		const nodeMerged = nodeEnter.merge(nodeSel);
		nodeMerged.select('title').text((d) => `${getNodeLabel(d, 'full')}\n${d.id}`);

		nodeEnter.transition().duration(260).attr('opacity', 1).attr('r', (d) => d.r);
		nodeSel.exit().transition().duration(150).attr('opacity', 0).attr('r', 0).remove();
		nodeSelRef.current = nodeMerged;

		const labelSel = labelsLayer
			.selectAll<SVGTextElement, GraphVizNode>('text')
			.data(nodes, (d) => `label-${normalizeNodeId(d.id)}-${d.type || 'unknown'}`);

		const labelEnter = labelSel
			.enter()
			.append('text')
			.text((d) => getNodeLabel(d, 'short'))
			.attr('font-size', '9px')
			.attr('fill', '#4b5563')
			.attr('text-anchor', 'middle')
			.attr('dy', '20px')
			.style('pointer-events', 'none')
			.style('user-select', 'none')
			.style('font-weight', '500')
			.attr('opacity', 0);

		labelEnter.append('title').text((d) => `${getNodeLabel(d, 'full')}\n${d.id}`);
		const labelMerged = labelEnter.merge(labelSel);
		labelMerged.text((d) => getNodeLabel(d, 'short'));
		labelMerged.select('title').text((d) => `${getNodeLabel(d, 'full')}\n${d.id}`);

		labelEnter.transition().duration(260).attr('opacity', 1);
		labelSel.exit().transition().duration(150).attr('opacity', 0).remove();
		labelSelRef.current = labelMerged;
	}

	function upsertNodes(nodes: Array<{ id: string; label: string; type?: string; badges?: string[] }>) {
		const map = new Map(nodesRef.current.map((n) => [n.id, n]));
		for (const n of nodes) {
			const id = String(n.id);
			const existing = map.get(id);
			const nodeType = String(n.type ?? defaultNodeType);
			const style = getNodeStyle({
				id,
				label: String(n.label ?? id),
				type: nodeType,
				badges: n.badges,
				r: 0,
			} as GraphVizNode);
			const r = style.r ?? 10;
			if (existing) {
				existing.label = String(n.label ?? existing.label);
				existing.type = nodeType;
				existing.badges = n.badges ?? existing.badges;
			} else {
				map.set(id, {
					id,
					label: String(n.label ?? id),
					type: nodeType,
					badges: n.badges,
					r,
				} as GraphVizNode);
			}
		}
		nodesRef.current = Array.from(map.values());
	}

	function upsertEdges(edges: Array<{ from_node_id: string; to_node_id: string; weight?: number; kind?: string }>) {
		const nodeIds = new Set(nodesRef.current.map((n) => n.id));
		const map = new Map(linksRef.current.map((l) => [linkKey(l, normalizeNodeId), l]));
		for (const e of edges) {
			const source = String(e.from_node_id);
			const target = String(e.to_node_id);
			if (!nodeIds.has(source) || !nodeIds.has(target)) {
				console.warn(`[GraphVisualization] Skipping edge with non-existent node(s): source="${source}", target="${target}"`);
				continue;
			}
			const kind = String(e.kind ?? defaultEdgeKind);
			const weight = typeof e.weight === 'number' ? e.weight : 1;
			const k = `${source}::${target}::${kind}`;
			if (!map.has(k)) {
				map.set(k, { source, target, kind, weight });
			} else {
				map.get(k)!.weight = weight;
			}
		}
		linksRef.current = Array.from(map.values());
	}

	async function applyPatch(patch: GraphPatch) {
		upsertNodes(patch.upsertNodes ?? []);
		upsertEdges((patch.upsertEdges ?? []).map((e) => ({
			from_node_id: e.from_node_id,
			to_node_id: e.to_node_id,
			weight: e.weight,
			kind: String(e.kind ?? defaultEdgeKind),
		})));

		if (patch.removeNodeIds?.length) {
			const removeSet = new Set(patch.removeNodeIds.map(String));
			nodesRef.current = nodesRef.current.filter((n) => !removeSet.has(n.id));
			linksRef.current = linksRef.current.filter(
				(l) => !removeSet.has(getLinkEndpointId(l.source)) && !removeSet.has(getLinkEndpointId(l.target))
			);
		}

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

		const nodeIds = new Set(nodesRef.current.map((n) => n.id));
		linksRef.current = linksRef.current.filter((link) => {
			const valid = nodeIds.has(getLinkEndpointId(link.source)) && nodeIds.has(getLinkEndpointId(link.target));
			if (!valid) console.warn(`[GraphVisualization] Removing invalid edge: source="${getLinkEndpointId(link.source)}", target="${getLinkEndpointId(link.target)}"`);
			return valid;
		});

		setVersion((v) => v + 1);
		renderJoin();
		await new Promise<void>((resolve) => setTimeout(resolve, 320));
	}

	const fitToView = (force = false) => {
		if (!svgRef.current || !zoomRef.current || nodesRef.current.length === 0) return;
		if (!force && userInteractedRef.current) return;

		const nodes = nodesRef.current;
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		nodes.forEach((n) => {
			if (n.x != null && n.y != null) {
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
		const scale = Math.max(0.25, Math.min(scaleX, scaleY, 1));

		const translateX = width / 2 - boundsCenterX * scale;
		const translateY = height / 2 - boundsCenterY * scale;

		const finalTransform = d3Zoom.zoomIdentity.translate(translateX, translateY).scale(scale);
		d3Selection.select(svgRef.current).call(zoomRef.current!.transform, finalTransform);
		setZoomLevel(scale);
	};

	const handleZoom = (delta: number) => {
		if (!svgRef.current || !zoomRef.current) return;
		const svg = d3Selection.select(svgRef.current);
		const currentTransform = d3Zoom.zoomTransform(svg.node() as SVGSVGElement);
		const newScale = Math.max(0.01, Math.min(10, currentTransform.k * delta));
		const newTransform = d3Zoom.zoomIdentity.translate(currentTransform.x, currentTransform.y).scale(newScale);
		svg.call(zoomRef.current.transform, newTransform);
		setZoomLevel(newScale);
	};

	const clear = () => {
		userInteractedRef.current = false;
		nodesRef.current = [];
		linksRef.current = [];
		setVersion((v) => v + 1);
		renderJoin();
	};

	useImperativeHandle(ref, () => ({ applyPatch, clear, fitToView }), []);

	useEffect(() => {
		if (!showControls) {
			setSettingsPanelPosition(null);
			return;
		}
		const btn = settingsButtonRef.current;
		const update = () => {
			if (!btn) return;
			const rect = btn.getBoundingClientRect();
			setSettingsPanelPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
		};
		update();
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	}, [showControls]);

	useEffect(() => {
		if (!graph) return;
		applyPatch(previewToPatchFn(graph));
	}, [graph]);

	async function handleCopy(format: GraphCopyFormat) {
		const snapshot = {
			nodes: nodesRef.current.map((n) => ({ id: n.id, label: n.label, type: n.type, badges: n.badges })),
			edges: linksRef.current.map((e) => ({
				source: getLinkEndpointId(e.source),
				target: getLinkEndpointId(e.target),
				kind: e.kind,
				weight: e.weight,
			})),
		};
		if (format === 'json') return copyToClipboard(snapshotToJson(snapshot));
		if (format === 'mermaid') return copyToClipboard(snapshotToMermaid(snapshot));
		return copyToClipboard(snapshotToMarkdown(snapshot, snapshotMarkdownOptions));
	}

	const hasData = nodesRef.current.length > 0;
	const baseContainerClass = containerClassName
		? 'pktw-w-full pktw-bg-[#fafafa] pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-relative pktw-overflow-hidden'
		: 'pktw-w-full pktw-aspect-square pktw-bg-[#fafafa] pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-relative pktw-overflow-hidden';

	return (
		<div ref={containerRef} className={`${baseContainerClass}${containerClassName ? ` ${containerClassName}` : ''}`}>
			{showToolbar && (
				<GraphToolbar
					onZoomIn={() => handleZoom(1.2)}
					onZoomOut={() => handleZoom(1 / 1.2)}
					onFitToView={() => fitToView(true)}
					onToggleSettings={() => setShowControls((s) => !s)}
					onCopy={handleCopy}
					copyFormat={copyFormat}
					setCopyFormat={setCopyFormat}
					copyMenuOpen={copyMenuOpen}
					setCopyMenuOpen={setCopyMenuOpen}
					copiedTick={copiedTick}
					showCopy={showCopy}
					showZoom={showZoom}
					showSettings={showSettings}
					settingsButtonRef={settingsButtonRef}
				/>
			)}

			<GraphSettingsPanel
				config={config}
				onConfigChange={setConfig}
				onReset={() => setTimeout(() => fitToView(true), 100)}
				position={settingsPanelPosition}
				show={showControls}
			/>

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

			<canvas
				ref={canvasRef}
				className="pktw-absolute pktw-inset-0 pktw-z-[5] pktw-pointer-events-none"
			/>

			<GraphEffectsCanvas
				effect={effect}
				nodesRef={nodesRef}
				linksRef={linksRef}
				zoomTransformRef={zoomTransformRef}
				canvasRef={canvasRef}
				containerRef={containerRef}
				resizeTick={resizeTick}
				effectKindMap={effectKindMap}
			/>

			{!hasData && <GraphEmptyState message={emptyMessage} />}

			<span className="pktw-hidden">{version}</span>
		</div>
	);
});

function drag(simulation: d3.Simulation<GraphVizNode, GraphVizLink>) {
	function dragstarted(event: D3DragEvent<SVGCircleElement, GraphVizNode, GraphVizNode>, d: GraphVizNode) {
		if (!event.active) simulation.alphaTarget(0.3).restart();
		d.fx = d.x ?? 0;
		d.fy = d.y ?? 0;
	}

	function dragged(event: D3DragEvent<SVGCircleElement, GraphVizNode, GraphVizNode>, d: GraphVizNode) {
		d.fx = event.x;
		d.fy = event.y;
	}

	function dragended(event: D3DragEvent<SVGCircleElement, GraphVizNode, GraphVizNode>, d: GraphVizNode) {
		if (!event.active) simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
	}

	return d3Drag
		.drag<SVGCircleElement, GraphVizNode>()
		.on('start', dragstarted)
		.on('drag', dragged)
		.on('end', dragended);
}
