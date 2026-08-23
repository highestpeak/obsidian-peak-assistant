/**
 * MediaGenerationService — the single entry point for media generation.
 *
 * Pipeline:  request → preflight → (confirm gate) → job created →
 *            adapter.generate → writer.writeAttachment → ChatArtifactReceipt.
 *
 * Spec: docs/superpowers/plans/2026-07-20-...task-c1 §R5.
 *
 * Design rules preserved from the task brief:
 *   - Single media writer: reuses `MediaAttachmentWriter` (the existing
 *     ObsidianMediaAttachmentWriter). We do NOT build a second writer.
 *   - Every successful output gets a real `ChatArtifactReceipt` persisted
 *     through the existing ChatArtifactReceipt repo.
 *   - Receipt records `executionRoute` + concrete provider/model/jobId +
 *     estimated cost (never impersonates "native provider" for fal jobs).
 *   - TTS is `kind='audio'`, music is `kind='audio'` too but preset ids
 *     differ; the media-specific route/provider/model live in
 *     `MediaReceiptExtras`.
 *   - Video / music require preflight `needs-confirmation` to be resolved
 *     via `confirmAndRun`; the service does not silently accept them.
 */

import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type {
	MediaGenerationRequest,
	MediaKind,
	MediaPreflight,
	MediaJob,
	MediaReceiptExtras,
	ResolvedMediaRoute,
} from '@/core/types/media-generation';
import type { NativeMediaAvailabilitySnapshot, FalMediaAvailabilitySnapshot } from '@/service/media/preflight';
import type {
	MediaGenerationPort,
	MediaGenerationResult,
} from '@/core/ports/MediaGenerationPort';
import type { MediaReferenceResolver } from '@/core/ports/MediaReferenceResolver';
import type { MediaAttachmentWriter } from '@/core/ports/MediaAttachmentWriter';
import { buildAdapterRequest } from '@/service/media/adapterRequest';
import type { MediaJobService } from '@/service/media/MediaJobService';
import type { MediaGenerationConfig } from '@/service/media/mediaGenerationConfig';
import { resolvePreset, MEDIA_KIND_DEFAULT_MAX_DURATION_SECONDS } from '@/service/media/mediaGenerationConfig';
import { preflightMediaRequest, type MediaRouteAvailability, type NativeMediaAvailabilityProbe, NO_NATIVE_ADAPTER_YET } from '@/service/media/preflight';
import type { MediaJobRunner } from '@/service/media/MediaJobRunner';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { MediaUsageEmitter } from './MediaUsageEmitter';
import { buildMediaUsageEvent, safeRecordMediaUsage } from './MediaUsageEmitter';
import type { DebugTracePort } from '@/core/debug-trace';
import { safeSerialize } from '@/core/providers/vercel/debug-language-model-middleware';

/**
 * Injected persister for artifact receipts. We take a narrow port here
 * so unit tests can pass an in-memory sink without spinning up sqlite.
 * Production wiring uses `ChatArtifactReceiptRepo.upsert`.
 */
export interface ChatArtifactReceiptSink {
	save(receipt: ChatArtifactReceipt): Promise<void>;
}

export interface MediaGenerationServiceDeps {
	/**
	 * Route → adapter registry. `fal` is required (today's baseline);
	 * `native` becomes non-null once C2 wires the OpenAI image adapter.
	 * The registry pattern replaces the C1-era `falAdapter` +
	 * `nativeAdapter?` pair so a route added later (e.g. `elevenlabs` for
	 * TTS) only touches this map + preflight, not the service pipeline.
	 */
	adapters: Partial<Record<ResolvedMediaRoute, MediaGenerationPort>>;
	nativeAvailability?: NativeMediaAvailabilityProbe;
	/**
	 * Zero-gap §4 A1 — materialises reference/mask inputs at execution time.
	 * Absent = edit requests with references fail loudly (never guessed).
	 */
	referenceResolver?: MediaReferenceResolver;
	writer: MediaAttachmentWriter;
	jobService: MediaJobService;
	receiptSink: ChatArtifactReceiptSink;
	/** Resolves the current media config (per-call so template edits apply). */
	loadConfig: () => Promise<MediaGenerationConfig>;
	/** Vault-relative folder for attachments. Overrides preset default. */
	attachmentFolder: string;
	/** For time-stamped basenames + receipt timestamps. */
	now?: () => number;
	/**
	 * V1 §R2 — optional usage telemetry emitter. Wired at the app layer
	 * to dispatch `UsageRecordedViewEvent`; when absent (or when it
	 * throws), the pipeline continues normally so a telemetry outage
	 * cannot fail a generation run.
	 */
	usageEmitter?: MediaUsageEmitter;
	debugTrace?: DebugTracePort | null;
}

