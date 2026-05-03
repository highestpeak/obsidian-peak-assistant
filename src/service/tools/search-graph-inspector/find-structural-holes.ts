/**
 * Inspector tool: find_structural_holes
 * Queries precomputed structural analysis data (betweenness, communities, gaps).
 */

import { ToolTemplateId } from '@/core/template/TemplateRegistry';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { buildResponse } from '../types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export async function findStructuralHoles(
	params: {
		min_gap_score?: number | null;
		limit?: number | null;
		include_bridges?: boolean | null;
		response_format?: 'markdown' | 'structured' | 'hybrid';
	},
	templateManager?: TemplateManager,
) {
	const minScore = params.min_gap_score ?? 0.3;
	const limit = params.limit ?? 10;
	const includeBridges = params.include_bridges !== false;
	const responseFormat = params.response_format ?? 'markdown';

	const repo = sqliteStoreManager.getStructuralMetricsRepo();

	// Fetch structural holes
	const allGaps = await repo.getStructuralHoles(minScore);
	const gaps = allGaps.slice(0, limit);

	// Fetch communities
	const communities = await repo.getCommunities();
	const communityMap = new Map(communities.map(c => [c.community_id, c]));

	// Enrich gaps with community labels
	const enrichedGaps = gaps.map(g => ({
		...g,
		communityALabel: communityMap.get(g.communityA)?.label ?? `Community ${g.communityA}`,
		communityASize: communityMap.get(g.communityA)?.member_count ?? 0,
		communityBLabel: communityMap.get(g.communityB)?.label ?? `Community ${g.communityB}`,
		communityBSize: communityMap.get(g.communityB)?.member_count ?? 0,
	}));

	// Fetch top bridge nodes (high betweenness, low constraint)
	let bridges: Array<{
		nodeId: string;
		betweenness: number;
		burtConstraint: number;
		communityId: number;
	}> = [];

	if (includeBridges) {
		const topNodes = await repo.getTopByBetweenness(20);
		bridges = topNodes
			.filter(n => n.burt_constraint < 0.5) // structural hole occupants
			.slice(0, 10)
			.map(n => ({
				nodeId: n.node_id,
				betweenness: n.betweenness,
				burtConstraint: n.burt_constraint,
				communityId: n.community_id,
			}));
	}

	// Resolve node labels for bridge candidates
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo('vault');
	const allNodeIds = [
		...bridges.map(b => b.nodeId),
		...gaps.flatMap(g => g.bridgeCandidates),
	];
	const nodeMap = allNodeIds.length > 0
		? await mobiusNodeRepo.getByIds(allNodeIds)
		: new Map<string, { label: string; attributes: string }>();
	const nodeLabels = new Map<string, { label: string; path: string }>();
	for (const [id, node] of nodeMap) {
		const attrs = JSON.parse(node.attributes || '{}');
		nodeLabels.set(id, { label: node.label, path: attrs.path ?? id });
	}

	const data = {
		gaps: enrichedGaps.map(g => ({
			...g,
			bridgeCandidateLabels: g.bridgeCandidates.map(id => ({
				nodeId: id,
				label: nodeLabels.get(id)?.label ?? id,
				path: nodeLabels.get(id)?.path ?? '',
			})),
		})),
		bridges: bridges.map(b => ({
			...b,
			label: nodeLabels.get(b.nodeId)?.label ?? b.nodeId,
			path: nodeLabels.get(b.nodeId)?.path ?? '',
			communityLabel: communityMap.get(b.communityId)?.label ?? `Community ${b.communityId}`,
		})),
		communities: communities.map(c => ({
			id: c.community_id,
			label: c.label ?? `Community ${c.community_id}`,
			memberCount: c.member_count,
			avgBetweenness: c.avg_betweenness,
		})),
		summary: {
			totalCommunities: communities.length,
			totalGaps: allGaps.length,
			shownGaps: gaps.length,
			totalBridges: bridges.length,
		},
	};

	return buildResponse(responseFormat, ToolTemplateId.StructuralHoles, data, { templateManager });
}
