/**
 * CRUD repository for structural analysis data:
 * - structural_analysis_state: key-value state
 * - community_metadata: community info
 * - structural_holes: gap analysis results
 * - mobius_node structural columns: betweenness, constraint, community_id, version
 */

import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { CommunityInfo, StructuralHole } from '@/service/search/index/helper/structural/types';

export class StructuralAnalysisRepo {
	constructor(private readonly kdb: Kysely<DbSchema>) {}

	// ─── mobius_node structural metric updates ──────────────────────────

	async batchUpdateStructuralMetrics(
		rows: Array<{ nodeId: string; betweenness: number; constraint: number; communityId: string; version: number }>,
	): Promise<void> {
		const CHUNK = 500;
		for (let i = 0; i < rows.length; i += CHUNK) {
			const chunk = rows.slice(i, i + CHUNK);
			for (const row of chunk) {
				await this.kdb
					.updateTable('mobius_node')
					.set({
						betweenness_centrality: row.betweenness,
						structural_constraint: row.constraint,
						community_id: row.communityId,
						structural_analysis_version: row.version,
					})
					.where('node_id', '=', row.nodeId)
					.execute();
			}
		}
	}

	async markNodesDirty(nodeIds: string[]): Promise<void> {
		if (nodeIds.length === 0) return;
		await this.kdb
			.updateTable('mobius_node')
			.set({ structural_analysis_version: null })
			.where('node_id', 'in', nodeIds)
			.execute();
	}

	// ─── structural_analysis_state ─────────────────────────────────────

	async getState(key: string): Promise<string | null> {
		const row = await this.kdb
			.selectFrom('structural_analysis_state')
			.select('value')
			.where('key', '=', key)
			.executeTakeFirst();
		return row?.value ?? null;
	}

	async setState(key: string, value: string): Promise<void> {
		await this.kdb
			.insertInto('structural_analysis_state')
			.values({ key, value })
			.onConflict(oc => oc.column('key').doUpdateSet({ value }))
			.execute();
	}

	// ─── community_metadata ────────────────────────────────────────────

	async upsertCommunities(communities: CommunityInfo[], version: number): Promise<void> {
		for (const com of communities) {
			await this.kdb
				.insertInto('community_metadata')
				.values({
					community_id: com.id,
					label: com.label,
					member_count: com.memberCount,
					dominant_topics_json: JSON.stringify(com.dominantTopics),
					top_nodes_json: JSON.stringify(com.topNodes),
					internal_density: com.internalDensity,
					centroid_embedding: null,
					analysis_version: version,
				})
				.onConflict(oc =>
					oc.column('community_id').doUpdateSet({
						label: com.label,
						member_count: com.memberCount,
						dominant_topics_json: JSON.stringify(com.dominantTopics),
						top_nodes_json: JSON.stringify(com.topNodes),
						internal_density: com.internalDensity,
						analysis_version: version,
					}),
				)
				.execute();
		}
	}

	async getCommunities(): Promise<CommunityInfo[]> {
		const rows = await this.kdb
			.selectFrom('community_metadata')
			.selectAll()
			.execute();

		return rows.map(row => ({
			id: row.community_id,
			label: row.label,
			memberCount: row.member_count,
			internalDensity: row.internal_density,
			topNodes: JSON.parse(row.top_nodes_json),
			dominantTopics: JSON.parse(row.dominant_topics_json),
		}));
	}

	async getCommunityById(communityId: string): Promise<CommunityInfo | null> {
		const row = await this.kdb
			.selectFrom('community_metadata')
			.selectAll()
			.where('community_id', '=', communityId)
			.executeTakeFirst();

		if (!row) return null;
		return {
			id: row.community_id,
			label: row.label,
			memberCount: row.member_count,
			internalDensity: row.internal_density,
			topNodes: JSON.parse(row.top_nodes_json),
			dominantTopics: JSON.parse(row.dominant_topics_json),
		};
	}

	// ─── structural_holes ──────────────────────────────────────────────