export interface ProduceMediaInput {
	request: MediaGenerationRequest;
	/** Chat runId when called from a Chat turn; command entry-points can pass
	 * a stable synthetic id (e.g. `cmd-tts-<timestamp>`) so receipts still
	 * have a non-empty `runId` field. */
	runId: string;
	/** Optional chat associations. Command entry-points leave these blank. */
	conversationId?: string;
	messageId?: string;
	projectId?: string;
}

export interface ProduceMediaOutcome {
	job: MediaJob;
	preflight: MediaPreflight;
	receipts: ChatArtifactReceipt[];
	writtenPaths: string[];
}

const CHAT_ARTIFACT_KIND_BY_MEDIA_KIND = {
	image: 'image',
	video: 'video',
	music: 'audio',
	tts: 'audio',
} as const;

/** Kinds surfaced through the Chat `media_generate` tool (TTS stays a command). */
export type MediaGenerationSyncKind = 'image' | 'video' | 'music';

export interface MediaKindSyncSnapshot {
	/** True when at least one route (native or fal) can execute this kind today. */
	anyRouteReady: boolean;
	routes: {
		native: NativeMediaAvailabilitySnapshot;
		fal: FalMediaAvailabilitySnapshot;
	};
}

export interface MediaGenerationSyncSnapshot {
	perKind: Record<MediaGenerationSyncKind, MediaKindSyncSnapshot>;
}

export interface StartAsyncJobInput {
	request: MediaGenerationRequest;
	runId: string;
	conversationId?: string;
	messageId?: string;
	projectId?: string;
}

export interface StartAsyncJobOutcome {
	jobId: string;
	receiptId: string;
	preflight: MediaPreflight;
	/** True when the job is waiting for the user to confirm the cost. */
	requiresConfirmation: boolean;
}

export class MediaGenerationService {
	constructor(private readonly deps: MediaGenerationServiceDeps) {}

	private jobRunner: MediaJobRunner | null = null;

	/** D2 §R1: bind the app-owned job runner. Passing null clears (hot reload). */
	setJobRunner(runner: MediaJobRunner | null): void {
		this.jobRunner = runner;
	}

	getJobRunner(): MediaJobRunner | null {
		return this.jobRunner;
	}

	/**
	 * D1 §R3: direct write to the same ChatArtifactReceipt sink the
	 * `produce()` pipeline uses. Callers (specifically the media_generate
	 * ToolDef) use this to persist FAILED receipts — the pipeline itself
	 * only writes on success, but the UI needs a real record for failed
	 * runs so the failed card + retry action render in the message
	 * thread.
	 */
	async saveReceiptDirect(receipt: ChatArtifactReceipt): Promise<void> {
		await this.deps.receiptSink.save(receipt);
	}

	/**
	 * D1 §R5: expose the underlying MediaJobService so the app-layer boot
	 * hook can call `failAllUnfinished()` after sqlite init. Kept narrow
	 * to job-recovery use; general job control still goes through the
	 * service pipeline.
	 */
	getJobService(): MediaJobService {
		return this.deps.jobService;
	}

	/**
	 * Preflight only. Pure enough to call from UI at any time (no I/O
	 * beyond config load). Callers use the verdict to decide whether to
	 * pop a configure notice, a cost-confirm dialog, or proceed straight
	 * to `produce`.
	 */
	async preflight(request: MediaGenerationRequest): Promise<MediaPreflight> {
		const config = await this.deps.loadConfig();
		return preflightMediaRequest(request, config, this.snapshotAvailability(request));
	}

