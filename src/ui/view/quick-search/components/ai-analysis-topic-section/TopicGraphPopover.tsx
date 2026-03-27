import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext } from '@/app/context/AppContext';
import { openFile } from '@/core/utils/obsidian-utils';
import { findKeyNodesTool, graphTraversalTool } from '@/service/tools/search-graph-inspector';
import { toolOutputToGraphPatch } from '../../../../component/mine/graph-viz/utils/graphPatches';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { GraphPatch } from '../../../../component/mine/graph-viz/utils/graphPatches';
import { GraphVisualization } from '@/ui/component/mine/GraphVisualization';
import { Button } from '@/ui/component/shared-ui/button';
import { X } from 'lucide-react';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { isIndexedNoteNodeType } from '@/core/po/graph.po';
import { createObsidianGraphPreset } from '../../presets/obsidianGraphPreset';

/**
 * Converts GraphPatch to GraphPreview for GraphVisualization.
 */
function patchToPreview(patch: GraphPatch): GraphPreview {
	return {
		nodes: (patch.upsertNodes ?? []).map((n) => ({
			id: n.id,
			label: n.label ?? n.id,
			type: (n.type as GraphPreview['nodes'][0]['type']) ?? 'document',
		})),
		edges: (patch.upsertEdges ?? []).map((e) => ({
			from_node_id: e.from_node_id,
			to_node_id: e.to_node_id,
			weight: e.weight ?? 1,
		})),
	};
}

function mergePatches(a: GraphPatch, b: GraphPatch): GraphPatch {
	const nodeById = new Map<string, { id: string; label: string; type?: string }>();
	for (const n of [...(a.upsertNodes ?? []), ...(b.upsertNodes ?? [])]) {
		nodeById.set(n.id, { id: n.id, label: n.label ?? n.id, type: n.type });
	}
	const edgeKey = (e: { from_node_id: string; to_node_id: string }) => `${e.from_node_id}::${e.to_node_id}`;
	const edgeSet = new Map<string, { from_node_id: string; to_node_id: string; weight?: number }>();
	for (const e of [...(a.upsertEdges ?? []), ...(b.upsertEdges ?? [])]) {
		edgeSet.set(edgeKey(e), { from_node_id: e.from_node_id, to_node_id: e.to_node_id, weight: e.weight });
	}
	return {
		upsertNodes: Array.from(nodeById.values()),
		upsertEdges: Array.from(edgeSet.values()),
		meta: a.meta ?? b.meta,
	};
}

/**
 * Load graph for a topic (find_key_nodes + graph_traversal). Used by Topic expansions section.
 */
export async function loadGraphForTopic(topic: string): Promise<GraphPreview> {
	const keyTool = findKeyNodesTool();
	const keyOut = await keyTool.execute({
		limit: 15,
		semantic_filter: { query: topic, topK: 30 },
		response_format: 'structured',
	});
	const keyPatch = toolOutputToGraphPatch('find_key_nodes', keyOut);
	if (!keyPatch?.upsertNodes?.length) {
		return keyPatch ? patchToPreview(keyPatch) : { nodes: [], edges: [] };
	}
	const firstDocId = keyPatch.upsertNodes.find(
		(n) => isIndexedNoteNodeType(String(n.type)) && (n.id.includes('.md') || n.id.includes('/'))
	)?.id;
	let merged = keyPatch;
	if (firstDocId) {
		try {
			const travTool = graphTraversalTool();
			const travOut = await travTool.execute({
				start_note_path: firstDocId,
				hops: 1,
				limit: 15,
				include_semantic_paths: true,
				response_format: 'structured',
			});
			const travPatch = toolOutputToGraphPatch('graph_traversal', travOut);
			if (travPatch) merged = mergePatches(merged, travPatch);
		} catch (_) {
			// ignore traversal failure, keep key nodes only
		}
	}
	return patchToPreview(merged);
}

export interface TopicGraphPopoverProps {
	topic: string;
	anchorRect: { left: number; top: number; width: number; height: number };
	onClose?: () => void;
}

/**
 * Floating graph view for a topic: runs find_key_nodes + graph_traversal and shows a small graph.
 */
export const TopicGraphPopover: React.FC<TopicGraphPopoverProps> = ({ topic, anchorRect, onClose }) => {
	const [graph, setGraph] = useState<GraphPreview | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const obsidianPreset = useMemo(
		() =>
			createObsidianGraphPreset({
				onOpenPath: onClose ? createOpenSourceCallback(onClose) : undefined,
				openFile: (path) => openFile(AppContext.getInstance().app, path, true),
			}),
		[onClose]
	);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await loadGraphForTopic(topic);
			setGraph(result);
		} catch (e) {
			console.warn('[TopicGraphPopover] load failed:', e);
			setError(e instanceof Error ? e.message : String(e));
			setGraph({ nodes: [], edges: [] });
		} finally {
			setLoading(false);
		}
	}, [topic]);

	useEffect(() => {
		load();
	}, [load]);

	const x = anchorRect.left + anchorRect.width + 8;
	const y = anchorRect.top;
	const w = 320;
	const h = 280;

	return (
		<div
			className="pktw-fixed pktw-z-[101] pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-md pktw-shadow-lg pktw-overflow-hidden"
			style={{ left: x, top: y, width: w, height: h }}
		>
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-2 pktw-py-1.5 pktw-border-b pktw-border-[#f3f4f6]">
				<span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280]">Graph: {topic}</span>
				{onClose ? (
					<Button variant="ghost" style={{ cursor: 'pointer' }} className="pktw-text-[11px] pktw-text-[#9ca3af] hover:pktw-text-[#2e3338]" onClick={onClose}>
						<X className="pktw-w-3.5 pktw-h-3.5" />
						Close
					</Button>
				) : null}
			</div>
			<div className="pktw-w-full pktw-h-[calc(100%-32px)]">
				{loading ? (
					<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-xs pktw-text-[#9ca3af]">
						Loading graph…
					</div>
				) : error ? (
					<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-xs pktw-text-red-600">
						{error}
					</div>
				) : graph && (graph.nodes.length > 0 || graph.edges.length > 0) ? (
					<GraphVisualization
						{...obsidianPreset}
						graph={graph}
						containerClassName="pktw-w-full pktw-h-full"
					/>
				) : (
					<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-xs pktw-text-[#9ca3af]">
						No graph data for this topic
					</div>
				)}
			</div>
		</div>
	);
};
