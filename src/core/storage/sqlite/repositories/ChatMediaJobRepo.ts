import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type {
	MediaJob,
	MediaJobState,
} from '@/core/types/media-generation';

/**
 * Repository for `chat_media_job` — durable media generation jobs.
 *
 * Task: docs/superpowers/plans/2026-07-20-...task-c1 §R4.
 *
 * The service layer (`MediaJobService`) is the only writer; it enforces
 * the state machine and calls `upsert` on every transition so a plugin
 * restart can list non-terminal jobs and either resume the fal poll or
 * mark them `failed` with a re-triable error.
 */
export class ChatMediaJobRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	async upsert(job: MediaJob): Promise<void> {
		const row: DbSchema['chat_media_job'] = {
			job_id: job.jobId,
			run_id: job.runId,
			kind: job.request.kind,
			state: job.state,
			request_json: JSON.stringify(job.request),
			preflight_json: JSON.stringify(job.preflight),
			receipt_ids_json: JSON.stringify(job.receiptIds ?? []),
			provider_request_id: job.providerRequestId ?? null,
			provider_response_url: job.providerResponseUrl ?? null,
			error_message: job.error ?? null,
			conversation_id: job.conversationId ?? null,
			created_at_ts: job.createdAt,
			updated_at_ts: job.updatedAt,
		};
		const exists = await this.db
			.selectFrom('chat_media_job')
			.select('job_id')
			.where('job_id', '=', job.jobId)
			.executeTakeFirst();
		if (exists) {
			await this.db
				.updateTable('chat_media_job')
				.set({
					run_id: row.run_id,
					kind: row.kind,
					state: row.state,
					request_json: row.request_json,
					preflight_json: row.preflight_json,
					receipt_ids_json: row.receipt_ids_json,
					provider_request_id: row.provider_request_id,
					provider_response_url: row.provider_response_url,
					error_message: row.error_message,
					conversation_id: row.conversation_id,
					updated_at_ts: row.updated_at_ts,
				})
				.where('job_id', '=', job.jobId)
				.execute();
			return;
		}
		await this.db.insertInto('chat_media_job').values(row).execute();
	}

	async getById(jobId: string): Promise<MediaJob | null> {
		const row = await this.db
			.selectFrom('chat_media_job')
			.selectAll()
			.where('job_id', '=', jobId)
			.executeTakeFirst();
		return row ? rowToJob(row) : null;
	}

	async listByState(state: MediaJobState): Promise<MediaJob[]> {
		const rows = await this.db
			.selectFrom('chat_media_job')
			.selectAll()
			.where('state', '=', state)
			.orderBy('updated_at_ts', 'asc')
			.execute();
		return rows.map(rowToJob);
	}

	/** Non-terminal jobs: used at boot to resume / re-query / mark failed. */
	async listUnfinished(): Promise<MediaJob[]> {
		const rows = await this.db
			.selectFrom('chat_media_job')
			.selectAll()
			.where('state', 'in', ['queued', 'awaiting-confirmation', 'running'])
			.orderBy('updated_at_ts', 'asc')
			.execute();
		return rows.map(rowToJob);
	}
}

function rowToJob(row: DbSchema['chat_media_job']): MediaJob {
	return {
		jobId: row.job_id,
		runId: row.run_id,
		state: row.state as MediaJobState,
		request: JSON.parse(row.request_json),
		preflight: JSON.parse(row.preflight_json),
		receiptIds: JSON.parse(row.receipt_ids_json ?? '[]'),
		providerRequestId: row.provider_request_id ?? undefined,
		providerResponseUrl: row.provider_response_url ?? undefined,
		error: row.error_message ?? undefined,
		conversationId: row.conversation_id ?? undefined,
		createdAt: row.created_at_ts,
		updatedAt: row.updated_at_ts,
	};
}