	/**
	 * The full pipeline. For `needs-confirmation` requests, callers must
	 * either resolve confirmation via UI and then invoke `produce` again
	 * (with a request that already resolved the confirmation intent), or
	 * pass `bypassConfirmation:true` to explicitly accept. Command entry
	 * points that already showed a Notice pass `bypassConfirmation:true`.
	 */
	async produce(
		input: ProduceMediaInput,
		options?: { bypassConfirmation?: boolean },
	): Promise<ProduceMediaOutcome> {
		const config = await this.deps.loadConfig();
		const preflight = preflightMediaRequest(input.request, config, this.snapshotAvailability(input.request));
		if (preflight.state === 'needs-configuration' || preflight.state === 'unsupported') {
			const problem = preflight.problems[0]?.message ?? preflight.state;
			throw new MediaPreflightError(preflight, `Media preflight failed: ${problem}`);
		}
		if (preflight.state === 'needs-confirmation' && !options?.bypassConfirmation) {
			throw new MediaPreflightError(
				preflight,
				`Media request for ${input.request.kind} requires explicit confirmation.`,
			);
		}
		const job = await this.deps.jobService.createJob({
			runId: input.runId,
			request: input.request,
			preflight,
			initialState: 'queued',
			conversationId: input.conversationId,
		});
		const preset = resolvePreset(config, input.request.kind, input.request.presetId);
		if (!preset) {
			await this.deps.jobService.transition(job.jobId, 'failed', {
				error: `preset-missing:${input.request.presetId}`,
			});
			throw new Error(`MediaGenerationService: no preset for ${input.request.kind}/${input.request.presetId}`);
		}
		const adapter = this.pickAdapter(preflight);
		if (!adapter) {
			await this.deps.jobService.transition(job.jobId, 'failed', { error: 'no-adapter' });
			throw new Error('MediaGenerationService: no adapter available for resolved route');
		}
		// R3 fail-loud invariant: the preflight-selected route must match
		// the adapter we actually invoke. If a caller later mutates the
		// registry mid-flight we refuse to silently switch billing source.
		if (
			(preflight.executionRoute === 'native' && adapter.providerId === 'fal') ||
			(preflight.executionRoute === 'fal' && adapter.providerId !== 'fal')
		) {
			const err = new Error(
				`MediaGenerationService: adapter providerId ${adapter.providerId} does not satisfy preflight route ${preflight.executionRoute}`,
			);
			await this.deps.jobService.transition(job.jobId, 'failed', { error: err.message });
			throw err;
		}
		await this.deps.jobService.transition(job.jobId, 'running');

		const nowFn0 = this.deps.now ?? Date.now;
		const runStartedAtMs = nowFn0();
		let result: MediaGenerationResult;
		let debugCall: ReturnType<DebugTracePort['startModelCall']> | null = null;
		try {
			const adapterRequest = await buildAdapterRequest({
				request: input.request,
				preflight,
				preset,
				config,
				referenceResolver: this.deps.referenceResolver,
			});
			debugCall = this.deps.debugTrace?.startModelCall({
				runId: input.runId,
				surface: 'chat',
				capabilityId: `media.${input.request.kind}`,
				operation: 'media.generate',
				providerId: adapter.providerId,
				modelId: preflight.modelId ?? preset.model,
				request: { raw: safeSerialize(adapterRequest), contentType: 'application/json' },
			}) ?? null;
			result = await adapter.generate(adapterRequest);
			const resultOutputs = result.outputs?.length ? result.outputs : [result];
			debugCall?.succeed({
				response: {
					raw: JSON.stringify({
						kind: result.kind,
						modelId: result.modelId,
						providerRequestId: result.providerRequestId,
						providerResponseUrl: result.providerResponseUrl,
						outputs: resultOutputs.map((output) => ({
							mimeType: output.mimeType,
							extension: output.extension,
							bytes: output.bytes.byteLength,
						})),
					}),
					contentType: 'application/json',
				},
				metrics: {
					outputCount: resultOutputs.length,
					totalBytes: resultOutputs.reduce((sum, output) => sum + output.bytes.byteLength, 0),
					...(result.latencyMs !== undefined ? { providerLatencyMs: result.latencyMs } : {}),
				},
			});
		} catch (err) {
			debugCall?.fail(err);
			const message = (err as Error).message;
			await this.deps.jobService.transition(job.jobId, 'failed', { error: message });
			// V1 §R2 — record failure so cost/latency for aborted runs still
			// show up in the dashboard. estimatedCostUsd is still surfaced
			// because a failure mid-poll may still have incurred charges.
			safeRecordMediaUsage(this.deps.usageEmitter, buildMediaUsageEvent({
				outcome: 'failure',
				kind: input.request.kind,
				route: preflight.executionRoute!,
				provider: preflight.provider ?? (preflight.executionRoute === 'fal' ? 'fal' : 'native'),
				modelId: preflight.modelId ?? preset.model,
				jobId: job.jobId,
				sessionId: input.conversationId ?? input.runId,
				runId: input.runId,
				preset: {
					estimatedCostUsd: preset.estimatedCostUsd,
					costConfidence: preset.costConfidence,
					billingUnit: preset.billingUnit,
				},
				durationMs: nowFn0() - runStartedAtMs,
				request: {
					presetId: input.request.presetId,
					durationSeconds: input.request.durationSeconds,
					quantity: input.request.quantity,
					aspectRatio: input.request.aspectRatio,
				},
				errorMessage: message,
			}));
			throw err;
		}

		const nowFn = this.deps.now ?? Date.now;
		// Zero-gap §4 A3 — batch fan-out: one vault file + one independent
		// receipt PER output so each image can be previewed / opened / reused
		// as a later edit reference on its own.
		const outputs = result.outputs && result.outputs.length > 0 ? result.outputs : [result];
		const stamp = new Date(nowFn()).toISOString().replace(/[:.]/g, '-');
		const writtenPaths: string[] = [];
		const receipts: ChatArtifactReceipt[] = [];
		for (let i = 0; i < outputs.length; i += 1) {
			const output = outputs[i];
			const suffix = outputs.length > 1 ? `-${i + 1}` : '';
			const basename = sanitizeBasename(
				`${input.request.sourceHint ?? input.request.kind}-${stamp}${suffix}`,
			);
			const { path } = await this.deps.writer.writeAttachment({
				attachmentFolder: this.deps.attachmentFolder,
				basename,
				extension: output.extension,
				bytes: output.bytes,
			});
			const receipt = this.buildReceipt({
				input,
				job,
				preflight,
				preset,
				result,
				output: { mimeType: output.mimeType },
				vaultPath: path,
				now: nowFn(),
			});
			await this.deps.receiptSink.save(receipt);
			writtenPaths.push(path);
			receipts.push(receipt);
		}

		// Attach every extra receipt before the terminal transition so a
		// crash between writes cannot orphan later outputs.
		for (const extra of receipts.slice(1)) {
			await this.deps.jobService.attachReceiptId(job.jobId, extra.artifactId);
		}
		const finalJob = await this.deps.jobService.transition(job.jobId, 'completed', {
			appendReceiptId: receipts[0].artifactId,
			providerRequestId: result.providerRequestId,
			providerResponseUrl: result.providerResponseUrl,
		});

		// V1 §R2 — record success (image sync path, TTS command path, cover
		// command path). Video/music go through MediaJobRunner and record
		// there instead — those never enter this code branch.
		safeRecordMediaUsage(this.deps.usageEmitter, buildMediaUsageEvent({
			outcome: 'success',
			kind: input.request.kind,
			route: preflight.executionRoute!,
			provider: preflight.provider ?? (preflight.executionRoute === 'fal' ? 'fal' : 'native'),
			modelId: result.modelId ?? preflight.modelId ?? preset.model,
			jobId: job.jobId,
			sessionId: input.conversationId ?? input.runId,
			runId: input.runId,
			preset: {
				estimatedCostUsd: preset.estimatedCostUsd,
				costConfidence: preset.costConfidence,
				billingUnit: preset.billingUnit,
			},
			durationMs: nowFn0() - runStartedAtMs,
			request: {
				presetId: input.request.presetId,
				durationSeconds: input.request.durationSeconds,
				quantity: input.request.quantity,
				aspectRatio: input.request.aspectRatio,
			},
		}));

		return {
			job: finalJob,
			preflight,
			receipts,
			writtenPaths,
		};
	}

