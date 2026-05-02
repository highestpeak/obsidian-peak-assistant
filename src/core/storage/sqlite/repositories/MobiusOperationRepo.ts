import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { SLICE_CAPS } from '@/core/constant';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

/** Known `mobius_operation.operation_type` values (extend when adding typed insert methods). */
export const MobiusOperationType = {
	AI_ANALYSIS: 'ai_analysis',
} as const;

/** Row shape matching the `mobius_operation` table. */
export interface MobiusOperationRow {
	id: string;
	operation_type: string;
	operation_desc: string | null;
	created_at: number;
	related_kind: string | null;
	related_id: string | null;
	important_level: number | null;
	continuous_group_id: string | null;
	meta_json: string | null;
}

/**
 * Append-only log for user/product operations (stored in meta.sqlite).
 * Prefer typed `insert*Operation` methods over raw {@link insertRow}.
 */
export class MobiusOperationRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Log an AI Quick Search analysis run (links to `ai_analysis_record`).
	 */
	async insertAiAnalysisOperation(params: {
		recordId: string;
		createdAtTs: number;
		vaultRelPath: string;
		query?: string | null;
		title?: string | null;
	}): Promise<void> {
		const desc = (params.query ?? params.title ?? '').slice(0, SLICE_CAPS.sqlite.operationDescription) || '(ai analysis)';
		const row: DbSchema['mobius_operation'] = {
			id: generateUuidWithoutHyphens(),
			operation_type: MobiusOperationType.AI_ANALYSIS,
			operation_desc: desc,
			created_at: params.createdAtTs,
			related_kind: 'ai_analysis_record',
			related_id: params.recordId,
			important_level: null,
			continuous_group_id: null,
			meta_json: JSON.stringify({ vault_rel_path: params.vaultRelPath }),
		};
		await this.db.insertInto('mobius_operation').values(row).execute();
	}

	/**
	 * Low-level insert; add a dedicated method when introducing a new operation kind.
	 */
	async insertRow(row: DbSchema['mobius_operation']): Promise<void> {
		await this.db.insertInto('mobius_operation').values(row).execute();
	}

	/**
	 * Return recent operations ordered by `created_at DESC`.
	 *
	 * @param params.limit    Maximum rows to return (clamped 1–500).
	 * @param params.sinceTs  If provided, only rows with `created_at >= sinceTs`.
	 * @param params.types    If provided, only rows whose `operation_type` is in this list.
	 */
	async getRecent(params: {
		limit: number;
		sinceTs?: number;
		types?: string[];
	}): Promise<MobiusOperationRow[]> {
		const safeLimit = Math.max(1, Math.min(500, params.limit));
		let query = this.db
			.selectFrom('mobius_operation')
			.selectAll()
			.orderBy('created_at', 'desc')
			.limit(safeLimit);

		if (params.sinceTs !== undefined) {
			query = query.where('created_at', '>=', params.sinceTs);
		}
		if (params.types && params.types.length > 0) {
			query = query.where('operation_type', 'in', params.types);
		}

		return query.execute() as Promise<MobiusOperationRow[]>;
	}

	/**
	 * Count rows per `operation_type` since `sinceTs` (inclusive).
	 *
	 * @returns A record mapping each operation_type present in the range to its row count.
	 */
	async countByTypeSince(sinceTs: number): Promise<Record<string, number>> {
		const rows = await this.db
			.selectFrom('mobius_operation')
			.select((eb) => [
				'operation_type',
				eb.fn.count<number>('id').as('cnt'),
			])
			.where('created_at', '>=', sinceTs)
			.groupBy('operation_type')
			.execute();

		const result: Record<string, number> = {};
		for (const row of rows) {
			result[row.operation_type] = Number((row as any).cnt);
		}
		return result;
	}
}
