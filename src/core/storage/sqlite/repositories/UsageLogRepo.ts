import type { Kysely } from 'kysely';
import type { Database as DbSchema, UsageLogRow, UsageDailyRow } from '../ddl';
import { sql } from 'kysely';

/**
 * Repository for usage_log and usage_daily tables.
 * Handles CRUD, aggregation queries, and daily compaction.
 */
export class UsageLogRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	// ── CRUD ────────────────────────────────────────────────

	/**
	 * Insert one usage_log record.
	 */
	async insert(row: Omit<UsageLogRow, 'id'>): Promise<void> {
		await this.db
			.insertInto('usage_log')
			.values(row)
			.execute();
	}

	/**
	 * Get all logs in a time range, ordered by created_at desc.
	 */
	async getLogsByRange(startMs: number, endMs: number): Promise<UsageLogRow[]> {
		return this.db
			.selectFrom('usage_log')
			.selectAll()
			.where('created_at', '>=', startMs)
			.where('created_at', '<=', endMs)
			.orderBy('created_at', 'desc')
			.execute();
	}

	/**
	 * Get logs filtered by feature, with pagination.
	 */
	async getLogsByRangeFiltered(
		startMs: number,
		endMs: number,
		feature?: string,
		limit = 50,
		offset = 0,
	): Promise<UsageLogRow[]> {
		let query = this.db
			.selectFrom('usage_log')
			.selectAll()
			.where('created_at', '>=', startMs)
			.where('created_at', '<=', endMs);

		if (feature) {
			query = query.where('feature', '=', feature);
		}

		return query
			.orderBy('created_at', 'desc')
			.limit(limit)
			.offset(offset)
			.execute();
	}

	/**
	 * Get aggregated daily rows in a date range (inclusive).
	 * Dates are strings in 'YYYY-MM-DD' format.
	 */
	async getDailyByRange(startDate: string, endDate: string): Promise<UsageDailyRow[]> {
		return this.db
			.selectFrom('usage_daily')
			.selectAll()
			.where('date', '>=', startDate)
			.where('date', '<=', endDate)
			.orderBy('date', 'asc')
			.execute();
	}

	// ── Compaction ──────────────────────────────────────────

	/**
	 * Aggregate expired detail rows into daily buckets, then delete originals.
	 * Returns the count of deleted usage_log rows.
	 */
	async compactBefore(cutoffMs: number): Promise<number> {
		// Step 1: UPSERT aggregated rows into usage_daily
		await sql`
			INSERT INTO usage_daily (date, feature, action, provider, model,
				call_count, total_input_tokens, total_output_tokens,
				total_cached_tokens, total_reasoning_tokens,
				total_cost_usd, avg_duration_ms, max_duration_ms)
			SELECT
				date(created_at / 1000, 'unixepoch', 'localtime') AS date,
				feature, action, provider, model,
				COUNT(*)                AS call_count,
				SUM(input_tokens)       AS total_input_tokens,
				SUM(output_tokens)      AS total_output_tokens,
				SUM(cached_tokens)      AS total_cached_tokens,
				SUM(reasoning_tokens)   AS total_reasoning_tokens,
				SUM(cost_usd)           AS total_cost_usd,
				AVG(duration_ms)        AS avg_duration_ms,
				MAX(duration_ms)        AS max_duration_ms
			FROM usage_log
			WHERE created_at < ${cutoffMs}
			GROUP BY date(created_at / 1000, 'unixepoch', 'localtime'), feature, action, provider, model
			ON CONFLICT(date, feature, action, provider, model) DO UPDATE SET
				call_count             = usage_daily.call_count + excluded.call_count,
				total_input_tokens     = usage_daily.total_input_tokens + excluded.total_input_tokens,
				total_output_tokens    = usage_daily.total_output_tokens + excluded.total_output_tokens,
				total_cached_tokens    = usage_daily.total_cached_tokens + excluded.total_cached_tokens,
				total_reasoning_tokens = usage_daily.total_reasoning_tokens + excluded.total_reasoning_tokens,
				total_cost_usd         = usage_daily.total_cost_usd + excluded.total_cost_usd,
				avg_duration_ms        = (usage_daily.avg_duration_ms * usage_daily.call_count + excluded.avg_duration_ms * excluded.call_count)
				                         / (usage_daily.call_count + excluded.call_count),
				max_duration_ms        = MAX(usage_daily.max_duration_ms, excluded.max_duration_ms)
		`.execute(this.db);

		// Step 2: Delete compacted rows and return count
		const result = await this.db
			.deleteFrom('usage_log')
			.where('created_at', '<', cutoffMs)
			.executeTakeFirst();

		return Number(result.numDeletedRows ?? 0);
	}

	// ── Aggregate queries ──────────────────────────────────

	/**
	 * Aggregate totals for a time range:
	 * input/output tokens, cost, call count, avg duration, p95 duration.
	 */
	async sumByRange(startMs: number, endMs: number): Promise<{
		totalInputTokens: number;
		totalOutputTokens: number;
		totalCost: number;
		callCount: number;
		avgDuration: number;
		p95Duration: number;
	}> {
		const agg = await sql<{
			total_input_tokens: number;
			total_output_tokens: number;
			total_cost: number;
			call_count: number;
			avg_duration: number;
		}>`
			SELECT
				COALESCE(SUM(input_tokens), 0)  AS total_input_tokens,
				COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
				COALESCE(SUM(cost_usd), 0)      AS total_cost,
				COUNT(*)                         AS call_count,
				COALESCE(AVG(duration_ms), 0)    AS avg_duration
			FROM usage_log
			WHERE created_at >= ${startMs} AND created_at <= ${endMs}
		`.execute(this.db);

		const p95Row = await sql<{ p95: number }>`
			SELECT COALESCE(duration_ms, 0) AS p95
			FROM usage_log
			WHERE created_at >= ${startMs} AND created_at <= ${endMs}
			ORDER BY duration_ms ASC
			LIMIT 1
			OFFSET (
				SELECT MAX(CAST(COUNT(*) * 0.95 AS INTEGER) - 1, 0)
				FROM usage_log
				WHERE created_at >= ${startMs} AND created_at <= ${endMs}
			)
		`.execute(this.db);

		const row = agg.rows[0];
		return {
			totalInputTokens: row?.total_input_tokens ?? 0,
			totalOutputTokens: row?.total_output_tokens ?? 0,
			totalCost: row?.total_cost ?? 0,
			callCount: row?.call_count ?? 0,
			avgDuration: row?.avg_duration ?? 0,
			p95Duration: p95Row.rows[0]?.p95 ?? 0,
		};
	}

	/**
	 * Group by feature, return tokens + cost.
	 */
	async groupByFeature(startMs: number, endMs: number): Promise<Array<{
		feature: string;
		inputTokens: number;
		outputTokens: number;
		cost: number;
		callCount: number;
	}>> {
		const result = await sql<{
			feature: string;
			input_tokens: number;
			output_tokens: number;
			cost: number;
			call_count: number;
		}>`
			SELECT
				feature,
				SUM(input_tokens)  AS input_tokens,
				SUM(output_tokens) AS output_tokens,
				SUM(cost_usd)      AS cost,
				COUNT(*)           AS call_count
			FROM usage_log
			WHERE created_at >= ${startMs} AND created_at <= ${endMs}
			GROUP BY feature
			ORDER BY cost DESC
		`.execute(this.db);

		return result.rows.map(r => ({
			feature: r.feature,
			inputTokens: r.input_tokens,
			outputTokens: r.output_tokens,
			cost: r.cost,
			callCount: r.call_count,
		}));
	}

	/**
	 * Group by provider × model, return tokens.
	 */
	async groupByModel(startMs: number, endMs: number): Promise<Array<{
		provider: string;
		model: string;
		inputTokens: number;
		outputTokens: number;
		callCount: number;
	}>> {
		const result = await sql<{
			provider: string;
			model: string;
			input_tokens: number;
			output_tokens: number;
			call_count: number;
		}>`
			SELECT
				provider,
				model,
				SUM(input_tokens)  AS input_tokens,
				SUM(output_tokens) AS output_tokens,
				COUNT(*)           AS call_count
			FROM usage_log
			WHERE created_at >= ${startMs} AND created_at <= ${endMs}
			GROUP BY provider, model
			ORDER BY input_tokens + output_tokens DESC
		`.execute(this.db);

		return result.rows.map(r => ({
			provider: r.provider,
			model: r.model,
			inputTokens: r.input_tokens,
			outputTokens: r.output_tokens,
			callCount: r.call_count,
		}));
	}

	/**
	 * Group by provider, return cost.
	 */
	async groupByCostProvider(startMs: number, endMs: number): Promise<Array<{
		provider: string;
		cost: number;
		callCount: number;
	}>> {
		const result = await sql<{
			provider: string;
			cost: number;
			call_count: number;
		}>`
			SELECT
				provider,
				SUM(cost_usd) AS cost,
				COUNT(*)      AS call_count
			FROM usage_log
			WHERE created_at >= ${startMs} AND created_at <= ${endMs}
			GROUP BY provider
			ORDER BY cost DESC
		`.execute(this.db);

		return result.rows.map(r => ({
			provider: r.provider,
			cost: r.cost,
			callCount: r.call_count,
		}));
	}

	// ── Daily breakdown queries (for charts) ────────────────

	/**
	 * Daily breakdown by feature (for stacked bar chart).
	 */
	async dailyTokensByFeature(startMs: number, endMs: number): Promise<Array<{
		date: string;
		feature: string;
		inputTokens: number;
		outputTokens: number;
	}>> {
		const result = await sql<{
			date: string;
			feature: string;
			input_tokens: number;
			output_tokens: number;
		}>`
			SELECT
				date(created_at / 1000, 'unixepoch', 'localtime') AS date,
				feature,
				SUM(input_tokens)  AS input_tokens,
				SUM(output_tokens) AS output_tokens
			FROM usage_log
			WHERE created_at >= ${startMs} AND created_at <= ${endMs}
			GROUP BY date, feature
			ORDER BY date ASC, feature ASC
		`.execute(this.db);

		return result.rows.map(r => ({
			date: r.date,
			feature: r.feature,
			inputTokens: r.input_tokens,
			outputTokens: r.output_tokens,
		}));
	}

	/**
	 * Daily total with input/output split (for trend line).
	 */
	async dailyTokensTotal(startMs: number, endMs: number): Promise<Array<{
		date: string;
		inputTokens: number;
		outputTokens: number;
	}>> {
		const result = await sql<{
			date: string;
			input_tokens: number;
			output_tokens: number;
		}>`
			SELECT
				date(created_at / 1000, 'unixepoch', 'localtime') AS date,
				SUM(input_tokens)  AS input_tokens,
				SUM(output_tokens) AS output_tokens
			FROM usage_log
			WHERE created_at >= ${startMs} AND created_at <= ${endMs}
			GROUP BY date
			ORDER BY date ASC
		`.execute(this.db);

		return result.rows.map(r => ({
			date: r.date,
			inputTokens: r.input_tokens,
			outputTokens: r.output_tokens,
		}));
	}

	/**
	 * Daily cost by provider (for cost trend chart).
	 */
	async dailyCostByProvider(startMs: number, endMs: number): Promise<Array<{
		date: string;
		provider: string;
		cost: number;
	}>> {
		const result = await sql<{
			date: string;
			provider: string;
			cost: number;
		}>`
			SELECT
				date(created_at / 1000, 'unixepoch', 'localtime') AS date,
				provider,
				SUM(cost_usd) AS cost
			FROM usage_log
			WHERE created_at >= ${startMs} AND created_at <= ${endMs}
			GROUP BY date, provider
			ORDER BY date ASC, provider ASC
		`.execute(this.db);

		return result.rows.map(r => ({
			date: r.date,
			provider: r.provider,
			cost: r.cost,
		}));
	}
}
