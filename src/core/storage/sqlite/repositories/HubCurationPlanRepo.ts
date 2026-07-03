import type { Kysely } from 'kysely';
import type { Database } from '../ddl';
import type { HubCurationDecision } from '@/core/schemas/agents/hubCuration';

// Persists HubCuratorAgent outputs. One row per curator run.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 1.

export type HubCurationExecutorStatus = 'pending' | 'running' | 'completed' | 'failed';
export type HubCurationTrigger = 'manual' | 'scheduled';

export interface HubCurationPlanRow {
	planId: string;
	curatedAt: number;
	trigger: HubCurationTrigger;
	coveragePct: number;
	confidence: number;
	iterations: number;
	totalHubs: number;
	decisions: HubCurationDecision[];
	worldSummary: string | null;
	executorStatus: HubCurationExecutorStatus;
	executorError: string | null;
}

export interface HubCurationPlanInsert {
	planId: string;
	curatedAt: number;
	trigger: HubCurationTrigger;
	coveragePct: number;
	confidence: number;
	iterations: number;
	decisions: HubCurationDecision[];
	worldSummary?: string | null;
}

export class HubCurationPlanRepo {
	constructor(private readonly db: Kysely<Database>) {}

	async insert(row: HubCurationPlanInsert): Promise<void> {
		await this.db
			.insertInto('hub_curation_plan')
			.values({
				plan_id: row.planId,
				curated_at: row.curatedAt,
				trigger: row.trigger,
				coverage_pct: row.coveragePct,
				confidence: row.confidence,
				iterations: row.iterations,
				total_hubs: row.decisions.length,
				decisions_json: JSON.stringify(row.decisions),
				world_summary: row.worldSummary ?? null,
				executor_status: 'pending',
				executor_error: null,
			} as any)
			.execute();
	}

	async updateExecutorStatus(
		planId: string,
		status: HubCurationExecutorStatus,
		error?: string,
	): Promise<void> {
		await this.db
			.updateTable('hub_curation_plan')
			.set({
				executor_status: status,
				executor_error: error ?? null,
			} as any)
			.where('plan_id', '=', planId)
			.execute();
	}

	async getById(planId: string): Promise<HubCurationPlanRow | null> {
		const row = await this.db
			.selectFrom('hub_curation_plan')
			.selectAll()
			.where('plan_id', '=', planId)
			.executeTakeFirst();
		return row ? mapRow(row) : null;
	}

	async listRecent(limit = 20): Promise<HubCurationPlanRow[]> {
		const rows = await this.db
			.selectFrom('hub_curation_plan')
			.selectAll()
			.orderBy('curated_at', 'desc')
			.limit(limit)
			.execute();
		return rows.map(mapRow);
	}

	async pruneOlderThan(keepCount = 20): Promise<void> {
		const survivors = await this.db
			.selectFrom('hub_curation_plan')
			.select('plan_id')
			.orderBy('curated_at', 'desc')
			.limit(keepCount)
			.execute();
		if (!survivors.length) return;
		const keepIds = survivors.map((r) => r.plan_id);
		await this.db
			.deleteFrom('hub_curation_plan')
			.where('plan_id', 'not in', keepIds)
			.execute();
	}

	async clearAll(): Promise<void> {
		await this.db.deleteFrom('hub_curation_plan').execute();
	}
}

function mapRow(row: any): HubCurationPlanRow {
	let decisions: HubCurationDecision[] = [];
	try {
		const parsed = JSON.parse(row.decisions_json);
		if (Array.isArray(parsed)) decisions = parsed as HubCurationDecision[];
	} catch {
		decisions = [];
	}
	return {
		planId: row.plan_id,
		curatedAt: Number(row.curated_at),
		trigger: (row.trigger as HubCurationTrigger) ?? 'manual',
		coveragePct: Number(row.coverage_pct),
		confidence: Number(row.confidence),
		iterations: Number(row.iterations),
		totalHubs: Number(row.total_hubs),
		decisions,
		worldSummary: row.world_summary ?? null,
		executorStatus: (row.executor_status as HubCurationExecutorStatus) ?? 'pending',
		executorError: row.executor_error ?? null,
	};
}