	/**
	 * D2 §R1/§R2 — start a durable async job (video / music).
	 *
	 * Contract:
	 *   1. Preflight runs first — needs-configuration / unsupported throw
	 *      MediaPreflightError so the caller writes a `needs-configuration`
	 *      receipt (no cost incurred).
	 *   2. If preflight is `needs-confirmation`, the job persists in
	 *      `awaiting-confirmation` with a `generating`-adjacent receipt in
	 *      state `awaiting-confirmation`; the provider is NOT contacted.
	 *   3. If preflight is `ready` (which video/music never is in practice —
	 *      preflight always demands confirmation for those kinds — but this
	 *      branch stays for defence-in-depth), the job persists as `queued`
	 *      and the runner kicks off immediately.
	 *   4. The tool call NEVER blocks the chat turn — this method returns
	 *      as soon as the receipt + job are persisted.
	 */
	async startAsyncJob(input: StartAsyncJobInput): Promise<StartAsyncJobOutcome> {
		const config = await this.deps.loadConfig();
		const preflight = preflightMediaRequest(
			input.request,
			config,
			this.snapshotAvailability(input.request),
		);
		if (preflight.state === 'needs-configuration' || preflight.state === 'unsupported') {
			const problem = preflight.problems[0]?.message ?? preflight.state;
			throw new MediaPreflightError(preflight, `Media preflight failed: ${problem}`);
		}
		const requiresConfirmation = preflight.state === 'needs-confirmation';
		const initialState: 'queued' | 'awaiting-confirmation' = requiresConfirmation
			? 'awaiting-confirmation'
			: 'queued';
		const job = await this.deps.jobService.createJob({
			runId: input.runId,
			request: input.request,
			preflight,
			initialState,
			conversationId: input.conversationId,
		});
		const receiptId = `art-${generateUuidWithoutHyphens()}`;
		const receipt = this.buildAsyncPendingReceipt({
			artifactId: receiptId,
			input,
			job,
			preflight,
			state: requiresConfirmation ? 'awaiting-confirmation' : 'generating',
		});
		await this.deps.receiptSink.save(receipt);
		// D2 C1 fix: persist receiptId into the job row NOW so a crash
		// between here and job completion cannot orphan the receipt. The
		// runner's rehydrateAnchor() reads `job.receiptIds` to recover the
		// anchor when the in-memory `tracks` map is empty after boot —
		// without this call, resume-then-confirm-then-complete leaves the
		// receipt stuck at `awaiting-confirmation` because
		// updateReceiptToSaved() guards on `!track.receiptId`.
		await this.deps.jobService.attachReceiptId(job.jobId, receiptId);
		if (this.jobRunner) {
			this.jobRunner.track(job.jobId, {
				receiptId,
				messageId: input.messageId ?? '',
				conversationId: input.conversationId ?? '',
				projectId: input.projectId,
			});
			if (!requiresConfirmation) {
				// Fire-and-forget: runner submits then polls itself.
				void this.jobRunner.start(job.jobId).catch(() => { /* runner marks failed */ });
			}
		}
		return {
			jobId: job.jobId,
			receiptId,
			preflight,
			requiresConfirmation,
		};
	}

