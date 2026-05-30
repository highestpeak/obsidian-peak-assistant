import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database as DbSchema, UsageOutcomeRow } from '../ddl';
import type { UsageOutcomeEventType } from '@/service/usage/types';

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
}
