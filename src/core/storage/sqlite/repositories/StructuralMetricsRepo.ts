import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { StructuralMetric, CommunityData, GapPair } from '@/service/search/index/helper/backbone/structuralTypes';

const UPSERT_BATCH_SIZE = 500;

/**
 * Repository for structural analysis data: betweenness centrality, communities, structural holes.
 * Operates on vault (search) database only.
 */
export class StructuralMetricsRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	// ─── structural_metrics ──────────────────────────────────────────────

	async upsertMetricsBatch(metrics: StructuralMetric[]): Promise<void> {
		for (let i = 0; i < metrics.length; i += UPSERT_BATCH_SIZE) {
			const batch = metrics.slice(i, i + UPSERT_BATCH_SIZE);
			const now = Date.now();
			await this.db
				.insertInto('structural_metrics')
				.values(batch.map(m => ({
					node_id: m.nodeId,
					betweenness: m.betweenness,
					burt_constraint: m.burtConstraint,
					community_id: m.communityId,
					computed_at: now,
				})))
				.onConflict(oc => oc
					.column('node_id')
					.doUpdateSet({
						betweenness: (eb: any) => eb.ref('excluded.betweenness'),
						burt_constraint: (eb: any) => eb.ref('excluded.burt_constraint'),
						community_id: (eb: any) => eb.ref('excluded.community_id'),
						computed_at: now,
					})
				)
				.execute();
		}
	}

	async getByNodeIds(nodeIds: string[]): Promise<Map<string, DbSchema['structural_metrics']>> {
		if (nodeIds.length === 0) return new Map();
		const rows = await this.db
			.selectFrom('structural_metrics')
			.selectAll()
			.where('node_id', 'in', nodeIds)
			.execute();
		return new Map(rows.map(r => [r.node_id, r]));
	}

	async getTopByBetweenness(limit: number): Promise<DbSchema['structural_metrics'][]> {
		return await this.db
			.selectFrom('structural_metrics')
			.selectAll()
			.orderBy('betweenness', 'desc')
			.limit(limit)
			.execute();
	}

	async getByCommunity(communityId: number): Promise<DbSchema['structural_metrics'][]> {
		return await this.db
			.selectFrom('structural_metrics')
			.selectAll()
			.where('community_id', '=', communityId)
			.execute();
	}

	async clearMetrics(): Promise<void> {
		await sql`DELETE FROM structural_metrics`.execute(this.db);
	}

	// ─── communities ─────────────────────────────────────────────────────

	async upsertCommunities(communities: CommunityData[]): Promise<void> {
		if (communities.length === 0) return;
		const now = Date.now();
		for (let i = 0; i < communities.length; i += UPSERT_BATCH_SIZE) {
			const batch = communities.slice(i, i + UPSERT_BATCH_SIZE);
			await this.db
				.insertInto('communities')
				.values(batch.map(c => ({
					community_id: c.communityId,
					label: c.label,
					member_count: c.memberCount,
					avg_betweenness: c.avgBetweenness,
					centroid_embedding: c.centroidEmbedding
						? Buffer.from(new Float32Array(c.centroidEmbedding).buffer)
						: null,
					computed_at: now,
				})))
				.onConflict(oc => oc
					.column('community_id')
					.doUpdateSet({
						label: (eb: any) => eb.ref('excluded.label'),
						member_count: (eb: any) => eb.ref('excluded.member_count'),
						avg_betweenness: (eb: any) => eb.ref('excluded.avg_betweenness'),
						centroid_embedding: (eb: any) => eb.ref('excluded.centroid_embedding'),
						computed_at: now,
					})
				)
				.execute();
		}
	}

	async getCommunities(): Promise<DbSchema['communities'][]> {
		return await this.db
			.selectFrom('communities')
			.selectAll()
			.orderBy('member_count', 'desc')
			.execute();
	}

	async clearCommunities(): Promise<void> {
		await sql`DELETE FROM communities`.execute(this.db);
	}

	// ─── structural_holes ────────────────────────────────────────────────

	async upsertStructuralHoles(holes: GapPair[]): Promise<void> {
		if (holes.length === 0) return;
		const now = Date.now();
		for (const h of holes) {
			await this.db
				.insertInto('structural_holes')
				.values({
					community_a: h.communityA,
					community_b: h.communityB,
					gap_score: h.gapScore,
					semantic_sim: h.semanticSim,
					inter_density: h.interDensity,
					bridge_candidates: JSON.stringify(h.bridgeCandidates),
					status: h.status,
					computed_at: now,
				})
				.onConflict(oc => oc
					.columns(['community_a', 'community_b'])
					.doUpdateSet({
						gap_score: h.gapScore,
						semantic_sim: h.semanticSim,
						inter_density: h.interDensity,
						bridge_candidates: JSON.stringify(h.bridgeCandidates),
						status: h.status,
						computed_at: now,
					})
				)
				.execute();
		}
	}

	async getStructuralHoles(minScore?: number): Promise<GapPair[]> {
		let query = this.db
			.selectFrom('structural_holes')
			.selectAll()
			.orderBy('gap_score', 'desc');

		if (minScore !== undefined) {
			query = query.where('gap_score', '>=', minScore);
		}

		const rows = await query.execute();
		return rows.map(r => ({
			communityA: r.community_a,
			communityB: r.community_b,
			gapScore: r.gap_score,
			semanticSim: r.semantic_sim,
			interDensity: r.inter_density,
			bridgeCandidates: r.bridge_candidates ? JSON.parse(r.bridge_candidates) : [],
			status: r.status as GapPair['status'],
		}));
	}

	async clearStructuralHoles(): Promise<void> {
		await sql`DELETE FROM structural_holes`.execute(this.db);
	}

	// ─── bulk clear for full rebuild ─────────────────────────────────────

	async clearAll(): Promise<void> {
		await this.clearMetrics();
		await this.clearCommunities();
		await this.clearStructuralHoles();
	}
}
