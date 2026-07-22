/**
 * MediaJobRunner — background executor for durable video / music jobs
 * (Task D2 §R1, §R3, §R4-recovery).
 *
 * Ownership: composed at the app layer (main.ts) and injected into
 * MediaGenerationService. NEVER a module singleton. Plugin unload MUST
 * call `dispose()` so all outstanding timers are cleared.
 *
 * Timing invariants:
 *   1. `enqueue` never blocks the caller — it schedules a tick and returns.
 *   2. `resumeUnfinished` reads persisted `providerRequestId`+`providerResponseUrl`
 *      and restarts polling BEFORE `failAllUnfinished` runs at boot, so
 *      resumable jobs survive plugin reload / crash.
 *   3. `cancel` clears the pending timer AND transitions the job to
 *      `cancelled`. Adapter's remote cancel is best-effort — local stop is
 *      the authoritative semantic (documented in AsyncMediaAdapter port).
 *   4. Every poll obeys `pollDeadlineMs` (from config) — a job stuck in
 *      pending past the deadline is marked failed with a retry-friendly
 *      reason so the user can restart via the retry action.
 *
 * Test scheduler contract:
 *   - `scheduler.setTimeout(fn, ms)` MUST behave like the DOM: fire after
 *     >= ms, return a handle, be `clearTimeout`-able. Tests inject a
 *     manual scheduler that queues callbacks and lets the test `tick()`
 *     each pending timer under its own control — the runner never sleeps
 *     synchronously.
 */

import type {
	AsyncMediaAdapter,
	AsyncPollStatus,
} from '@/core/ports/AsyncMediaAdapter';
import type { MediaAttachmentWriter } from '@/core/ports/MediaAttachmentWriter';
import type {
	MediaJob,
	MediaReceiptExtras,
	ResolvedMediaRoute,
} from '@/core/types/media-generation';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { MediaReferenceResolver } from '@/core/ports/MediaReferenceResolver';
import type { MediaGenerationRequest as PortMediaRequest } from '@/core/ports/MediaGenerationPort';
import type { MediaJobService } from './MediaJobService';
import type { MediaGenerationConfig } from './mediaGenerationConfig';
import { resolvePreset } from './mediaGenerationConfig';
import { buildAdapterRequest } from './adapterRequest';
import type { ChatArtifactReceiptSink } from './MediaGenerationService';
import type { MediaUsageEmitter } from './MediaUsageEmitter';
import { buildMediaUsageEvent, safeRecordMediaUsage } from './MediaUsageEmitter';

