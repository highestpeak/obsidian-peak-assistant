import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { SLICE_CAPS } from '@/core/constant';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

/** Known `mobius_operation.operation_type` values (extend when adding typed insert methods). */
export const MobiusOperationType = {
	AI_ANALYSIS: 'ai_analysis',
} as const;

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
}
