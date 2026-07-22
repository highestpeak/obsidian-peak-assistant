/**
 * MediaJobService — enforces the media job state machine and persists every
 * transition via `ChatMediaJobRepo`. The state machine is deliberately
 * strict: any transition not listed in `MEDIA_JOB_LEGAL_TRANSITIONS`
 * throws, which fails loud during development instead of leaving zombie
 * `running` jobs in the database.
 *
 * Spec: docs/superpowers/plans/2026-07-20-...task-c1 §R4.
 *
 * Runtime ownership: composed at the app layer (main.ts), not a module
 * singleton. Consumers (MediaGenerationService, boot-time resume logic)
 * receive the instance via constructor injection.
 */

import type { ChatMediaJobRepo } from '@/core/storage/sqlite/repositories/ChatMediaJobRepo';
import type {
	MediaGenerationRequest,
	MediaJob,
	MediaJobState,
	MediaPreflight,
} from '@/core/types/media-generation';
import { isMediaJobTransitionLegal } from '@/core/types/media-generation';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

export interface CreateMediaJobInput {
	runId: string;
	request: MediaGenerationRequest;
	preflight: MediaPreflight;
	initialState?: 'queued' | 'awaiting-confirmation';
	conversationId?: string;
}

export interface UpdateMediaJobPatch {
	providerRequestId?: string;
	providerResponseUrl?: string;
	appendReceiptId?: string;
	error?: string;
}

export class MediaJobService {
	constructor(
		private readonly repo: ChatMediaJobRepo,
		private readonly now: () => number = Date.now,
	) {}

	async createJob(input: CreateMediaJobInput): Promise<MediaJob> {
		const ts = this.now();
		const job: MediaJob = {
			jobId: `mj-${generateUuidWithoutHyphens()}`,
			runId: input.runId,
			state: input.initialState ?? 'queued',
			request: input.request,
			preflight: input.preflight,
			receiptIds: [],
			createdAt: ts,
			updatedAt: ts,
			conversationId: input.conversationId,
		};
		await this.repo.upsert(job);
		return job;
	}

	async getJob(jobId: string): Promise<MediaJob | null> {
		return this.repo.getById(jobId);
	}

	async listUnfinished(): Promise<MediaJob[]> {
		return this.repo.listUnfinished();
	}

	/**
	 * Transition a job. Throws when the transition is illegal per
	 * `MEDIA_JOB_LEGAL_TRANSITIONS` — callers should catch and surface
	 * (a state-machine bug is worse than a UI notice).
	 */
	async transition(
		jobId: string,
		nextState: MediaJobState,
		patch?: UpdateMediaJobPatch,
	): Promise<MediaJob> {
		const job = await this.repo.getById(jobId);
		if (!job) throw new Error(`MediaJobService.transition: unknown jobId ${jobId}`);
		if (!isMediaJobTransitionLegal(job.state, nextState)) {
			throw new Error(
				`MediaJobService: illegal transition ${job.state} → ${nextState} for job ${jobId}`,
			);
		}
		// Dedup: startAsyncJob already calls attachReceiptId immediately after
		// persisting the awaiting-confirmation receipt (C1 fix), so the
		// runner's completion transition would otherwise double-append.
		const receiptIds = patch?.appendReceiptId && !job.receiptIds.includes(patch.appendReceiptId)
			? [...job.receiptIds, patch.appendReceiptId]
			: job.receiptIds;
		const updated: MediaJob = {
			...job,
			state: nextState,
			receiptIds,
			providerRequestId: patch?.providerRequestId ?? job.providerRequestId,
			providerResponseUrl: patch?.providerResponseUrl ?? job.providerResponseUrl,
			error: patch?.error ?? job.error,
			updatedAt: this.now(),
		};
		await this.repo.upsert(updated);
		return updated;
	}

	/**
	 * Append a receipt id to `job.receiptIds` WITHOUT changing job state.
	 * Used by `MediaGenerationService.startAsyncJob` right after the
	 * awaiting-confirmation receipt is persisted so a boot recovery that
	 * later confirms the job can find the receipt via `job.receiptIds`
	 * (rehydrateAnchor in MediaJobRunner). This closes the C1 gap where a
	 * crash between `receiptSink.save(receipt)` and the runner's own
	 * `appendReceiptId` on completion would leave `job.receiptIds === []`
	 * — the runner's `updateReceiptToSaved()` guards `!track.receiptId`
	 * and would silently return, stranding the receipt at
	 * `awaiting-confirmation` while the DB job already reached `completed`.
	 * Idempotent: appending an id already in the array is a no-op.
	 */
	async attachReceiptId(jobId: string, receiptId: string): Promise<MediaJob> {
		const job = await this.repo.getById(jobId);
		if (!job) throw new Error(`MediaJobService.attachReceiptId: unknown jobId ${jobId}`);
		if (job.receiptIds.includes(receiptId)) return job;
		const updated: MediaJob = {
			...job,
			receiptIds: [...job.receiptIds, receiptId],
			updatedAt: this.now(),
		};
		await this.repo.upsert(updated);
		return updated;
	}

	/**
	 * Boot-time recovery: mark every non-terminal job as `failed` with a
	 * re-triable error. Called by `MediaGenerationService.recoverOnBoot`
	 * when the underlying adapter cannot truly resume (no provider poll
	 * cursor). Prevents zombie `running` jobs after a crash.
	 */
	async failAllUnfinished(reason: string): Promise<number> {
		const jobs = await this.listUnfinished();
		let count = 0;
		for (const job of jobs) {
			// Legal path from any non-terminal state to failed.
			await this.transition(job.jobId, 'failed', { error: reason });
			count += 1;
		}
		return count;
	}
}
