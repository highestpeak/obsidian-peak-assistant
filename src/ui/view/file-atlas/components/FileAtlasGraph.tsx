/**
 * File Atlas — read-only document neighborhood graph (subview).
 *
 * Shows the current note plus its 1-hop / 2-hop neighbors from vault links, with
 * an optional layer of index-discovered semantic edges. Read-only by design
 * (spec Decision 2026-07-09): curation belongs in vault-native collection notes
 * + Canvas, not a private graph store.
 *
 * Renders through the shared {@link AtlasGraphCanvas} — the same cytoscape stack
 * the Vault Search Result Graph uses — so both surfaces stay visually identical.
 * Data comes from `host.loadNeighborhood`; this component only maps it into the
 * subgraph contract and owns the scope / semantic / layout controls.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Network } from 'lucide-react';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import { AtlasGraphCanvas, type AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type { AtlasGraphData, FileAtlasHostPort } from '../FileAtlasHostPort';
import {
	PEAK_CONTROL_KEY_TIP_KEYS,
	PEAK_KEYBOARD_ZONE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';
import { ContextualAIGraphView } from '@/ui/component/ai-graph';
import type {
	FileAtlasGraphScope,
	FileAtlasGraphSessionState,
} from '../FileAtlasSessionPort';
import { useServiceContext } from '@/ui/context/ServiceContext';

interface FileAtlasGraphProps {
	path: string;
	host: FileAtlasHostPort;
	onAddToTray: (block: DocumentBlock) => void;
	initialState: FileAtlasGraphSessionState;
	onStateChange: (state: FileAtlasGraphSessionState) => void;
}

type Scope = FileAtlasGraphScope;

function scoreForHop(hop: 0 | 1 | 2): number {
	return hop === 0 ? 1 : hop === 1 ? 0.6 : 0.3;
}

function toSubgraph(data: AtlasGraphData): ResultSubgraphOutput {
	return {
		resultNodes: data.nodes.map((n) => ({
			id: n.id,
			path: n.path ?? n.id,
			title: n.label,
			score: scoreForHop(n.hop),
			communityId: n.communityId ?? null,
			folder: n.path ? n.path.split('/')[0] ?? '' : '',
			...(n.summary ? { preview: n.summary } : {}),
			...(n.signals?.length ? { signals: n.signals } : {}),
			...(typeof n.incomingLinks === 'number' ? { incomingLinks: n.incomingLinks } : {}),
			...(typeof n.outgoingLinks === 'number' ? { outgoingLinks: n.outgoingLinks } : {}),
		})),
		hubAnchors: data.hubAnchors.map((hub) => ({
			id: hub.id,
			path: hub.path,
			title: hub.label,
			constituentCount: hub.constituentCount,
		})),
		edges: data.edges.map((e) => ({
			from: e.from,
			to: e.to,
			kind: e.kind,
			directionality: e.directionality,
		})),
		isolatedDocIds: [],
		overflowCount: 0,
		communities: data.communities ?? [],
	};
}

function trayBlockForNode(id: string, label: string, nodePath: string): DocumentBlock {
	return {
		id: `graph:${id}`,
		kind: RawBlockKind.VaultLink,
		title: label,
		source: nodePath,
		anchor: {
			filePath: nodePath,
			blockId: `graph:${id}`,
			nearestHeading: null,
			blockType: RawBlockKind.VaultLink,
			ordinalInHeading: 0,
			contentHash: '',
			lineStart: 1,
			lineEnd: 1,
			status: 'active',
		},
	};
}

export const FileAtlasGraph: React.FC<FileAtlasGraphProps> = ({
	path,
	host,
	onAddToTray,
	initialState,
	onStateChange,
}) => {
	const { communityExplanation, graphNodeExplanation, indexService } = useServiceContext();
	const [scope, setScope] = useState<Scope>(initialState.scope);
	const [semantic, setSemantic] = useState(initialState.semantic);
	const [layout, setLayout] = useState<AtlasGraphPreset>(initialState.layout);
	const [aiLens, setAILens] = useState(initialState.aiLens ?? 'topology');
	const [viewport, setViewport] = useState(initialState.viewport);
	const [data, setData] = useState<AtlasGraphData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	useEffect(() => {
		onStateChange({ scope, semantic, layout, aiLens, viewport });
	}, [aiLens, layout, onStateChange, scope, semantic, viewport]);
	useEffect(() => setScope(initialState.scope), [initialState.scope]);
	useEffect(() => setLayout(initialState.layout), [initialState.layout]);
	useEffect(() => setAILens(initialState.aiLens ?? 'topology'), [initialState.aiLens]);
	// Fetch both reference + semantic edges up front; the semantic toggle is a
	// render-only concern the canvas handles, so scope is the only refetch key.
	useEffect(() => {
		if (scope === 'ai') return;
		if (!host.loadNeighborhood) {
			setData(null);
			return;
		}
		const controller = new AbortController();
		let alive = true;
		setLoading(true);
		setError(false);
		setData(null);
		host
			.loadNeighborhood(path, { hops: scope === 'two-hop' ? 2 : 1, semantic: true }, controller.signal)
			.then((res) => { if (alive) { setData(res); setLoading(false); } })
			.catch(() => { if (alive) { setError(true); setLoading(false); } });
		return () => {
			alive = false;
			controller.abort();
		};
	}, [path, scope, host]);

	const subgraph = useMemo(() => (data ? toSubgraph(data) : null), [data]);
	const labelById = useMemo(() => {
		const m = new Map<string, string>();
		data?.nodes.forEach((n) => m.set(n.id, n.label));
		data?.hubAnchors.forEach((hub) => m.set(hub.id, hub.label));
		return m;
	}, [data]);

	const unavailable = scope !== 'ai' && (!host.loadNeighborhood || error);

	return (
		<div
			className="pkfa-graph"
			data-peak-keyboard-zone="fa-atlas"
			data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['fa-atlas-graph']}
			data-peak-keyboard-order="3"
		>
			<div className="pkfa-graph-canvas">
				{scope === 'ai' ? (
					<ContextualAIGraphView
						contextRefs={[path]}
						selectedVaultPaths={[path]}
						createOrigin={{
							surface: 'file-atlas',
							contextRef: {
								kind: 'atlas-file',
								ref: path,
								label: path.split('/').pop()?.replace(/\.md$/i, '') ?? path,
								locator: path,
							},
						}}
						lens={aiLens}
						onLensChange={setAILens}
						showWorkspaceControl={false}
					/>
				) : unavailable ? (
					<div className="pkfa-graph-empty">
						<Network />
						<span>Neighborhood graph unavailable — index this note to see its links.</span>
					</div>
				) : (
					<AtlasGraphCanvas
						subgraph={loading ? null : subgraph}
						preset={layout}
						showSemantic={semantic}
						onShowSemanticChange={setSemantic}
						semanticKeyTipKey={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.semantic}
						keyTipKeys={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphCanvas}
						communityExplanation={communityExplanation}
						graphNodeExplanation={graphNodeExplanation}
						nodeExplanationUi={indexService?.env.communityConfig?.nodeExplanation.ui}
						communityInteraction={indexService?.env.communityConfig?.interaction}
						graphLayout={indexService?.env.communityConfig?.graphLayout}
						initialViewport={viewport}
						onViewportChange={setViewport}
						buildingLabel="Loading neighborhood…"
						emptyLabel="No linked notes around this document yet."
						onNodeTap={({ id, path: nodePath, isHub, modKey }) => {
							if (modKey) return;
							if (isHub || !nodePath || nodePath === path) return;
							onAddToTray(trayBlockForNode(id, labelById.get(id) ?? nodePath, nodePath));
							host.notify('Note added to tray');
						}}
						onNodeDblTap={({ path: nodePath }) => {
							if (nodePath) void host.activateDoc(nodePath);
						}}
					/>
				)}
			</div>
		</div>
	);
};
