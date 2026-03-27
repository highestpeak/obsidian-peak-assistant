/**
 * Standalone graph debug view for mock desktop. Paste JSON from graph Copy JSON and display.
 */

import React, { useCallback, useState } from 'react';
import { GraphVisualization } from '@/ui/component/mine/GraphVisualization';
import { createObsidianGraphPreset } from '@/ui/view/quick-search/presets/obsidianGraphPreset';
import type { UIPreviewGraph, GraphSnapshot } from '@/ui/component/mine/graph-viz';
import { GraphNodeType } from '@/core/po/graph.po';
import { MOCK_INSPECTOR_GRAPH } from '../mocks/inspectorMockData';

/** Convert GraphSnapshot (Copy JSON format: source/target) to UIPreviewGraph (from_node_id/to_node_id). */
function snapshotToUIPreview(snapshot: GraphSnapshot): UIPreviewGraph {
	return {
		nodes: (snapshot.nodes ?? []).map((n) => ({
			id: n.id,
			label: n.label ?? n.id,
			type: n.type ?? GraphNodeType.Document,
			badges: n.badges,
			attributes: n.attributes,
		})),
		edges: (snapshot.edges ?? []).map((e: any) => ({
			from_node_id: e.source ?? e.from_node_id,
			to_node_id: e.target ?? e.to_node_id,
			kind: e.kind ?? e.type ?? 'physical',
			weight: typeof e.weight === 'number' ? e.weight : 1,
		})),
	};
}

/** Default mock graph (UIPreviewGraph format). */
const DEFAULT_GRAPH: UIPreviewGraph = {
	nodes: MOCK_INSPECTOR_GRAPH.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type })),
	edges: MOCK_INSPECTOR_GRAPH.edges.map((e) => ({
		from_node_id: e.from_node_id,
		to_node_id: e.to_node_id,
		kind: (e as { kind?: string }).kind ?? (e as { type?: string }).type ?? 'physical',
		weight: 1,
	})),
};

const DEFAULT_JSON = JSON.stringify(DEFAULT_GRAPH, null, 2);

const preset = createObsidianGraphPreset({
	copyText: async (t) => navigator.clipboard.writeText(t),
});

export const GraphDebugView: React.FC = () => {
	const [jsonInput, setJsonInput] = useState(DEFAULT_JSON);
	const [graph, setGraph] = useState<UIPreviewGraph | null>(() => DEFAULT_GRAPH);
	const [parseError, setParseError] = useState<string | null>(null);

	const handleLoad = useCallback(() => {
		setParseError(null);
		try {
			const parsed = JSON.parse(jsonInput) as GraphSnapshot | UIPreviewGraph;
			if (!parsed || typeof parsed !== 'object') {
				setParseError('Invalid JSON: expected object');
				return;
			}
			const nodes = (parsed as any).nodes;
			const edges = (parsed as any).edges;
			if (!Array.isArray(nodes) || !Array.isArray(edges)) {
				setParseError('Expected nodes and edges arrays');
				return;
			}
			const firstEdge = edges[0];
			const isSnapshot = firstEdge && ('source' in firstEdge || 'target' in firstEdge);
			const uiGraph = isSnapshot ? snapshotToUIPreview(parsed as GraphSnapshot) : (parsed as UIPreviewGraph);
			setGraph(uiGraph);
		} catch (e: any) {
			setParseError(e?.message ?? 'Parse failed');
		}
	}, [jsonInput]);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
			<div
				style={{
					flexShrink: 0,
					padding: '12px 16px',
					backgroundColor: '#f8f9fa',
					borderBottom: '1px solid #e5e5e5',
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
				}}
			>
				<div style={{ fontSize: 12, color: '#6c757d' }}>
					Paste JSON from graph Copy JSON (source/target) or UIPreviewGraph (from_node_id/to_node_id).
				</div>
				<div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
					<textarea
						value={jsonInput}
						onChange={(e) => setJsonInput(e.target.value)}
						placeholder='{"nodes":[...],"edges":[...]}'
						style={{
							flex: 1,
							minHeight: 120,
							fontFamily: 'monospace',
							fontSize: 12,
							padding: 8,
							border: '1px solid #dee2e6',
							borderRadius: 6,
							resize: 'vertical',
						}}
					/>
					<button
						onClick={handleLoad}
						style={{
							padding: '8px 16px',
							backgroundColor: '#007bff',
							color: 'white',
							border: 'none',
							borderRadius: 6,
							cursor: 'pointer',
							fontSize: 14,
							fontWeight: 500,
						}}
					>
						Load
					</button>
				</div>
				{parseError && <div style={{ fontSize: 12, color: '#dc3545' }}>{parseError}</div>}
			</div>
			<div style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column' }}>
				<GraphVisualization
					graph={graph}
					snapshotMarkdownOptions={preset.snapshotMarkdownOptions}
					defaultNodeType={preset.defaultNodeType}
					defaultEdgeKind={preset.defaultEdgeKind}
					getNodeStyle={preset.getNodeStyle}
					getEdgeStyle={preset.getEdgeStyle}
					getNodeLabel={preset.getNodeLabel}
					extractPathFromNode={preset.extractPathFromNode}
					effectKindMap={preset.effectKindMap}
					normalizeNodeId={preset.normalizeNodeId}
					onNodeClick={preset.onNodeClick}
					title="Graph Debug"
					showToolsPanel={true}
					containerClassName="pktw-flex-1 pktw-min-h-0"
				/>
			</div>
		</div>
	);
};
