/**
 * Incremental graph loading: when node count exceeds threshold, push nodes/edges in batches via RAF(requestAnimationFrame).
 * Avoids UI freeze on large graphs (see doc/graph-viz-crash-fix).
 */

import React, { useEffect, useRef } from 'react';
import type { UIPreviewGraph } from '../types';
import type { GraphPatch } from '../utils/graphPatches';
import {
	STREAM_NODE_THRESHOLD,
	STREAM_BATCH_SIZE,
	STREAM_INTERVAL_MS,
	STREAM_TIME_SLICE_MS,
} from '../core/constants';

export type UseGraphStreamingParams = {
	graph: UIPreviewGraph | null | undefined;
	defaultNodeType: string;
	defaultEdgeKind: string;
	previewToPatch: (g: UIPreviewGraph) => GraphPatch;
	applyPatchRef: React.MutableRefObject<(patch: GraphPatch, opts?: { streamPhase?: 'batch' | 'last' }) => void | Promise<void>>;
	clearRef: React.MutableRefObject<() => void>;
	/** Bump to force clear + re-stream same graph (e.g. relayout button). */
	relayoutTrigger?: number;
};

export function useGraphStreaming({
	graph,
	defaultNodeType,
	defaultEdgeKind,
	previewToPatch,
	applyPatchRef,
	clearRef,
	relayoutTrigger = 0,
}: UseGraphStreamingParams): void {
	const streamTokenRef = useRef(0);
	const streamRafRef = useRef<number | null>(null);
	const lastStreamTsRef = useRef<number>(0);

	useEffect(() => {
		if (!graph) {
			clearRef.current();
			return;
		}
		const nodes = graph.nodes ?? [];
		const edges = graph.edges ?? [];

		// Always clear when graph changes (ensures cache is reset before full replace or streaming).
		clearRef.current();

		// If the graph is small enough, apply the full patch immediately.
		if (nodes.length <= STREAM_NODE_THRESHOLD) {
			applyPatchRef.current(previewToPatch(graph));
			return;
		}

		// Otherwise, use RAF to stream the patch in batches.

		// Token is a symbol to identify the current streaming operation. 
		// To help cancel the previous RAF(requestAnimationFrame) if it exists.
		const token = ++streamTokenRef.current;
		if (streamRafRef.current != null) {
			window.cancelAnimationFrame(streamRafRef.current);
			streamRafRef.current = null;
		}

		// build edgesByNode
		const edgeKey = (e: { from_node_id: string; to_node_id: string; kind?: string }) =>
			`${e.from_node_id}\t${e.to_node_id}\t${e.kind ?? ''}`;
		type EdgeWithKey = { e: (typeof edges)[number]; key: string };
		const edgesByNode = new Map<string, EdgeWithKey[]>();
		for (const e of edges) {
			const from = e.from_node_id;
			const to = e.to_node_id;
			const key = edgeKey(e);
			const item: EdgeWithKey = { e, key };
			if (!edgesByNode.has(from)) edgesByNode.set(from, []);
			if (!edgesByNode.has(to)) edgesByNode.set(to, []);
			edgesByNode.get(from)!.push(item);
			edgesByNode.get(to)!.push(item);
		}

		// idx is the index of the current node being processed.
		let idx = 0;
		const nodeIds = new Set<string>();
		const pushedEdgeKeys = new Set<string>();
		const pushBatch = () => {
			if (token !== streamTokenRef.current || idx >= nodes.length) return;
			const sliceEnd = performance.now() + STREAM_TIME_SLICE_MS;

			// push a batch of nodes and edges.
			const patchNodes: GraphPatch['upsertNodes'] = [];
			const patchEdges: GraphPatch['upsertEdges'] = [];
			// this loop only takes about 0.1ms to build the batch.
			for (let k = 0; k < STREAM_BATCH_SIZE && idx < nodes.length; k++, idx++) {
				if (performance.now() > sliceEnd) break;

				const n = nodes[idx];
				if (!n?.id) continue;
				patchNodes.push({
					id: String(n.id),
					label: String(n.label ?? n.id),
					type: String((n as { type?: string }).type ?? defaultNodeType),
					badges: n.badges,
				});
				nodeIds.add(n.id);
				const incident = edgesByNode.get(n.id) ?? [];
				for (const { e, key: k2 } of incident) {
					if (!nodeIds.has(e.from_node_id) || !nodeIds.has(e.to_node_id)) continue;
					if (pushedEdgeKeys.has(k2)) continue;
					pushedEdgeKeys.add(k2);
					patchEdges.push({
						from_node_id: String(e.from_node_id),
						to_node_id: String(e.to_node_id),
						weight: typeof e.weight === 'number' ? e.weight : 1,
						kind: e.kind ?? defaultEdgeKind,
					});
				}
			}

			if (patchNodes.length || patchEdges.length) {
				const isLastBatch = idx >= nodes.length;
				applyPatchRef.current(
					{
						upsertNodes: patchNodes,
						upsertEdges: patchEdges,
						meta: { toolName: 'graph', label: 'Syncing graph…' },
					},
					{ streamPhase: isLastBatch ? 'last' : 'batch' }
				);
			}
		};
		const tick = (ts: number) => {
			if (token !== streamTokenRef.current) return;
			if (idx >= nodes.length) {
				streamRafRef.current = null;
				return;
			}

			// only push a batch if the time interval has passed.
			if (!lastStreamTsRef.current) lastStreamTsRef.current = ts - STREAM_INTERVAL_MS;
			if (ts - lastStreamTsRef.current >= STREAM_INTERVAL_MS) {
				lastStreamTsRef.current = ts;
				pushBatch();
			}
			streamRafRef.current = window.requestAnimationFrame(tick);
		};

		streamRafRef.current = window.requestAnimationFrame(tick);
		return () => {
			streamTokenRef.current += 1;
			if (streamRafRef.current != null) {
				window.cancelAnimationFrame(streamRafRef.current);
				streamRafRef.current = null;
			}
		};
	}, [graph, defaultNodeType, defaultEdgeKind, previewToPatch, relayoutTrigger]);
}