export interface JobRunnerScheduler {
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** Default scheduler backs onto DOM setTimeout / clearTimeout. */
export const DEFAULT_JOB_RUNNER_SCHEDULER: JobRunnerScheduler = {
	setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown,
	clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Publish job updates so UI can react (uiEventStore, tests, telemetry). */
export type JobUpdatePublisher = (event: {
	jobId: string;
	messageId?: string;
	conversationId?: string;
	state: MediaJob['state'];
	receiptId?: string;
}) => void;

export interface MediaJobRunnerDeps {
	jobService: MediaJobService;
	/** route → async adapter registry. Only `fal` populated today. */
	adapters: Partial<Record<ResolvedMediaRoute, AsyncMediaAdapter>>;
	writer: MediaAttachmentWriter;
	receiptSink: ChatArtifactReceiptSink;
	/**
	 * Zero-gap §4 A1 — reference/mask bytes are re-resolved AT SUBMIT TIME
	 * from stable identifiers, so confirm-after-reboot still works (the
	 * persisted job never carries base64).
	 */
	referenceResolver?: MediaReferenceResolver;
	/** Vault-relative folder for attachments (matches MediaGenerationService). */
	attachmentFolder: string;
	loadConfig: () => Promise<MediaGenerationConfig>;
	scheduler?: JobRunnerScheduler;
	now?: () => number;
	publish?: JobUpdatePublisher;
	/**
	 * V1 §R2 — optional emitter for the async completion path
	 * (video / music). Same contract as
	 * `MediaGenerationServiceDeps.usageEmitter`.
	 */
	usageEmitter?: MediaUsageEmitter;
}

interface JobRunStartTimes {
	/** ms epoch when submit fired (queued → running). */
	runStartedAtMs: number;
}

interface JobTracking {
	timer: unknown | null;
	delayMs: number;
	deadline: number;
	receiptId: string;
	messageId: string;
	conversationId: string;
	projectId?: string;
	/**
	 * V1 §R2 — set at submit/confirm time so completion/failure can report
	 * wall-clock durationMs even when the runner spanned a plugin reload
	 * (resumed jobs start their clock at the moment `resumeUnfinished`
	 * hydrates the anchor; the value is at least the poll duration).
	 */
	runStartedAtMs: number;
}

export class MediaJobRunner {
	private readonly deps: MediaJobRunnerDeps;
	private readonly scheduler: JobRunnerScheduler;
	private readonly now: () => number;
	private readonly tracks = new Map<string, JobTracking>();
	private disposed = false;

	constructor(deps: MediaJobRunnerDeps) {
		this.deps = deps;
		this.scheduler = deps.scheduler ?? DEFAULT_JOB_RUNNER_SCHEDULER;
		this.now = deps.now ?? Date.now;
	}

	dispose(): void {
		this.disposed = true;
		for (const [jobId, track] of this.tracks) {
			if (track.timer !== null) this.scheduler.clearTimeout(track.timer);
			this.tracks.delete(jobId);
		}
	}

	/**
	 * Register a receipt/message anchor for a job that the service just
	 * created. Runner uses this to know where to write updates and to
	 * publish uiEventStore notifications.
	 */
	track(jobId: string, anchor: {
		receiptId: string;
		messageId: string;
		conversationId: string;
		projectId?: string;
	}): void {
		const existing = this.tracks.get(jobId);
		this.tracks.set(jobId, {
			timer: existing?.timer ?? null,
			delayMs: 0,
			deadline: 0,
			receiptId: anchor.receiptId,
			messageId: anchor.messageId,
			conversationId: anchor.conversationId,
			projectId: anchor.projectId,
			runStartedAtMs: existing?.runStartedAtMs ?? this.now(),
		});
	}

	/**
	 * Start the async pipeline for a job (submit → poll). Non-blocking —
	 * returns as soon as the first submit finishes; poll loop drives itself
	 * via the scheduler.
	 */
	async start(jobId: string): Promise<void> {
		if (this.disposed) return;
		const job = await this.deps.jobService.getJob(jobId);
		if (!job) throw new Error(`MediaJobRunner.start: unknown jobId ${jobId}`);
		if (job.state !== 'queued' && job.state !== 'running') {
			// Already terminal or awaiting-confirmation — nothing to do.
			return;
		}
		const adapter = this.pickAdapter(job);
		if (!adapter) {
			await this.markFailed(job.jobId, `no async adapter for route ${job.preflight.executionRoute}`);
			return;
		}
		const config = await this.deps.loadConfig();
		let running = job;
		if (job.state === 'queued') {
			// Kick submit — advance to running BEFORE the network call so
			// concurrent restarts don't fire submit twice against a job that
			// already has providerRequestId (defensive: this.start is not
			// called from more than one path but restarts can race).
			try {
				const submit = await adapter.submit(await this.buildPortRequest(job, config, true));
				running = await this.deps.jobService.transition(job.jobId, 'running', {
					providerRequestId: submit.providerRequestId,
					providerResponseUrl: submit.providerResponseUrl,
				});
			} catch (err) {
				await this.markFailed(job.jobId, (err as Error).message);
				return;
			}
		}
		this.publish(running, 'running-started');
		this.schedulePoll(running, config);
	}

	/**
	 * Cancel a job. Legal from queued / awaiting-confirmation / running.
	 * Local stop is authoritative — adapter.cancel() is a best-effort ping.
	 */
	async cancel(jobId: string, reason = 'user-cancelled'): Promise<void> {
		const track = this.tracks.get(jobId);
		if (track?.timer !== null && track?.timer !== undefined) {
			this.scheduler.clearTimeout(track.timer);
			track.timer = null;
		}
		const job = await this.deps.jobService.getJob(jobId);
		if (!job) return;
		if (
			job.state !== 'queued'
			&& job.state !== 'awaiting-confirmation'
			&& job.state !== 'running'
		) return; // terminal — nothing to cancel
		const adapter = this.pickAdapter(job);
		if (adapter && adapter.cancel && job.providerRequestId && job.providerResponseUrl) {
			try {
				await adapter.cancel(job.providerRequestId, job.providerResponseUrl);
			} catch {
				// best-effort — local stop is what matters
			}
		}
		const updated = await this.deps.jobService.transition(jobId, 'cancelled', { error: reason });
		await this.updateReceiptToCancelled(updated, reason);
		this.tracks.delete(jobId);
		this.publish(updated, 'cancelled');
	}

	/**
	 * Confirm an awaiting-confirmation job. Submits to the adapter and
	 * transitions awaiting → running with providerRequestId/URL in one
	 * atomic state change so the runner never leaves the job in `running`
	 * without a resumable cursor. Anchor from the persisted receipt/job so
	 * confirm-after-reload still works (track() may not have been called
	 * yet if the receipt was created in a previous session — the caller
	 * MUST re-track before confirming; see MediaGenerationService.confirmJob).
	 */
	async confirm(jobId: string): Promise<void> {
		const job = await this.deps.jobService.getJob(jobId);
		if (!job) throw new Error(`MediaJobRunner.confirm: unknown jobId ${jobId}`);
		if (job.state !== 'awaiting-confirmation') {
			throw new Error(
				`MediaJobRunner.confirm: job ${jobId} is in state ${job.state}, cannot confirm`,
			);
		}
		const adapter = this.pickAdapter(job);
		if (!adapter) {
			await this.markFailed(jobId, `no async adapter for route ${job.preflight.executionRoute}`);
			return;
		}
		let running: MediaJob;
		const config0 = await this.deps.loadConfig();
		try {
			const submit = await adapter.submit(await this.buildPortRequest(job, config0, true));
			// awaiting-confirmation → running is legal; the transition patch
			// carries the resumable cursor so a crash mid-poll can restart.
			running = await this.deps.jobService.transition(jobId, 'running', {
				providerRequestId: submit.providerRequestId,
				providerResponseUrl: submit.providerResponseUrl,
			});
		} catch (err) {
			await this.markFailed(jobId, (err as Error).message);
			return;
		}
		this.publish(running, 'confirmed');
		const config = await this.deps.loadConfig();
		this.schedulePoll(running, config);
	}

	/**
	 * Boot-time recovery. For each non-terminal persisted job:
	 *   - `awaiting-confirmation` → leave alone (needs user click).
	 *   - `running` with providerResponseUrl → restart poll loop.
	 *   - `running` without providerResponseUrl (crashed before submit
	 *     completed) → mark failed with retry-friendly reason.
	 *   - `queued` (crashed between createJob and submit) → mark failed
	 *     with retry-friendly reason.
	 * Returns the number of jobs that (a) resumed polling, (b) needed to
	 * be failed. Callers can log both for diagnostics.
	 */
	async resumeUnfinished(): Promise<{ resumed: number; failed: number; awaiting: number }> {
		const jobs = await this.deps.jobService.listUnfinished();
		let resumed = 0;
		let failed = 0;
		let awaiting = 0;
		for (const job of jobs) {
			if (job.state === 'awaiting-confirmation') {
				awaiting += 1;
				this.rehydrateAnchor(job);
				this.publish(job, 'resume-awaiting');
				continue;
			}
			if (job.state === 'running' && job.providerRequestId && job.providerResponseUrl) {
				try {
					const config = await this.deps.loadConfig();
					this.rehydrateAnchor(job);
					this.schedulePoll(job, config);
					this.publish(job, 'resume-running');
					resumed += 1;
				} catch (err) {
					await this.markFailed(
						job.jobId,
						`resume failed: ${(err as Error).message} (retriable)`,
					);
					failed += 1;
				}
				continue;
			}
			// queued without submit OR running without provider cursor —
			// cannot resume, mark failed with retry-friendly reason.
			await this.markFailed(job.jobId, `unresumable ${job.state}: no provider cursor (retriable)`);
			failed += 1;
		}
		return { resumed, failed, awaiting };
	}

	/**
	 * Test hook: fire the pending timer for `jobId` immediately. Only
	 * meaningful under a manual scheduler; the DOM scheduler discards the
	 * ms argument so nothing else changes.
	 */
	hasPendingTick(jobId: string): boolean {
		return this.tracks.get(jobId)?.timer != null;
	}

	// ─── internal helpers ────────────────────────────────────────────────

	private pickAdapter(job: MediaJob): AsyncMediaAdapter | null {
		const route = job.preflight.executionRoute;
		if (!route) return null;
		return this.deps.adapters[route] ?? null;
	}

	/**
	 * Domain job.request → port request (modelId resolved from preflight /
	 * preset, references materialised when `resolveRefs`). Fixes the latent
	 * bug where `adapter.submit(job.request)` passed a request without
	 * `modelId` — every real submit would have thrown.
	 */
	private async buildPortRequest(
		job: MediaJob,
		config: MediaGenerationConfig,
		resolveRefs: boolean,
	): Promise<PortMediaRequest> {
		const preset = resolvePreset(config, job.request.kind, job.request.presetId, job.request.operation);
		if (!preset) {
			throw new Error(`MediaJobRunner: no preset for ${job.request.kind}/${job.request.presetId}`);
		}
		return buildAdapterRequest({
			request: job.request,
			preflight: job.preflight,
			preset,
			config,
			referenceResolver: this.deps.referenceResolver,
			resolveReferences: resolveRefs,
		});
	}

	private schedulePoll(job: MediaJob, config: MediaGenerationConfig): void {
		if (this.disposed) return;
		const track = this.tracks.get(job.jobId) ?? {
			timer: null,
			delayMs: 0,
			deadline: 0,
			receiptId: '',
			messageId: '',
			conversationId: '',
			projectId: undefined,
			runStartedAtMs: this.now(),
		};
		// Establish deadline on first schedule; reuse across ticks.
		if (track.deadline === 0) {
			track.deadline = this.now() + config.pollDeadlineMs;
			track.delayMs = config.pollIntervalMs;
		}
		this.tracks.set(job.jobId, track);
		track.timer = this.scheduler.setTimeout(() => {
			void this.pollOnce(job.jobId, config);
		}, track.delayMs);
	}

	private async pollOnce(jobId: string, config: MediaGenerationConfig): Promise<void> {
		if (this.disposed) return;
		const track = this.tracks.get(jobId);
		if (!track) return;
		track.timer = null;
		const job = await this.deps.jobService.getJob(jobId);
		if (!job) return;
		if (job.state !== 'running') {
			// Cancelled / failed via another path — stop polling.
			return;
		}
		const adapter = this.pickAdapter(job);
		if (!adapter || !job.providerResponseUrl) {
			await this.markFailed(jobId, 'poll aborted: no adapter or response URL');
			return;
		}
		if (this.now() >= track.deadline) {
			await this.markFailed(
				jobId,
				`poll deadline exceeded (${config.pollDeadlineMs}ms) — retriable`,
			);
			return;
		}
		let status: AsyncPollStatus;
		try {
			status = await adapter.poll(job.providerResponseUrl);
		} catch (err) {
			await this.markFailed(jobId, `poll error: ${(err as Error).message}`);
			return;
		}
		if (status.kind === 'failed') {
			await this.markFailed(jobId, status.reason);
			return;
		}
		if (status.kind === 'pending') {
			// Backoff for next tick.
			track.delayMs = Math.min(
				Math.floor(track.delayMs * config.pollBackoffMultiplier),
				config.pollMaxIntervalMs,
			);
			this.schedulePoll(job, config);
			return;
		}
		// ready → download + write attachment + update receipt + complete
		try {
			const result = await adapter.download(
				await this.buildPortRequest(job, config, false),
				status.final,
			);
			const nowMs = this.now();
			const basename = sanitizeBasename(
				`${job.request.sourceHint ?? job.request.kind}-${new Date(nowMs).toISOString().replace(/[:.]/g, '-')}`,
			);
			const { path } = await this.deps.writer.writeAttachment({
				attachmentFolder: this.deps.attachmentFolder,
				basename,
				extension: result.extension,
				bytes: result.bytes,
			});
			await this.updateReceiptToSaved(job, track, {
				vaultPath: path,
				mimeType: result.mimeType,
				modelId: result.modelId,
			});
			const completed = await this.deps.jobService.transition(job.jobId, 'completed', {
				appendReceiptId: track.receiptId,
			});
			// V1 §R2 — record success telemetry BEFORE deleting tracking so
			// durationMs stays available. Preset lookup goes through the
			// same loadConfig() the runner already ran for poll timings.
			await this.recordUsage(job, track, 'success', undefined);
			this.tracks.delete(jobId);
			this.publish(completed, 'completed');
		} catch (err) {
			await this.markFailed(jobId, (err as Error).message);
		}
	}

	private async markFailed(jobId: string, reason: string): Promise<void> {
		const track = this.tracks.get(jobId);
		if (track?.timer !== null && track?.timer !== undefined) {
			this.scheduler.clearTimeout(track.timer);
			track.timer = null;
		}
		let failed: MediaJob;
		try {
			failed = await this.deps.jobService.transition(jobId, 'failed', { error: reason });
		} catch {
			return; // already terminal — nothing to publish
		}
		await this.updateReceiptToFailed(failed, reason);
		// V1 §R2 — record failure telemetry. Uses track.runStartedAtMs so
		// the row surfaces at least the wall-clock span from submit/resume.
		if (track) await this.recordUsage(failed, track, 'failure', reason);
		this.tracks.delete(jobId);
		this.publish(failed, 'failed');
	}

	/**
	 * V1 §R2 — shared usage emission for async completion / failure.
	 * Resolves the preset for `estimatedCostUsd`/`billingUnit`/`confidence`
	 * from the merged config so the row matches the confirm-gate estimate.
	 * Never throws — all failures land in `safeRecordMediaUsage`.
	 */
	private async recordUsage(
		job: MediaJob,
		track: JobTracking,
		outcome: 'success' | 'failure',
		errorMessage: string | undefined,
	): Promise<void> {
		if (!this.deps.usageEmitter) return;
		let preset: ReturnType<typeof resolvePreset> = null;
		try {
			const cfg = await this.deps.loadConfig();
			preset = resolvePreset(cfg, job.request.kind, job.request.presetId);
		} catch {
			preset = null;
		}
		safeRecordMediaUsage(this.deps.usageEmitter, buildMediaUsageEvent({
			outcome,
			kind: job.request.kind,
			route: job.preflight.executionRoute!,
			provider: job.preflight.provider ?? 'fal',
			modelId: job.preflight.modelId ?? job.request.requestedModelId ?? '',
			jobId: job.jobId,
			sessionId: track.conversationId || job.conversationId || job.runId,
			runId: job.runId,
			preset: {
				estimatedCostUsd: preset?.estimatedCostUsd,
				costConfidence: preset?.costConfidence ?? 'estimated',
				billingUnit: preset?.billingUnit ?? job.request.kind,
			},
			durationMs: Math.max(0, this.now() - track.runStartedAtMs),
			request: {
				presetId: job.request.presetId,
				durationSeconds: job.request.durationSeconds,
				quantity: job.request.quantity,
				aspectRatio: job.request.aspectRatio,
			},
			errorMessage,
		}));
	}

	private async updateReceiptToSaved(
		job: MediaJob,
		track: JobTracking,
		attachment: { vaultPath: string; mimeType: string; modelId?: string },
	): Promise<void> {
		if (!track.receiptId) return;
		const kindLabel = job.request.kind === 'video' ? 'video' : 'audio';
		const now = this.now();
		const extras: MediaReceiptExtras = {
			executionRoute: job.preflight.executionRoute!,
			provider: job.preflight.provider ?? 'fal',
			modelId: attachment.modelId ?? job.preflight.modelId ?? job.request.requestedModelId ?? '',
			jobId: job.jobId,
			cost: job.preflight.estimate,
			mediaKind: job.request.kind,
			presetId: job.request.presetId,
			// D2 I2 parity: keep the pre-confirm cost fields on the saved
			// receipt so the Resources tab / any post-hoc review still shows
			// how much was authorised.
			durationSeconds: job.request.durationSeconds,
			quantity: job.request.quantity,
		};
		const receipt: ChatArtifactReceipt & { media: MediaReceiptExtras } = {
			artifactId: track.receiptId,
			runId: job.runId,
			messageId: track.messageId,
			conversationId: track.conversationId,
			projectId: track.projectId,
			direction: 'generated',
			kind: kindLabel,
			title: job.request.sourceHint ?? `${job.request.kind}-${new Date(now).toISOString().slice(0, 10)}`,
			contentType: attachment.mimeType,
			preview: { kind: 'none' },
			vaultPath: attachment.vaultPath,
			state: 'saved',
			availableActions: ['preview', 'open', 'download'],
			createdAt: now,
			media: extras,
		};
		await this.deps.receiptSink.save(receipt);
	}

	private async updateReceiptToCancelled(job: MediaJob, reason: string): Promise<void> {
		const track = this.tracks.get(job.jobId);
		if (!track?.receiptId) return;
		const kindLabel = job.request.kind === 'video' ? 'video' : 'audio';
		const receipt: ChatArtifactReceipt = {
			artifactId: track.receiptId,
			runId: job.runId,
			messageId: track.messageId,
			conversationId: track.conversationId || (job.conversationId ?? ''),
			projectId: track.projectId,
			direction: 'generated',
			kind: kindLabel,
			title: job.request.sourceHint ?? `${job.request.kind} — cancelled`,
			preview: { kind: 'none' },
			state: 'cancelled',
			availableActions: ['retry'],
			createdAt: this.now(),
			error: { code: 'media-job-cancelled', message: reason, recoverable: true },
		};
		await this.deps.receiptSink.save(receipt);
	}

	private async updateReceiptToFailed(job: MediaJob, reason: string): Promise<void> {
		const track = this.tracks.get(job.jobId);
		if (!track?.receiptId) return;
		const kindLabel = job.request.kind === 'video' ? 'video' : 'audio';
		const receipt: ChatArtifactReceipt = {
			artifactId: track.receiptId,
			runId: job.runId,
			messageId: track.messageId,
			conversationId: track.conversationId || (job.conversationId ?? ''),
			projectId: track.projectId,
			direction: 'generated',
			kind: kindLabel,
			title: job.request.sourceHint ?? `${job.request.kind} — failed`,
			preview: { kind: 'none' },
			state: 'failed',
			availableActions: ['retry'],
			createdAt: this.now(),
			error: { code: 'media-job-failed', message: reason, recoverable: true },
		};
		await this.deps.receiptSink.save(receipt);
	}

	private rehydrateAnchor(job: MediaJob): void {
		if (this.tracks.has(job.jobId)) return;
		// receiptId comes from the persisted job.receiptIds (last known).
		const receiptId = job.receiptIds[job.receiptIds.length - 1] ?? '';
		this.tracks.set(job.jobId, {
			timer: null,
			delayMs: 0,
			deadline: 0,
			receiptId,
			messageId: '', // unknown until UI reloads — updates still persist via receiptId
			conversationId: job.conversationId ?? '',
			projectId: undefined,
			// Rehydrated jobs cannot know the original submit time — use
			// resume moment; the reported durationMs is at least the
			// post-resume poll wall-clock, honest given the reboot boundary.
			runStartedAtMs: this.now(),
		});
	}

	private publish(job: MediaJob, _reason: string): void {
		const track = this.tracks.get(job.jobId);
		this.deps.publish?.({
			jobId: job.jobId,
			messageId: track?.messageId || undefined,
			conversationId: track?.conversationId || job.conversationId,
			state: job.state,
			receiptId: track?.receiptId || job.receiptIds[job.receiptIds.length - 1],
		});
	}
}

function sanitizeBasename(raw: string): string {
	const trimmed = raw
		.replace(/[^\w一-鿿\- ]+/g, '')
		.trim()
		.replace(/\s+/g, '-');
	return trimmed.length > 0 ? trimmed.slice(0, 60) : 'media';
}
