import type { TemplateManager } from '@/core/template/TemplateManager';
import { buildLocalHubGraphForPath } from '@/service/search/index/helper/hub';
import { getIndexTenantForPath } from '@/service/search/index/indexService';
import { buildResponse } from '../types';

/**
 * Return a weighted local graph around one note path for hub inspection.
 */
export async function hubLocalGraph(
	params: {
		center_note_path: string;
		max_depth?: number | null;
		response_format?: 'structured' | 'markdown' | 'hybrid';
	},
	templateManager?: TemplateManager,
) {
	const centerPath = String(params.center_note_path ?? '').trim();
	if (!centerPath) {
		return 'Hub local graph failed. center_note_path is required.';
	}

	const tenant = getIndexTenantForPath(centerPath);
	const maxDepth = Math.max(1, Math.min(6, Number(params.max_depth ?? 4) || 4));
	const local = await buildLocalHubGraphForPath({
		tenant,
		centerPath,
		hubNodeIdSet: new Set<string>(),
		maxDepth,
	});

	if (!local) {
		return `Hub local graph failed. Start note "${centerPath}" not found in database.`;
	}

	const data = {
		center_note_path: centerPath,
		max_depth: maxDepth,
		frontierSummary: local.frontierSummary,
		coverageSummary: local.coverageSummary,
		graph: {
			nodes: local.nodes.map((node) => ({
				id: node.nodeId,
				label: node.label,
				type: node.type,
				depth: node.depth,
				foundBy: 'physical_neighbors' as const,
				path: node.path,
				attributes: {
					hubNodeWeight: node.hubNodeWeight,
					distancePenalty: node.distancePenalty,
					cohesionScore: node.cohesionScore,
					bridgePenalty: node.bridgePenalty,
					roleHint: node.roleHint,
					expandPriority: node.expandPriority,
				},
			})),
			edges: local.edges.map((edge) => ({
				from_node_id: edge.fromNodeId,
				to_node_id: edge.toNodeId,
				type: edge.edgeType,
				weight: edge.hubEdgeWeight,
				attributes: {
					weight: edge.hubEdgeWeight,
					hubEdgeWeight: edge.hubEdgeWeight,
					edgeTypeWeight: edge.edgeTypeWeight,
					semanticSupport: edge.semanticSupport,
					crossBoundaryPenalty: edge.crossBoundaryPenalty,
				},
			})),
		},
	};

	const markdownTemplate = [
		'# Hub local graph',
		'',
		'- Center: `{{center_note_path}}`',
		'- Max depth: `{{max_depth}}`',
		'- Nodes: `{{graph.nodes.length}}`',
		'- Edges: `{{graph.edges.length}}`',
		'- Stop reason: `{{frontierSummary.reason}}`',
	].join('\n');

	return buildResponse(params.response_format ?? 'structured', markdownTemplate, data, {
		templateManager,
	});
}
