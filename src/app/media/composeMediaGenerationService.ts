/**
 * App-layer composer for `MediaGenerationService` + `MediaJobRunner`
 * (Task D1 §R1 / Task D2 §R1).
 *
 * Extracted from `PeakCommandActions.getOrBuildMediaGenerationService()`
 * so `main.ts` can build the service once at boot, inject it into
 * `ConversationService` (Chat tool wiring), and reuse the same instance
 * from command entry points. Keeps the app-owned runtime pattern (no
 * service-side singleton, no `AppContext.getInstance()` in the service
 * layer).
 *
 * D2: also composes the durable async job runner (video / music) alongside
 * the service and returns both handles so `main.ts` can:
 *   1. run `runner.resumeUnfinished()` BEFORE `failAllUnfinished()`,
 *   2. register `runner.dispose()` for plugin unload.
 */

import type { App } from 'obsidian';
import { FalMediaAdapter } from '@/app/platform/media/FalMediaAdapter';
import { FalAsyncMediaAdapter } from '@/app/platform/media/FalAsyncMediaAdapter';
import { OpenAINativeImageAdapter } from '@/app/platform/media/OpenAINativeImageAdapter';
import { OpenAINativeVideoAdapter } from '@/app/platform/media/OpenAINativeVideoAdapter';
import { OpenAITranscriptionAdapter } from '@/app/platform/media/OpenAITranscriptionAdapter';
import { WebAudioVideoAudioExtractor } from '@/app/platform/media/WebAudioVideoAudioExtractor';
import { MediaUnderstandingRuntime } from '@/service/media/MediaUnderstandingRuntime';
import { VaultMediaReferenceResolver } from '@/app/platform/media/VaultMediaReferenceResolver';
import { ObsidianMediaAttachmentWriter } from '@/app/platform/media/ObsidianMediaAttachmentWriter';
import {
	makeChatArtifactReceiptSink,
	MediaGenerationService,
} from '@/service/media/MediaGenerationService';
import { MediaJobService } from '@/service/media/MediaJobService';
import { MediaJobRunner } from '@/service/media/MediaJobRunner';
import { loadMediaGenerationConfig } from '@/service/media/mediaGenerationConfig';
import { applyMediaSettingsOverlay } from '@/service/media/mediaSettingsOverlay';
import type { MediaSettingsOverride } from '@/core/config/settingsTypes';
import { getAIMediaFolder } from '@/core/config/folderPaths';
import {
	createOpenAiNativeAvailabilityProbe,
	resolveOpenAiProfile,
} from '@/service/media/openaiNativeAvailabilityProbe';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { useUIEventStore } from '@/ui/store/uiEventStore';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import { EventBus, UsageRecordedViewEvent } from '@/core/eventBus';
import type {
	MediaUsageEmitter,
	MediaUsageEventInput,
} from '@/service/media/MediaUsageEmitter';
import { canonicalJson, type GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import { hashSHA256 } from '@/core/utils/hash-utils';
import type { DebugTracePort } from '@/core/debug-trace';

export interface ComposeMediaGenerationServiceDeps {
	app: App;
	/** Reads the current `AIServiceSettings.falApiKey`. Closure so hot edits apply. */
	getFalApiKey: () => string | undefined;
	/** Reads `AIServiceSettings.mediaAttachmentFolder` — falls back to Chat folder / Media. */
	getMediaAttachmentFolder: () => string | undefined;
	/** Reads `AIServiceSettings.rootFolder` — used to derive the default attachment folder. */
	getRootFolder: () => string;
	/**
	 * Task E1 — reads the user overlay from `settings.ai.mediaDefaults`.
	 * Closure so Settings edits apply on the next call without a re-compose.
	 * Undefined return = "no overlay" (equivalent to E1-not-yet-configured).
	 */
	getMediaSettingsOverride?: () => MediaSettingsOverride | undefined;
	/** Persists a receipt through `ConversationService.saveArtifactReceipt`. */
	saveArtifactReceipt: (receipt: ChatArtifactReceipt) => Promise<void>;
	/**
	 * Zero-gap §4 A1 — resolve an existing ChatArtifactReceipt by artifactId
	 * to its saved vaultPath (so a receipt id can be reused as a reference
	 * input in a later edit). Absent = only vault-path references work.
	 */
	getArtifactReceipt?: (artifactId: string) => Promise<{ vaultPath?: string | null } | null>;
	generatedOutputs?: GeneratedOutputPersistenceRuntime;
	debugTrace?: DebugTracePort | null;
}

export interface ComposedMediaRuntime {
	service: MediaGenerationService;
	runner: MediaJobRunner;
	/**
	 * Zero-gap C1: composer/service-conversation reads this to decide what
	 * happens to an audio/video attachment. Always non-null; when no
	 * provider is configured the runtime reports `attachment-only`.
	 */
	understanding: MediaUnderstandingRuntime;
}

export async function composeMediaGenerationService(
	deps: ComposeMediaGenerationServiceDeps,
): Promise<MediaGenerationService> {
	const { runtime } = await composeMediaRuntime(deps);
	return runtime.service;
}

/**
 * Full D2 composer — returns both the service and the runner so `main.ts`
 * can call `runner.resumeUnfinished()` before `failAllUnfinished()` and
 * register `runner.dispose()` for cleanup on unload.
 */
export async function composeMediaRuntime(
	deps: ComposeMediaGenerationServiceDeps,
): Promise<{ runtime: ComposedMediaRuntime }> {
	// Task E1 — every downstream reader (preflight / adapters / probe /
	// duration limits) goes through this closure so the user overlay is
	// applied in ONE place. Big preset tables stay in
	// templates/config/media-generation.json; the overlay layers small
	// user-editable fields on top (default route, per-kind default preset,
	// model / duration bounds / voice).
	const loadConfigWithOverlay = async () => {
		const base = await loadMediaGenerationConfig();
		const overlay = deps.getMediaSettingsOverride?.();
		return applyMediaSettingsOverlay(base, overlay);
	};
	// Snapshot config at compose time so the adapter's poll timings match
	// the JSON template (per-produce() calls still re-load config for the
	// service pipeline).
	const bootConfig = await loadConfigWithOverlay();
	// V1 R1 — adapters need per-call access to the video duration enum
	// map so the config's `videoDurationEnum[modelId]` overrides take
	// effect without re-instantiating the adapter. `bootConfig` is fine
	// for poll timings (rarely changed), but enum overrides come from
	// templates the user can edit at runtime, so wire a live supplier.
	const falAdapter = new FalMediaAdapter({
		getApiKey: () => deps.getFalApiKey(),
		getTimings: () => ({
			pollIntervalMs: bootConfig.pollIntervalMs,
			pollBackoffMultiplier: bootConfig.pollBackoffMultiplier,
			pollMaxIntervalMs: bootConfig.pollMaxIntervalMs,
			pollDeadlineMs: bootConfig.pollDeadlineMs,
		}),
		getConfig: () => bootConfig,
	});
	const falAsyncAdapter = new FalAsyncMediaAdapter({
		getApiKey: () => deps.getFalApiKey(),
		getConfig: () => bootConfig,
	});

	// Native OpenAI adapter — reads its config + active OpenAI profile per
	// call so profile edits apply without re-instantiating.
	const lookup = {
		getAllProfiles: () => ProfileRegistry.getInstance().getAllProfiles(),
		getProfileById: (id: string) => ProfileRegistry.getInstance().getProfileById(id),
	};
	const nativeAvailability = createOpenAiNativeAvailabilityProbe(lookup);
	// Task E1 — respect the user's preferred native profile id when set.
	//
	// Task E2 I-1 note: `nativeProfileId` is intentionally NOT threaded
	// through `applyMediaSettingsOverlay`. The overlay only shapes the
	// `MediaGenerationConfig` (presets, defaultRoute, poll timings) — a
	// value every preflight / adapter / probe caller reads. `nativeProfileId`
	// is a *lookup hint* for a completely different registry (`ProfileRegistry`),
	// so it lives at the adapter-construction boundary instead. Doing this
	// keeps the config graph pure (adapters do not have to know settings
	// exist) and lets adapters resolve profiles lazily on each call.
	const pickNativeProfileId = () => deps.getMediaSettingsOverride?.()?.nativeProfileId;
	const nativeAdapter = new OpenAINativeImageAdapter({
		hasProfileWithKey: () => resolveOpenAiProfile(lookup, pickNativeProfileId()) !== null,
		resolveCallOptions: async () => {
			const config = await loadConfigWithOverlay();
			const profile = resolveOpenAiProfile(lookup, pickNativeProfileId());
			return {
				config: config.native.openai,
				apiKey: profile?.apiKey ?? undefined,
				baseUrl: profile?.baseUrl ?? undefined,
			};
		},
	});
	// Sora video (zero-gap §5 B1). Shares profile lookup with the image
	// adapter — same OpenAI Profile provides both endpoints.
	const nativeVideoAdapter = new OpenAINativeVideoAdapter({
		hasProfileWithKey: () => resolveOpenAiProfile(lookup, pickNativeProfileId()) !== null,
		resolveCallOptions: async () => {
			const config = await loadConfigWithOverlay();
			const profile = resolveOpenAiProfile(lookup, pickNativeProfileId());
			return {
				config: config.native.openai,
				apiKey: profile?.apiKey ?? undefined,
				baseUrl: profile?.baseUrl ?? undefined,
			};
		},
	});
	// Zero-gap §4 A1 — reference resolver reads bytes from the Vault (or
	// resolves a receipt artifactId → its saved vaultPath first) so edit
	// inputs materialise at execution time. Persisted jobs carry only the
	// stable ref, never bytes.
	const referenceResolver = new VaultMediaReferenceResolver({
		app: deps.app,
		getMimeByExtension: async () => (await loadConfigWithOverlay()).referenceLimits.mimeByExtension,
		getReceiptVaultPath: async (artifactId: string) => {
			if (!deps.getArtifactReceipt) return null;
			const receipt = await deps.getArtifactReceipt(artifactId);
			return receipt?.vaultPath ?? null;
		},
	});
	const writer = new ObsidianMediaAttachmentWriter(deps.app);
	const jobRepo = sqliteStoreManager.getChatMediaJobRepo();
	const jobService = new MediaJobService(jobRepo, Date.now, deps.generatedOutputs ? {
		append: async (job, event) => {
			await deps.generatedOutputs!.events.appendEvent({
				outputId: 'media.job-events',
				streamKey: job.jobId,
				pathVariables: { jobId: job.jobId },
				eventId: `${event}:${job.updatedAt}:${hashSHA256(canonicalJson(job))}`,
				payload: { event, job },
			});
		},
	} : undefined);
	const receiptSink = makeChatArtifactReceiptSink(deps.saveArtifactReceipt);

	// V1 §R2 — usage telemetry emitter. Dispatches the same
	// UsageRecordedViewEvent that chat/query_rewrite emit so
	// UsageTrackingService persists the row through its existing EventBus
	// listener. costUsd is the preset ESTIMATE — metadata.costConfidence
	// carries 'estimated' so the dashboard can caveat it instead of
	// presenting it as a settled bill. Never throws (belt: try/catch here;
	// braces: safeRecordMediaUsage at the call sites).
	const usageEmitter: MediaUsageEmitter = {
		record: (input: MediaUsageEventInput) => {
			try {
				EventBus.getInstance(deps.app).dispatch(new UsageRecordedViewEvent({
					sessionId: input.sessionId,
					feature: 'media_generation',
					action: `${input.kind}.${input.outcome}`,
					provider: input.provider,
					model: input.modelId,
					inputTokens: 0,
					outputTokens: 0,
					cachedTokens: 0,
					reasoningTokens: 0,
					costUsd: input.estimatedCostUsd ?? 0,
					durationMs: input.durationMs,
					isStreaming: false,
					metadata: {
						costConfidence: input.costConfidence,
						billingUnit: input.billingUnit,
						route: input.route,
						jobId: input.jobId,
						runId: input.runId,
						presetId: input.request.presetId,
						durationSeconds: input.request.durationSeconds,
						quantity: input.request.quantity,
						aspectRatio: input.request.aspectRatio,
						errorMessage: input.errorMessage,
					},
				}));
			} catch (e) {
				console.warn('[composeMediaRuntime] usage emit failed:', e);
			}
		},
	};

	const rootFolder = deps.getRootFolder() || 'ChatFolder';
	const attachmentFolder =
		deps.getMediaAttachmentFolder()?.trim() || getAIMediaFolder(rootFolder);

	const service = new MediaGenerationService({
		adapters: { fal: falAdapter, native: nativeAdapter },
		nativeAvailability,
		referenceResolver,
		writer,
		jobService,
		receiptSink,
		loadConfig: loadConfigWithOverlay,
		attachmentFolder,
		usageEmitter,
		debugTrace: deps.debugTrace,
	});

	const runner = new MediaJobRunner({
		jobService,
		adapters: { fal: falAsyncAdapter, native: nativeVideoAdapter },
		writer,
		receiptSink,
		referenceResolver,
		attachmentFolder,
		loadConfig: loadConfigWithOverlay,
		usageEmitter,
		publish: (event) => {
			// Minimum-noise UI observation channel (D2 §R1): messages that
			// render receipts subscribe to `'media-job-updated'` via
			// `useSubscribeUIEvent` and re-load their receipt list. Payload
			// carries the ids UI needs to decide whether to reload.
			try {
				useUIEventStore.getState().publish('media-job-updated', event);
			} catch {
				/* store not available in tests — ignore */
			}
		},
	});
	service.setJobRunner(runner);

	// Zero-gap C1 — understanding runtime. Same profile lookup as the image /
	// video native adapters, so a single OpenAI Profile powers generation
	// AND transcription. If no profile is configured the runtime reports
	// `attachment-only` and the Composer gate degrades honestly.
	const transcriptionAdapter = new OpenAITranscriptionAdapter({
		hasProfileWithKey: () => resolveOpenAiProfile(lookup, pickNativeProfileId()) !== null,
		resolveCallOptions: async () => {
			const config = await loadConfigWithOverlay();
			const profile = resolveOpenAiProfile(lookup, pickNativeProfileId());
			return {
				config: config.native.openai,
				apiKey: profile?.apiKey ?? undefined,
				baseUrl: profile?.baseUrl ?? undefined,
			};
		},
	});
	const audioExtractor = new WebAudioVideoAudioExtractor();
	const understanding = new MediaUnderstandingRuntime({
		transcription: transcriptionAdapter,
		audioExtractor,
		debugTrace: deps.debugTrace,
	});

	return { runtime: { service, runner, understanding } };
}