	/**
	 * D2 §R2 — confirm an awaiting-confirmation job.
	 * Runner submits to the adapter and starts polling.
	 */
	async confirmJob(jobId: string): Promise<void> {
		if (!this.jobRunner) {
			throw new Error('MediaGenerationService.confirmJob: no job runner bound');
		}
		await this.jobRunner.confirm(jobId);
	}

	/**
	 * D2 §R3 — cancel a job (queued / awaiting-confirmation / running).
	 * Runner stops the local timer, best-effort remote cancel, transitions
	 * job → cancelled, and rewrites the receipt to `state: 'cancelled'`
	 * using the tracked anchor (messageId / conversationId preserved).
	 */
	async cancelJob(jobId: string, reason?: string): Promise<void> {
		if (!this.jobRunner) {
			throw new Error('MediaGenerationService.cancelJob: no job runner bound');
		}
		await this.jobRunner.cancel(jobId, reason ?? 'user-cancelled');
	}

	private buildAsyncPendingReceipt(args: {
		artifactId: string;
		input: StartAsyncJobInput;
		job: MediaJob;
		preflight: MediaPreflight;
		state: 'awaiting-confirmation' | 'generating';
	}): ChatArtifactReceipt & { media: MediaReceiptExtras } {
		const { artifactId, input, job, preflight, state } = args;
		const nowFn = this.deps.now ?? Date.now;
		const kindLabel = input.request.kind === 'video' ? 'video' : 'audio';
		const extras: MediaReceiptExtras = {
			executionRoute: preflight.executionRoute!, // set for ready + needs-confirmation
			provider: preflight.provider ?? (preflight.executionRoute === 'fal' ? 'fal' : 'native'),
			modelId: preflight.modelId ?? '',
			jobId: job.jobId,
			cost: preflight.estimate,
			mediaKind: input.request.kind,
			presetId: input.request.presetId,
			// D2 I2 — surfaced by the confirm cost card. Undefined here means
			// "not applicable to this kind" (image uses quantity; video/music
			// use durationSeconds).
			durationSeconds: input.request.durationSeconds,
			quantity: input.request.quantity,
		};
		const availableActions: ChatArtifactReceipt['availableActions'] =
			state === 'awaiting-confirmation' ? ['confirm', 'cancel'] : ['cancel'];
		return {
			artifactId,
			runId: input.runId,
			messageId: input.messageId ?? '',
			conversationId: input.conversationId ?? '',
			projectId: input.projectId,
			direction: 'generated',
			kind: kindLabel,
			title: input.request.sourceHint
				?? `${input.request.kind} — ${truncatePrompt(input.request.prompt)}`,
			preview: { kind: 'none' },
			state,
			availableActions,
			createdAt: nowFn(),
			media: extras,
		};
	}

