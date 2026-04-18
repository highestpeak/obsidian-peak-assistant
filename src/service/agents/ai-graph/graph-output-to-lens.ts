import type { GraphOutput } from './graph-output-types';
import type { LensGraphData, LensNodeData, LensType } from '@/ui/component/mine/multi-lens-graph/types';

export function graphOutputToLensData(output: GraphOutput): LensGraphData {
	const nodes: LensNodeData[] = output.nodes.map(n => ({
		label: n.label,
		path: n.path,
		role: n.role,
		group: n.cluster_id,
		clusterId: n.cluster_id,
		summary: n.summary,
		importance: n.importance,
		createdAt: n.created_at,
	}));

	const edges = output.edges.map(e => ({
		source: e.source,
		target: e.target,
		kind: e.kind as LensGraphData['edges'][number]['kind'],
		weight: e.weight,
		label: e.label,
	}));

	const availableLenses: LensType[] = ['topology'];
	if (output.bridges.length > 0) availableLenses.push('bridge');
	const hasTimeline = output.evolution_chains.length > 0
		|| output.nodes.some(n => n.created_at != null);
	if (hasTimeline) availableLenses.push('timeline');

	return {
		nodes,
		edges,
		availableLenses,
		clusters: output.clusters,
		bridges: output.bridges,
		evolutionChains: output.evolution_chains,
		insights: output.insights,
	};
}