	async upsertHoles(holes: StructuralHole[], version: number): Promise<void> {
		for (const hole of holes) {
			await this.kdb
				.insertInto('structural_holes')
				.values({
					id: hole.id,
					community_a_id: hole.communityA.id,
					community_b_id: hole.communityB.id,
					gap_type: hole.gapType,
					gap_score: hole.gapScore,
					semantic_bridge_potential: hole.semanticBridgePotential,
					inter_density: 0, // computed from gapScore components
					existing_bridge_count: hole.existingBridges.length,
					potential_bridges_json: JSON.stringify(hole.potentialBridges),
					explanation: hole.explanation ?? null,
					status: 'open',
					analysis_version: version,
					created_at: Date.now(),
				})
				.onConflict(oc =>
					oc.column('id').doUpdateSet({
						gap_type: hole.gapType,
						gap_score: hole.gapScore,
						semantic_bridge_potential: hole.semanticBridgePotential,
						existing_bridge_count: hole.existingBridges.length,
						potential_bridges_json: JSON.stringify(hole.potentialBridges),
						analysis_version: version,
					}),
				)
				.execute();
		}
	}

	async getTopHoles(limit: number): Promise<StructuralHole[]> {
		const rows = await this.kdb
			.selectFrom('structural_holes')
			.selectAll()
			.where('status', '=', 'open')
			.orderBy('gap_score', 'desc')
			.limit(limit)
			.execute();

		const result: StructuralHole[] = [];
		for (const row of rows) {
			const comA = await this.getCommunityById(row.community_a_id);
			const comB = await this.getCommunityById(row.community_b_id);
			if (!comA || !comB) continue;

			result.push({
				id: row.id,
				communityA: comA,
				communityB: comB,
				gapScore: row.gap_score,
				gapType: row.gap_type as StructuralHole['gapType'],
				semanticBridgePotential: row.semantic_bridge_potential,
				existingBridges: [],
				potentialBridges: JSON.parse(row.potential_bridges_json),
				explanation: row.explanation ?? undefined,
			});
		}

		return result;
	}

	async getHoleById(id: string): Promise<StructuralHole | null> {
		const row = await this.kdb
			.selectFrom('structural_holes')
			.selectAll()
			.where('id', '=', id)
			.executeTakeFirst();

		if (!row) return null;
		const comA = await this.getCommunityById(row.community_a_id);
		const comB = await this.getCommunityById(row.community_b_id);
		if (!comA || !comB) return null;

		return {
			id: row.id,
			communityA: comA,
			communityB: comB,
			gapScore: row.gap_score,
			gapType: row.gap_type as StructuralHole['gapType'],
			semanticBridgePotential: row.semantic_bridge_potential,
			existingBridges: [],
			potentialBridges: JSON.parse(row.potential_bridges_json),
			explanation: row.explanation ?? undefined,
		};
	}

	async updateHoleExplanation(id: string, explanation: string): Promise<void> {
		await this.kdb
			.updateTable('structural_holes')
			.set({ explanation })
			.where('id', '=', id)
			.execute();
	}

	async updateHoleStatus(id: string, status: 'open' | 'addressed' | 'dismissed'): Promise<void> {
		await this.kdb
			.updateTable('structural_holes')
			.set({ status })
			.where('id', '=', id)
			.execute();
	}

	// ─── bridge node queries ───────────────────────────────────────────

	async getTopBridgeNodes(limit: number): Promise<Array<{
		nodeId: string;
		path: string;
		label: string;
		betweenness: number;
		constraint: number;
		communityId: string;
	}>> {
		const rows = await this.kdb
			.selectFrom('mobius_node')
			.select(['node_id', 'path', 'label', 'betweenness_centrality', 'structural_constraint', 'community_id'])
			.where('betweenness_centrality', 'is not', null)
			.where('type', 'in', ['document', 'hub_doc'])
			.orderBy('betweenness_centrality', 'desc')
			.limit(limit)
			.execute();

		return rows.map(row => ({
			nodeId: row.node_id,
			path: row.path ?? row.node_id,
			label: row.label,
			betweenness: row.betweenness_centrality ?? 0,
			constraint: row.structural_constraint ?? 1,
			communityId: row.community_id ?? '',
		}));
	}
}