	private snapshotAvailability(request: MediaGenerationRequest): MediaRouteAvailability {
		const fal = this.deps.adapters.fal;
		const falSnapshot = fal
			? {
				configured: fal.isConfigured(),
				supportedKinds: fal.supportedKinds(),
				supportedOperations: fal.supportedOperations?.(request.kind) ?? ['generate'] as const,
			}
			: { configured: false, supportedKinds: [] as const };
		const nativeProbe = this.deps.nativeAvailability ?? NO_NATIVE_ADAPTER_YET;
		const nativeSnapshot = nativeProbe({ kind: request.kind, nativeProfileId: request.nativeProfileId });
		return {
			fal: falSnapshot,
			native: nativeSnapshot,
		};
	}

	/**
	 * D1 §R1: sync-only snapshot for the Chat tool availability resolver.
	 * Reports, per media kind, whether at least one route can execute the
	 * kind today (without loading config / running preflight). Callers use
	 * this to decide "should `media_generate` appear in the tool list?"
	 * and to render per-route reasons when it should not.
	 *
	 * Note: this is a fast probe intended for UI ticks. Precise
	 * needs-configuration vs needs-confirmation semantics still come from
	 * `preflight()` at execute time.
	 */
	probeSyncAvailability(): MediaGenerationSyncSnapshot {
		const fal = this.deps.adapters.fal;
		const falConfigured = fal ? fal.isConfigured() : false;
		const falKinds = fal ? new Set(fal.supportedKinds()) : new Set<string>();
		const nativeProbe = this.deps.nativeAvailability ?? NO_NATIVE_ADAPTER_YET;
		const perKind: Record<MediaGenerationSyncKind, MediaKindSyncSnapshot> = {
			image: probeKind('image'),
			video: probeKind('video'),
			music: probeKind('music'),
		};
		return { perKind };

		function probeKind(kind: MediaGenerationSyncKind): MediaKindSyncSnapshot {
			const nativeSnapshot = nativeProbe({ kind });
			const nativeReady = nativeSnapshot.configured && nativeSnapshot.supportedKinds.includes(kind);
			const falReady = falConfigured && falKinds.has(kind);
			return {
				anyRouteReady: nativeReady || falReady,
				routes: {
					native: nativeSnapshot,
					fal: {
						configured: falConfigured,
						supportedKinds: fal ? fal.supportedKinds() : [],
						supportedOperations: fal?.supportedOperations?.(kind) ?? ['generate'],
					},
				},
			};
		}
	}

