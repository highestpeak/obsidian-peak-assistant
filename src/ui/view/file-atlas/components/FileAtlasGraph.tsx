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
import { Button } from '@/ui/component/shared-ui/button';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import type { ResultSubgraphOutput } from '@/service/search/graph/resultSubgraph';
import { AtlasGraphCanvas, type AtlasGraphPreset } from '@/ui/component/graph/AtlasGraphCanvas';
import type { AtlasGraphData, FileAtlasHostPort } from '../FileAtlasHostPort';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';

interface FileAtlasGraphProps {
	path: string;
	host: FileAtlasHostPort;
	config: FileAtlasConfig;
	onAddToTray: (block: DocumentBlock) => void;
}

type Scope = 'local' | 'two-hop';

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
		hubAnchors: [],
		edges: data.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
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

export const FileAtlasGraph: React.FC<FileAtlasGraphProps> = ({ path, host, config, onAddToTray }) => {
	const s = config.strings;
	const [scope, setScope] = useState<Scope>('local');
	const [semantic, setSemantic] = useState(false);
	const [layout, setLayout] = useState<AtlasGraphPreset>('constellation');
	const [data, setData] = useState<AtlasGraphData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);

	// Fetch both reference + semantic edges up front; the semantic toggle is a
	// render-only concern the canvas handles, so scope is the only refetch key.
	useEffect(() => {
		if (!host.loadNeighborhood) {
			setData(null);
			return;
		}
		let alive = true;
		setLoading(true);
		setError(false);
		setData(null);
		host
			.loadNeighborhood(path, { hops: scope === 'two-hop' ? 2 : 1, semantic: true })
			.then((res) => { if (alive) { setData(res); setLoading(false); } })
			.catch(() => { if (alive) { setError(true); setLoading(false); } });
		return () => { alive = false; };
	}, [path, scope, host]);

	const subgraph = useMemo(() => (data ? toSubgraph(data) : null), [data]);
	const meta = data ? `${data.nodes.length} notes · ${data.edges.length} links` : '';
	const labelById = useMemo(() => {
		const m = new Map<string, string>();
		data?.nodes.forEach((n) => m.set(n.id, n.label));
		return m;
	}, [data]);

	const unavailable = !host.loadNeighborhood || error;

	return (
		<div className="pkfa-graph">
			<div className="pkfa-graph-bar">
				<div className="pkfa-graph-scope" role="tablist" aria-label="Graph scope">
					<Button
						variant="unstyled"
						type="button"
						role="tab"
						aria-selected={scope === 'local'}
						className={`pkfa-graph-scope-tab${scope === 'local' ? ' is-active' : ''}`}
						onClick={() => setScope('local')}
					>
						{s.graphScopeLocal}
					</Button>
					<Button
						variant="unstyled"
						type="button"
						role="tab"
						aria-selected={scope === 'two-hop'}
						className={`pkfa-graph-scope-tab${scope === 'two-hop' ? ' is-active' : ''}`}
						onClick={() => setScope('two-hop')}
					>
						{s.graphScopeTwoHop}
					</Button>
				</div>

				<div className="pkfa-graph-scope" role="tablist" aria-label="Graph layout">
					{LAYOUTS.map((l) => (
						<Button
							key={l.id}
							variant="unstyled"
							type="button"
							role="tab"
							aria-selected={layout === l.id}
							className={`pkfa-graph-scope-tab${layout === l.id ? ' is-active' : ''}`}
							onClick={() => setLayout(l.id)}
						>
							{l.label}
						</Button>
					))}
				</div>

				<Button
					variant="unstyled"
					type="button"
					aria-pressed={semantic}
					className={`pkfa-semantic-toggle${semantic ? ' is-on' : ''}`}
					onClick={() => setSemantic((v) => !v)}
				>
					<span className="pkfa-semantic-switch" aria-hidden="true" />
					{s.graphSemanticLabel}
				</Button>

				{meta && <span className="pkfa-graph-chip">{meta}</span>}
			</div>

			<div className="pkfa-graph-canvas">
				{unavailable ? (
					<div className="pkfa-graph-empty">
						<Network />
						<span>Neighborhood graph unavailable — index this note to see its links.</span>
					</div>
				) : (
					<AtlasGraphCanvas
						subgraph={loading ? null : subgraph}
						preset={layout}
						showSemantic={semantic}
						buildingLabel="Loading neighborhood…"
						emptyLabel="No linked notes around this document yet."
						onNodeTap={({ id, path: nodePath }) => {
							if (!nodePath || nodePath === path) return;
							onAddToTray(trayBlockForNode(id, labelById.get(id) ?? nodePath, nodePath));
							host.notify('Note added to tray');
						}}
						onNodeDblTap={({ path: nodePath }) => {
							if (nodePath) host.activateDoc(nodePath);
						}}
					/>
				)}
			</div>
		</div>
	);
};
