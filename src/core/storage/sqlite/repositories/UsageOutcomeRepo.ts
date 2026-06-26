import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database as DbSchema, UsageOutcomeRow } from '../ddl';
import type { UsageOutcomeEventType } from '@/core/types/usage';

/**
 * Repository for the `usage_outcome` table — outcome events that follow a
 * `usage_log` row (vault saves, copilot accepts, search clicks, etc.).
 *
 * Powers the "useful message" rate (MPG) on the Usage Dashboard and is
 * intentionally feature-agnostic so agent-trace / copilot-review /
 * search-analytics can read from the same store.
 */
export class UsageOutcomeRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	// ── CRUD ────────────────────────────────────────────────

	/** Insert one outcome row. */
	async insert(row: Omit<UsageOutcomeRow, 'id'>): Promise<void> {
		await this.db
			.insertInto('usage_outcome')
			.values(row)
			.execute();
	}

	/** All outcomes for a single usage_log message, ordered by occurred_at asc. */
	async findByMessage(message_id: string): Promise<UsageOutcomeRow[]> {
		return this.db
			.selectFrom('usage_outcome')
			.selectAll()
			.where('message_id', '=', message_id)
			.orderBy('occurred_at', 'asc')
			.execute();
	}

	/** Outcomes for a session, optionally after a timestamp, ordered by occurred_at asc. */
	async findBySession(session_id: string, since_ms?: number): Promise<UsageOutcomeRow[]> {
		let q = this.db
			.selectFrom('usage_outcome')
			.selectAll()
			.where('session_id', '=', session_id);
		if (since_ms !== undefined) {
			q = q.where('occurred_at', '>=', since_ms);
		}
		return q.orderBy('occurred_at', 'asc').execute();
	}

	/**
	 * Count outcomes grouped by event_type within a time range — for KPI panels.
	 * Note: `count` is typed loose because Kysely's COUNT() returns a numeric
	 * string on some drivers; we coerce to number.
	 */
	async countByType(range: { from: number; to: number }): Promise<Array<{ event_type: UsageOutcomeEventType; count: number }>> {
		const rows = await sql<{ event_type: string; count: number }>`
			SELECT event_type, COUNT(*) AS count
			FROM usage_outcome
			WHERE occurred_at >= ${range.from} AND occurred_at <= ${range.to}
			GROUP BY event_type
			ORDER BY count DESC
		`.execute(this.db);

		return rows.rows.map((r) => ({
			event_type: r.event_type as UsageOutcomeEventType,
			count: Number(r.count),
		}));
	}

	/**
	 * Useful-rate denominator helper: count of distinct `message_id`s that
	 * have ≥1 outcome within a time range. Powers MPG (messages-per-useful-thing).
	 */
	async countUsefulMessages(range: { from: number; to: number }): Promise<number> {
		const result = await sql<{ n: number }>`
			SELECT COUNT(DISTINCT message_id) AS n
			FROM usage_outcome
			WHERE occurred_at >= ${range.from} AND occurred_at <= ${range.to}
		`.execute(this.db);

		return Number(result.rows[0]?.n ?? 0);
	}

	/**
	 * Distinct `message_id`s in range with ≥1 outcome (any type). Like
	 * {@link countUsefulMessages} but returns the IDs themselves so the
	 * caller can intersect with per-feature message_id sets — used by the
	 * Outcome Value screen to compute per-feature MPG.
	 */
	async usefulMessageIds(range: { from: number; to: number }): Promise<string[]> {
		const result = await sql<{ message_id: string }>`
			SELECT DISTINCT message_id
			FROM usage_outcome
			WHERE occurred_at >= ${range.from} AND occurred_at <= ${range.to}
		`.execute(this.db);

		return result.rows.map((r) => r.message_id);
	}

	/**
	 * Distinct `message_id`s in range with ≥1 "strong" outcome (vault_save /
	 * copilot_accept / agent_file_emit). Sibling of {@link countAdoptedMessages}
	 * that returns the IDs for per-feature intersection.
	 */
	async adoptedMessageIds(range: { from: number; to: number }): Promise<string[]> {
		const result = await sql<{ message_id: string }>`
			SELECT DISTINCT message_id
			FROM usage_outcome
			WHERE occurred_at >= ${range.from} AND occurred_at <= ${range.to}
			  AND event_type IN ('vault_save', 'copilot_accept', 'agent_file_emit')
		`.execute(this.db);

		return result.rows.map((r) => r.message_id);
	}

	/**
	 * Funnel stage-3 ("adopted") helper: count of distinct `message_id`s with
	 * ≥1 "strong" outcome — i.e. an event_type that represents the user
	 * actually keeping the AI output (vault save, copilot accept, agent file
	 * emit). Excludes the weaker `search_click` (mere inspection) and
	 * `continuation` (engagement, not adoption).
	 *
	 * Mirrors {@link countUsefulMessages} but with an event_type filter; used
	 * by the dashboard Overview's 3-stage funnel (invoked → inspected → adopted).
	 */
	async countAdoptedMessages(range: { from: number; to: number }): Promise<number> {
		const result = await sql<{ n: number }>`
			SELECT COUNT(DISTINCT message_id) AS n
			FROM usage_outcome
			WHERE occurred_at >= ${range.from} AND occurred_at <= ${range.to}
			  AND event_type IN ('vault_save', 'copilot_accept', 'agent_file_emit')
		`.execute(this.db);

		return Number(result.rows[0]?.n ?? 0);
	}

	/**
	 * Per-day count of distinct strong-outcome message_ids — used by the
	 * dashboard "This week" sparkline trio to compute cost-per-saved per day.
	 * Dates are 'YYYY-MM-DD' in local time, matching usage_log's daily aggregates.
	 */
	async adoptedCountByDay(startMs: number, endMs: number): Promise<Array<{ date: string; count: number }>> {
		const rows = await sql<{ date: string; n: number }>`
			SELECT
				date(occurred_at / 1000, 'unixepoch', 'localtime') AS date,
				COUNT(DISTINCT message_id) AS n
			FROM usage_outcome
			WHERE occurred_at >= ${startMs} AND occurred_at <= ${endMs}
			  AND event_type IN ('vault_save', 'copilot_accept', 'agent_file_emit')
			GROUP BY date
			ORDER BY date ASC
		`.execute(this.db);

		return rows.rows.map((r) => ({ date: r.date, count: Number(r.n) }));
	}
}