	/**
	 * D2 I1 fix — resolve `{default, max}` duration bounds for a
	 * (kind, presetId) tuple. Reads `MediaPreset.maxDurationSeconds` from
	 * the merged config; falls back to
	 * `MEDIA_KIND_DEFAULT_MAX_DURATION_SECONDS[kind]` so a template that
	 * forgot the field cannot silently give the UI an unbounded value.
	 * UI callers use this to drive the Composer duration input's `max`
	 * (replaced the hardcoded `max={60}`).
	 */
	async resolveDurationLimits(
		kind: MediaGenerationSyncKind,
		presetId = 'default',
	): Promise<{ defaultSeconds: number; maxSeconds: number }> {
		const config = await this.deps.loadConfig();
		const preset = resolvePreset(config, kind, presetId);
		const maxFallback = MEDIA_KIND_DEFAULT_MAX_DURATION_SECONDS[kind] || 60;
		const defaultFallback = kind === 'video' ? 8 : kind === 'music' ? 20 : 0;
		return {
			defaultSeconds: preset?.durationSeconds ?? defaultFallback,
			maxSeconds: preset?.maxDurationSeconds ?? maxFallback,
		};
	}

	private pickAdapter(preflight: MediaPreflight): MediaGenerationPort | null {
		if (!preflight.executionRoute) return null;
		return this.deps.adapters[preflight.executionRoute] ?? null;
	}

	private buildReceipt(args: {
		input: ProduceMediaInput;
		job: MediaJob;
		preflight: MediaPreflight;
		preset: ReturnType<typeof resolvePreset> & object;
		result: MediaGenerationResult;
		/** Per-output fields (batch fan-out writes one receipt per output). */
		output: { mimeType: string };
		vaultPath: string;
		now: number;
	}): ChatArtifactReceipt {
		const { input, job, preflight, preset, result, output, vaultPath, now } = args;
		const kindLabel = CHAT_ARTIFACT_KIND_BY_MEDIA_KIND[input.request.kind];
		const extras: MediaReceiptExtras = {
			executionRoute: preflight.executionRoute!, // ready/needs-confirmation both set it
			provider: preflight.provider ?? (preflight.executionRoute === 'fal' ? 'fal' : 'native'),
			modelId: result.modelId ?? preflight.modelId ?? preset.model,
			jobId: job.jobId,
			cost: preflight.estimate,
			mediaKind: input.request.kind,
			presetId: input.request.presetId,
		};
		const receipt: ChatArtifactReceipt & { media: MediaReceiptExtras } = {
			artifactId: `art-${generateUuidWithoutHyphens()}`,
			runId: input.runId,
			messageId: input.messageId ?? '',
			conversationId: input.conversationId ?? '',
			projectId: input.projectId,
			direction: 'generated',
			kind: kindLabel,
			title: input.request.sourceHint ?? `${input.request.kind}-${new Date(now).toISOString().slice(0, 10)}`,
			contentType: output.mimeType,
			preview:
				input.request.kind === 'image'
					? { kind: 'image', uri: vaultPath }
					: { kind: 'none' },
			vaultPath,
			state: 'saved',
			availableActions: ['preview', 'open', 'download'],
			createdAt: now,
			media: extras,
		};
		return receipt;
	}
}

/**
 * Distinguishable error so command / UI code can react to
 * needs-configuration vs needs-confirmation without string matching.
 */
export class MediaPreflightError extends Error {
	constructor(public readonly preflight: MediaPreflight, message: string) {
		super(message);
		this.name = 'MediaPreflightError';
	}
}

function truncatePrompt(prompt: string): string {
	const trimmed = prompt.trim().replace(/\s+/g, ' ');
	return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

function sanitizeBasename(raw: string): string {
	const trimmed = raw
		.replace(/[^\w一-鿿\- ]+/g, '')
		.trim()
		.replace(/\s+/g, '-');
	return trimmed.length > 0 ? trimmed.slice(0, 60) : 'media';
}

/** App-layer factory that wires the concrete artifact receipt sink. */
export function makeChatArtifactReceiptSink(
	saveArtifactReceipt: (receipt: ChatArtifactReceipt) => Promise<void>,
): ChatArtifactReceiptSink {
	return {
		save: (r) => saveArtifactReceipt(r),
	};
}
