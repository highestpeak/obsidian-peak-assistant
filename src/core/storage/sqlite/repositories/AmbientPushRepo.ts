import { sql, type Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { TriggerType, UserAction } from '@/core/types/ambient';

/**
 * Repository for ambient_push_log table (vault.sqlite).
 *
 * Records proactive note suggestions pushed to the user and their responses.
 */
export class AmbientPushRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Insert a push record.
	 */
	async logPush(params: {
		timestamp: number;
		triggerType: TriggerType;
		sourceFilePath: string;
		contextParagraph: string | null;
		pushedFilePath: string;
		pushedScore: number;
		explanationType: string;
		explanationText: string;
	}): Promise<void> {
		await this.db
			.insertInto('ambient_push_log')
			.values({
				id: undefined, // AUTOINCREMENT
				timestamp: params.timestamp,
				trigger_type: params.triggerType,
				source_file_path: params.sourceFilePath,
				context_paragraph: params.contextParagraph,
				pushed_file_path: params.pushedFilePath,
				pushed_score: params.pushedScore,
				explanation_type: params.explanationType,
				explanation_text: params.explanationText,
				user_action: null,
				user_action_ts: null,
			})
			.execute();
	}

	/**
	 * Update user_action on the most recent matching push (source + pushed pair).
	 */
	async recordAction(params: {
		sourceFilePath: string;
		pushedFilePath: string;
		action: UserAction;
		actionTs: number;
	}): Promise<void> {
		// Find the most recent push for this pair
		const row = await this.db
			.selectFrom('ambient_push_log')
			.select('id')
			.where('source_file_path', '=', params.sourceFilePath)
			.where('pushed_file_path', '=', params.pushedFilePath)
			.orderBy('timestamp', 'desc')
			.limit(1)
			.executeTakeFirst();

		if (!row || row.id == null) return;

		await this.db
			.updateTable('ambient_push_log')
			.set({
				user_action: params.action,
				user_action_ts: params.actionTs,
			})
			.where('id', '=', row.id)
			.execute();
	}

	/**
	 * Get Set of `source::pushed` pairs dismissed in last N days.
	 * Used to suppress re-pushing recently dismissed suggestions.
	 */
	async getDismissedPairs(withinDays: number): Promise<Set<string>> {
		const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
		const rows = await this.db
			.selectFrom('ambient_push_log')
			.select(['source_file_path', 'pushed_file_path'])
			.where('user_action', '=', 'dismissed')
			.where('user_action_ts', '>=', cutoff)
			.execute();

		const pairs = new Set<string>();
		for (const row of rows) {
			pairs.add(`${row.source_file_path}::${row.pushed_file_path}`);
		}
		return pairs;
	}

	/**
	 * Discover recurring (source -> pushed) pairs with positive feedback.
	 * A "recurring pair" is one where the user opened/linked the same
	 * (source, pushed) combination at least `minCount` times within `withinDays`.
	 *
	 * Used by PatternLearner to seed future ambient queries with known-good patterns.
	 *
	 * @returns Array of { sourceFilePath, pushedFilePath, count, avgScore }
	 */
	async getRecurringPairs(
		withinDays: number,
		minCount: number = 2,
	): Promise<Array<{
		sourceFilePath: string;
		pushedFilePath: string;
		count: number;
		avgScore: number;
	}>> {
		const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
		const rows = await this.db
			.selectFrom('ambient_push_log')
			.select(['source_file_path', 'pushed_file_path'])
			.select((eb) => eb.fn.count<number>('id').as('cnt'))
			.select((eb) => eb.fn.avg<number>('pushed_score').as('avg_score'))
			.where('user_action', 'in', ['opened', 'linked'])
			.where('user_action_ts', '>=', cutoff)
			.groupBy(['source_file_path', 'pushed_file_path'])
			.having(sql`COUNT(id)`, '>=', minCount)
			.orderBy('cnt', 'desc')
			.limit(50)
			.execute();

		return rows.map((row) => ({
			sourceFilePath: row.source_file_path,
			pushedFilePath: row.pushed_file_path,
			count: row.cnt,
			avgScore: row.avg_score ?? 0,
		}));
	}
}
