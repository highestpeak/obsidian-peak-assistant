import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { TriggerType, UserAction } from '@/service/ambient/types';

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
	 * Get (source, pushed) pairs with positive feedback (opened/linked) in last N days.
	 * Returns a Map of `source::pushed` → action count for score boosting.
	 */
	async getPositivePairs(withinDays: number): Promise<Map<string, number>> {
		const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
		const rows = await this.db
			.selectFrom('ambient_push_log')
			.select(['source_file_path', 'pushed_file_path'])
			.select((eb) => eb.fn.count<number>('id').as('cnt'))
			.where('user_action', 'in', ['opened', 'linked'])
			.where('user_action_ts', '>=', cutoff)
			.groupBy(['source_file_path', 'pushed_file_path'])
			.execute();

		const result = new Map<string, number>();
		for (const row of rows) {
			result.set(`${row.source_file_path}::${row.pushed_file_path}`, row.cnt);
		}
		return result;
	}

	/**
	 * Get (source, pushed) pairs that were ignored (no user action) in last N days.
	 * Returns a Map of `source::pushed` → ignore count for score penalty.
	 */
	async getIgnoredPenalties(withinDays: number): Promise<Map<string, number>> {
		const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
		const rows = await this.db
			.selectFrom('ambient_push_log')
			.select(['source_file_path', 'pushed_file_path'])
			.select((eb) => eb.fn.count<number>('id').as('cnt'))
			.where('user_action', 'is', null)
			.where('timestamp', '>=', cutoff)
			// Only count pushes old enough that the user had time to act (>5 min ago)
			.where('timestamp', '<=', Date.now() - 5 * 60 * 1000)
			.groupBy(['source_file_path', 'pushed_file_path'])
			.execute();

		const result = new Map<string, number>();
		for (const row of rows) {
			result.set(`${row.source_file_path}::${row.pushed_file_path}`, row.cnt);
		}
		return result;
	}
}
