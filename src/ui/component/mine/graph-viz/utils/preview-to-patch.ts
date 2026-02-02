/**
 * Convert UIPreviewGraph to GraphPatch.
 */

import type { GraphPatch } from '@/ui/component/mine/graph-viz/utils/graphPatches';
import type { UIPreviewGraph } from '../types';

export interface PreviewToPatchOptions {
	defaultEdgeKind: string;
	defaultNodeType: string;
}

export function previewToPatch(
	g: UIPreviewGraph,
	options: PreviewToPatchOptions
): GraphPatch {
	const { defaultEdgeKind, defaultNodeType } = options;

	return {
		upsertNodes: (g.nodes ?? []).map((n) => ({
			id: String(n.id),
			label: String(n.label ?? n.id),
			type: String((n as { type?: string }).type ?? defaultNodeType),
		})),
		upsertEdges: (g.edges ?? []).map((e) => ({
			from_node_id: String(e.from_node_id),
			to_node_id: String(e.to_node_id),
			weight: typeof e.weight === 'number' ? e.weight : 1,
			kind: e.kind ?? defaultEdgeKind,
		})),
		meta: { toolName: 'graph', label: 'Syncing graph…' },
	};
}
