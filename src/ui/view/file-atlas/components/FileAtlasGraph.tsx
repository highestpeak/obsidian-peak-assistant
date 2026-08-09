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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Network } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import { AtlasGraphCanvas, type AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type { AtlasGraphData, FileAtlasHostPort } from '../FileAtlasHostPort';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import {
	PEAK_CONTROL_KEY_TIP_KEYS,
	PEAK_KEYBOARD_ZONE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';
import { ContextualAIGraphView } from '@/ui/component/ai-graph';
import type {
	FileAtlasGraphScope,
	FileAtlasGraphSessionState,
} from '../FileAtlasSessionPort';

interface FileAtlasGraphProps {
	path: string;
	host: FileAtlasHostPort;
	config: FileAtlasConfig;
	onAddToTray: (block: DocumentBlock) => void;
	initialState: FileAtlasGraphSessionState;
	onStateChange: (state: FileAtlasGraphSessionState) => void;
}

type Scope = FileAtlasGraphScope;

// Full preset parity with the Vault Search Result Graph — both feed the same
// shared canvas, and the neighborhood subgraph carries real note paths (so folder
// grouping is meaningful here too). Labels/order match ResultPaneHeader exactly.
const LAYOUTS: Array<{ id: AtlasGraphPreset; label: string }> = [
	{ id: 'constellation', label: 'Constellation' },
	{ id: 'flow-tb', label: 'Flow ↓' },
	{ id: 'flow-lr', label: 'Flow →' },
	{ id: 'folder', label: 'Folder tree' },
	{ id: 'orbit', label: 'Orbit' },
];

const GRAPH_LAYOUT_KEY_TIPS: Readonly<Record<AtlasGraphPreset, string>> = {
	constellation: PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphLayout.constellation,
	'flow-tb': PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphLayout.flowTb,
	'flow-lr': PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphLayout.flowLr,
	folder: PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphLayout.folder,
	orbit: PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphLayout.orbit,
};

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
			communityId: null,
			folder: n.path ? n.path.split('/')[0] ?? '' : '',
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
	config,
	onAddToTray,
	initialState,
	onStateChange,
}) => {
	const s = config.strings;
	const [scope, setScope] = useState<Scope>(initialState.scope);
	const [semantic, setSemantic] = useState(initialState.semantic);
	const [layout, setLayout] = useState<AtlasGraphPreset>(initialState.layout);
	const [viewport, setViewport] = useState(initialState.viewport);
	const [data, setData] = useState<AtlasGraphData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const scopeRef = useRef<HTMLDivElement>(null);
	const layoutRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		onStateChange({ scope, semantic, layout, viewport });
	}, [layout, onStateChange, scope, semantic, viewport]);
	const selectScope = (next: Scope): void => {
		setScope(next);
		setViewport(null);
	};
	const selectLayout = (next: AtlasGraphPreset): void => {
		setLayout(next);
		setViewport(null);
	};
	useRovingComposite(scopeRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => {
			const nextScope = item.dataset.graphScope as Scope | undefined;
			if (nextScope) selectScope(nextScope);
		},
	});
	useRovingComposite(layoutRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => {
			const nextLayout = item.dataset.graphLayout as AtlasGraphPreset | undefined;
			if (nextLayout) selectLayout(nextLayout);
		},
	});

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
	const meta = data
		? `${data.nodes.length} notes · ${data.hubAnchors.length} hubs · ${data.edges.filter((edge) => semantic || edge.kind !== 'semantic').length} links`
		: '';
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
			<div className="pkfa-graph-bar">
				<div ref={scopeRef} className="pkfa-graph-scope" role="tablist" aria-label="Graph scope">
					<Button
						variant="unstyled"
						type="button"
						role="tab"
						aria-selected={scope === 'one-hop'}
						tabIndex={scope === 'one-hop' ? 0 : -1}
						data-graph-scope="one-hop"
						data-peak-focus-id="file-atlas-graph-one-hop"
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphScope.oneHop}
						data-peak-keytip-label={s.graphScopeLocal}
						className={`pkfa-graph-scope-tab${scope === 'one-hop' ? ' is-active' : ''}`}
						onClick={() => selectScope('one-hop')}
					>
						{s.graphScopeLocal}
					</Button>
					<Button
						variant="unstyled"
						type="button"
						role="tab"
						aria-selected={scope === 'two-hop'}
						tabIndex={scope === 'two-hop' ? 0 : -1}
						data-graph-scope="two-hop"
						data-peak-focus-id="file-atlas-graph-two-hop"
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphScope.twoHop}
						data-peak-keytip-label={s.graphScopeTwoHop}
						className={`pkfa-graph-scope-tab${scope === 'two-hop' ? ' is-active' : ''}`}
						onClick={() => selectScope('two-hop')}
					>
						{s.graphScopeTwoHop}
					</Button>
					<Button
						variant="unstyled"
						type="button"
						role="tab"
						aria-selected={scope === 'ai'}
						tabIndex={scope === 'ai' ? 0 : -1}
						data-graph-scope="ai"
						data-peak-focus-id="file-atlas-graph-ai"
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphScope.ai}
						data-peak-keytip-label={s.graphScopeAI}
						className={`pkfa-graph-scope-tab${scope === 'ai' ? ' is-active' : ''}`}
						onClick={() => selectScope('ai')}
					>
						{s.graphScopeAI}
					</Button>
				</div>

				{scope !== 'ai' && <div ref={layoutRef} className="pkfa-graph-scope" role="tablist" aria-label="Graph layout">
					{LAYOUTS.map((l) => (
						<Button
							key={l.id}
							variant="unstyled"
							type="button"
							role="tab"
							aria-selected={layout === l.id}
							tabIndex={layout === l.id ? 0 : -1}
							data-graph-layout={l.id}
							data-peak-focus-id={`file-atlas-layout-${l.id}`}
							data-peak-keytip-key={GRAPH_LAYOUT_KEY_TIPS[l.id]}
							data-peak-keytip-label={`${l.label} graph layout`}
							className={`pkfa-graph-scope-tab${layout === l.id ? ' is-active' : ''}`}
							onClick={() => selectLayout(l.id)}
						>
							{l.label}
						</Button>
					))}
				</div>}

				{scope !== 'ai' && <Button
					variant="unstyled"
					type="button"
					aria-pressed={semantic}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.semantic}
					data-peak-keytip-label={s.graphSemanticLabel}
					className={`pkfa-semantic-toggle${semantic ? ' is-on' : ''}`}
					onClick={() => setSemantic((v) => !v)}
				>
					<span className="pkfa-semantic-switch" aria-hidden="true" />
					{s.graphSemanticLabel}
				</Button>}
			</div>

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
						keyTipKeys={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.graphCanvas}
						initialViewport={viewport}
						onViewportChange={setViewport}
						summary={meta}
						buildingLabel="Loading neighborhood…"
						emptyLabel="No linked notes around this document yet."
						onNodeTap={({ id, path: nodePath, isHub }) => {
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
