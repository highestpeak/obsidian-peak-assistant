import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ReactFlow,
	Background,
	Controls,
	applyNodeChanges,
	type Edge,
	type Node,
	type NodeChange,
	type NodeMouseHandler,
	type ReactFlowInstance,
} from '@xyflow/react';
import { HubAnchorNode, type HubAnchorNodeType } from './HubAnchorNode';
import { ResultDocNode, type ResultDocNodeType } from './ResultDocNode';
import { CommunityBackground, type CommunityRegion } from './CommunityBackground';
import { FolderBoundary, type FolderBoundaryRegion } from './FolderBoundary';
import { IsolatedMatchesRail, type IsolatedMatchItem } from './IsolatedMatchesRail';
import { SparseFallbackBanner } from './SparseFallbackBanner';
import { useVaultSearchStore } from '../../store';
import { composeResultSubgraphDeps } from '@/app/search/composeResultSubgraphDeps';
import { buildResultSubgraph, type ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import type { SearchResultItem } from '@/core/search/searchTypes';

const NODE_CAP = 100;
const NARROW_MODAL_PX = 640;
const HUB_RADIUS = 220;
const DOC_RADIUS = 340;

/** Numeric score to pick the "match score" for graph coloring / sort. */
function scoreOf(r: SearchResultItem): number {
	const s = r.finalScore ?? r.score ?? 0;
	return Number.isFinite(s) ? s : 0;
}

/** Stable palette index per community/folder id, without a global registry. */
function hashIndex(key: string): number {
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
	return Math.abs(h);
}

interface LayoutResult {
	nodes: Node[];
	edges: Edge[];
	communityRegions: CommunityRegion[];
	folderRegions: FolderBoundaryRegion[];
	isolatedItems: IsolatedMatchItem[];
	connectedPairs: number;
	sharedHubs: number;
	dominantCommunityId: string | null;
}

interface DominationDecision {
	skipCommunityId: string | null;
}

function decideCommunityDomination(sub: ResultSubgraphOutput): DominationDecision {
	if (!sub.resultNodes.length) return { skipCommunityId: null };
	const counts = new Map<string, number>();
	for (const n of sub.resultNodes) {
		if (!n.communityId) continue;
		counts.set(n.communityId, (counts.get(n.communityId) ?? 0) + 1);
	}
	let skip: string | null = null;
	for (const [id, c] of counts) {
		if (c / sub.resultNodes.length > 0.6) { skip = id; break; }
	}
	return { skipCommunityId: skip };
}

function computeLayout(
	sub: ResultSubgraphOutput,
	selectedNodeId: string | null,
	semanticOn: boolean,
	folderOn: boolean,
): LayoutResult {
	const nodes: Node[] = [];
	const nodeIndexById = new Map<string, { x: number; y: number }>();

	// Hub anchors: evenly spread around a small inner ring.
	const hubCount = sub.hubAnchors.length;
	sub.hubAnchors.forEach((h, i) => {
		const angle = hubCount === 0 ? 0 : (2 * Math.PI * i) / hubCount;
		const x = Math.cos(angle) * HUB_RADIUS;
		const y = Math.sin(angle) * HUB_RADIUS;
		const node: HubAnchorNodeType = {
			id: h.id,
			type: 'hubAnchor',
			position: { x, y },
			data: {
				title: h.title || h.path,
				constituentCount: h.constituentCount,
				selected: h.id === selectedNodeId,
			},
		};
		nodes.push(node as unknown as Node);
		nodeIndexById.set(h.id, { x, y });
	});

	// Result docs — connected ones on the outer ring, isolated ones extracted for the rail.
	const isolatedSet = new Set(sub.isolatedDocIds);
	const connected = sub.resultNodes.filter((n) => !isolatedSet.has(n.id));
	const maxScore = connected.reduce((m, n) => Math.max(m, n.score), 0) || 1;
	const docCount = connected.length;
	connected.forEach((n, i) => {
		const angle = docCount === 0 ? 0 : (2 * Math.PI * i) / docCount;
		const x = Math.cos(angle) * DOC_RADIUS;
		const y = Math.sin(angle) * DOC_RADIUS;
		const node: ResultDocNodeType = {
			id: n.id,
			type: 'resultDoc',
			position: { x, y },
			data: {
				title: n.title || n.path,
				scoreIntensity: n.score / maxScore,
				selected: n.id === selectedNodeId,
			},
		};
		nodes.push(node as unknown as Node);
		nodeIndexById.set(n.id, { x, y });
	});

	// Edges. `semantic` respects the overlay toggle.
	const edges: Edge[] = [];
	for (const e of sub.edges) {
		if (e.kind === 'semantic' && !semanticOn) continue;
		if (!nodeIndexById.has(e.from) || !nodeIndexById.has(e.to)) continue;
		const style = ((): { stroke: string; strokeDasharray?: string; strokeWidth: number } => {
			if (e.kind === 'reference') return { stroke: 'var(--pk-border-strong)', strokeWidth: 1.4 };
			if (e.kind === 'semantic') return { stroke: 'var(--pk-border-strong)', strokeDasharray: '5 4', strokeWidth: 1.2 };
			return { stroke: 'var(--pk-accent-soft)', strokeDasharray: '2 3', strokeWidth: 1 };
		})();
		edges.push({
			id: `${e.kind}-${e.from}-${e.to}`,
			source: e.from,
			target: e.to,
			style,
			data: { kind: e.kind },
			label: undefined,
			// title tooltip via native browser edge title is not exposed; rely on
			// data.kind for future hover surfaces (spec §Interaction · edge hover
			// tooltip is a follow-up but the data is already routed).
		});
	}

	// Community wash regions (bounding box per community, skipping the dominant one).
	const domination = decideCommunityDomination(sub);
	const commBuckets = new Map<string, { xs: number[]; ys: number[] }>();
	for (const n of sub.resultNodes) {
		if (!n.communityId) continue;
		if (n.communityId === domination.skipCommunityId) continue;
		const pos = nodeIndexById.get(n.id);
		if (!pos) continue;
		const bucket = commBuckets.get(n.communityId) ?? { xs: [], ys: [] };
		bucket.xs.push(pos.x);
		bucket.ys.push(pos.y);
		commBuckets.set(n.communityId, bucket);
	}
	const communityRegions: CommunityRegion[] = [];
	for (const [communityId, { xs, ys }] of commBuckets) {
		if (xs.length < 2) continue;
		const minX = Math.min(...xs) - 60;
		const maxX = Math.max(...xs) + 60;
		const minY = Math.min(...ys) - 40;
		const maxY = Math.max(...ys) + 40;
		communityRegions.push({
			communityId,
			colorIndex: hashIndex(communityId),
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY,
		});
	}

	// Folder groupings (only when overlay on).
	const folderRegions: FolderBoundaryRegion[] = [];
	if (folderOn) {
		const folderBuckets = new Map<string, { xs: number[]; ys: number[] }>();
		for (const n of sub.resultNodes) {
			if (!n.folder) continue;
			const pos = nodeIndexById.get(n.id);
			if (!pos) continue;
			const bucket = folderBuckets.get(n.folder) ?? { xs: [], ys: [] };
			bucket.xs.push(pos.x);
			bucket.ys.push(pos.y);
			folderBuckets.set(n.folder, bucket);
		}
		for (const [folder, { xs, ys }] of folderBuckets) {
			if (xs.length < 2) continue;
			const minX = Math.min(...xs) - 40;
			const maxX = Math.max(...xs) + 40;
			const minY = Math.min(...ys) - 20;
			const maxY = Math.max(...ys) + 20;
			folderRegions.push({
				folder,
				colorIndex: hashIndex(folder),
				x: minX,
				y: minY,
				width: maxX - minX,
				height: maxY - minY,
			});
		}
	}

	// Isolated rail items.
	const isolatedItems: IsolatedMatchItem[] = sub.isolatedDocIds
		.map((id) => sub.resultNodes.find((n) => n.id === id))
		.filter((n): n is ResultSubgraphOutput['resultNodes'][number] => !!n)
		.map((n) => ({ id: n.id, title: n.title || n.path, path: n.path }));

	// Sparse-fallback signal counts.
	let connectedPairs = 0;
	const seenPairs = new Set<string>();
	for (const e of sub.edges) {
		if (e.kind === 'semantic') continue;
		const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
		if (seenPairs.has(key)) continue;
		seenPairs.add(key);
		connectedPairs++;
	}

	return {
		nodes,
		edges,
		communityRegions,
		folderRegions,
		isolatedItems,
		connectedPairs,
		sharedHubs: sub.hubAnchors.length,
		dominantCommunityId: domination.skipCommunityId,
	};
}

const nodeTypes = {
	hubAnchor: HubAnchorNode,
	resultDoc: ResultDocNode,
};

interface ResultGraphViewProps {
	/** Optional close handler for the search modal (used when double-click opens a file). */
	onClose?: () => void;
	/** Optional Cmd+click surface for a hub anchor — T7 will wire the real implementation. */
	onOpenHubGraphSubview?: (hubNodeId: string) => void;
}

export const ResultGraphView: React.FC<ResultGraphViewProps> = ({ onClose, onOpenHubGraphSubview }) => {
	const results = useVaultSearchStore((s) => s.lastSearchResults);
	const semanticOn = useVaultSearchStore((s) => s.graphOverlaySemantic);
	const folderOn = useVaultSearchStore((s) => s.graphOverlayFolder);
	const { vaultNavigation } = useServiceContext();

	const [subgraph, setSubgraph] = useState<ResultSubgraphOutput | null>(null);
	const [loading, setLoading] = useState(false);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [nodes, setNodes] = useState<Node[]>([]);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const rfInstance = useRef<ReactFlowInstance | null>(null);
	const [containerWidth, setContainerWidth] = useState<number>(0);

	// Watch container width (drives narrow-modal isolated-rail collapse).
	useEffect(() => {
		if (!containerRef.current) return;
		const el = containerRef.current;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) setContainerWidth(entry.contentRect.width);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Rebuild subgraph whenever the result set changes.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!results.length) {
				setSubgraph({ resultNodes: [], hubAnchors: [], edges: [], isolatedDocIds: [], overflowCount: 0 });
				return;
			}
			setLoading(true);
			try {
				const docIds: string[] = [];
				const scores = new Map<string, number>();
				for (const r of results) {
					const id = r.docId ?? r.id;
					if (!id) continue;
					docIds.push(id);
					scores.set(id, scoreOf(r));
				}
				const deps = composeResultSubgraphDeps();
				const sub = await buildResultSubgraph(deps, {
					resultDocIds: docIds,
					matchScores: scores,
					nodeCap: NODE_CAP,
				});
				if (!cancelled) setSubgraph(sub);
			} catch {
				if (!cancelled) setSubgraph({ resultNodes: [], hubAnchors: [], edges: [], isolatedDocIds: [], overflowCount: 0 });
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => { cancelled = true; };
	}, [results]);

	const layout = useMemo(() => {
		if (!subgraph) return null;
		return computeLayout(subgraph, selectedNodeId, semanticOn, folderOn);
	}, [subgraph, selectedNodeId, semanticOn, folderOn]);

	// Fade transitions for enter/exit as nodes come and go while user types.
	useEffect(() => {
		if (!layout) { setNodes([]); return; }
		const nextIds = new Set(layout.nodes.map((n) => n.id));
		const prev = nodes;
		const removedIds = prev.filter((n) => !nextIds.has(n.id)).map((n) => n.id);
		if (!removedIds.length) {
			setNodes(layout.nodes);
			return;
		}
		// Fade removed nodes for one tick, then apply the new set.
		const fadingChanges: NodeChange[] = removedIds.map((id) => ({
			id, type: 'select', selected: false,
		})) as unknown as NodeChange[];
		setNodes((cur) => applyNodeChanges(fadingChanges, cur));
		const t = setTimeout(() => setNodes(layout.nodes), 150);
		return () => clearTimeout(t);
	}, [layout]);

	// Fit view when the graph changes shape.
	useEffect(() => {
		const t = setTimeout(() => rfInstance.current?.fitView({ padding: 0.25 }), 60);
		return () => clearTimeout(t);
	}, [nodes.length]);

	const onNodesChange = useCallback((changes: NodeChange[]) => {
		setNodes((cur) => applyNodeChanges(changes, cur));
	}, []);

	const openDocById = useCallback(async (id: string) => {
		const found = results.find((r) => (r.docId ?? r.id) === id);
		if (!found) return;
		await createOpenSourceCallback(onClose, true, vaultNavigation)(found);
	}, [results, onClose, vaultNavigation]);

	const openHubByAnchorPath = useCallback(async (hubNodeId: string) => {
		const hub = subgraph?.hubAnchors.find((h) => h.id === hubNodeId);
		if (!hub?.path) return;
		await vaultNavigation.openLink(hub.path, { newLeaf: 'tab' });
	}, [subgraph, vaultNavigation]);

	const handleNodeClick: NodeMouseHandler = useCallback((event, node) => {
		setSelectedNodeId(node.id);
		const modKey = event.metaKey || event.ctrlKey;
		// Cmd/Ctrl+click on a hub anchor: open hub graph subview (T7 wires).
		if (modKey) {
			if (node.type === 'hubAnchor') {
				onOpenHubGraphSubview?.(node.id);
				return;
			}
		}
		// Single click on a hub anchor without modifiers: open the hub doc file.
		if (node.type === 'hubAnchor') {
			void openHubByAnchorPath(node.id);
		}
	}, [onOpenHubGraphSubview, openHubByAnchorPath]);

	const handleNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
		if (node.type === 'resultDoc') void openDocById(node.id);
	}, [openDocById]);

	if (loading && !subgraph) {
		return (
			<span className="pktw-flex pktw-flex-1 pktw-items-center pktw-justify-center pktw-p-6 pktw-text-sm pktw-text-pk-text-tertiary">
				Building graph…
			</span>
		);
	}

	if (!subgraph || (!subgraph.resultNodes.length && !subgraph.hubAnchors.length)) {
		return (
			<span className="pktw-flex pktw-flex-1 pktw-items-center pktw-justify-center pktw-p-6 pktw-text-sm pktw-text-pk-text-tertiary">
				No results to graph.
			</span>
		);
	}

	if (!layout) return null;

	const sparse = layout.connectedPairs < 3 && layout.sharedHubs < 2;
	const narrow = containerWidth > 0 && containerWidth < NARROW_MODAL_PX;

	return (
		<div
			ref={containerRef}
			className="pktw-relative pktw-flex pktw-flex-1 pktw-min-h-0 pktw-w-full pktw-overflow-hidden"
			style={{ minHeight: 320 }}
		>
			<CommunityBackground regions={layout.communityRegions} />
			<FolderBoundary regions={layout.folderRegions} />
			{sparse && <SparseFallbackBanner />}
			<ReactFlow
				nodes={nodes}
				edges={layout.edges}
				nodeTypes={nodeTypes}
				onNodesChange={onNodesChange}
				onNodeClick={handleNodeClick}
				onNodeDoubleClick={handleNodeDoubleClick}
				onInit={(instance) => { rfInstance.current = instance; }}
				fitView
				fitViewOptions={{ padding: 0.25 }}
				proOptions={{ hideAttribution: true }}
				minZoom={0.3}
				maxZoom={2.5}
			>
				<Background color="var(--pk-surface-sunken)" gap={20} />
				<Controls showInteractive={false} />
			</ReactFlow>
			<IsolatedMatchesRail
				items={layout.isolatedItems}
				selectedId={selectedNodeId}
				onSelect={setSelectedNodeId}
				onOpen={(id) => void openDocById(id)}
				narrow={narrow}
			/>
			{subgraph.overflowCount > 0 && (
				<span className="pktw-absolute pktw-bottom-2 pktw-left-1/2 pktw--translate-x-1/2 pktw-rounded-md pktw-bg-pk-surface-raised pktw-px-3 pktw-py-1 pktw-text-[11px] pktw-text-pk-text-tertiary pktw-border pktw-border-pk-border">
					{`Showing top ${NODE_CAP} of ${NODE_CAP + subgraph.overflowCount} results`}
				</span>
			)}
		</div>
	);
};
