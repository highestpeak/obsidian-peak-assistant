// Media generation domain types — the plan §5.4 contract, extended with
// fields the persistence layer needs. `MediaKind` is the canonical source
// for the four media kinds Chat surfaces; TTS is ALWAYS distinct from music
// even when both are audio bytes on disk.
//
// Spec: docs/superpowers/plans/2026-07-20-chat-runtime-capability-closure-claude-handoff.md §3.1, §5.4
// Task: docs/superpowers/plans/2026-07-20-...task-c1

import type { ExplicitContextRef } from '@/core/types/chat-studio';

/** Media kinds recognised by preflight / router / receipt. TTS is not music. */
export type MediaKind = 'image' | 'video' | 'music' | 'tts';

/**
 * Operation the request performs. `generate` is text-to-media; `edit`
 * transforms user-supplied reference image(s) (optionally mask-guided).
 * Absent on legacy persisted jobs/receipts → treated as 'generate'.
 */
export type MediaOperation = 'generate' | 'edit';

/** Where a media reference's bytes live. Stable across plugin reloads. */
export type MediaReferenceSourceType = 'vault' | 'receipt';

/**
 * Typed reference input (base image / extra reference / mask). Persists a
 * STABLE content identifier only — never raw base64 — so the chat DB and
 * job rows stay small and a reboot can re-resolve the bytes from the Vault.
 */
export interface MediaReferenceInput {
	sourceType: MediaReferenceSourceType;
	/** Vault-relative path (`vault`) or ChatArtifactReceipt artifactId (`receipt`). */
	ref: string;
	/** Optional MIME hint; the resolver re-derives + validates from bytes/extension. */
	mimeType?: string;
	/** Human label for preflight/confirm cards. */
	label?: string;
}

/** Route selected by the user (or Auto). `native` = provider-native endpoint, `fal` = fal.ai. */
export type MediaExecutionRoute = 'native' | 'fal' | 'auto';

/** Route actually chosen by preflight after resolution. `auto` is never final. */
export type ResolvedMediaRoute = 'native' | 'fal';

/**
 * Producer request. `presetId` picks a config preset (kind-scoped), which
 * supplies model / size / duration / voice defaults; per-request fields
 * (quantity, aspectRatio, duration, requestedModelId) override the preset.
 */
export interface MediaGenerationRequest {
	kind: MediaKind;
	prompt: string;
	/**
	 * Operation. Absent (legacy jobs / receipts persisted before the edit
	 * contract landed) means 'generate' — preflight normalises.
	 */
	operation?: MediaOperation;
	/**
	 * Edit inputs: 1–N reference images. For `operation:'edit'` the FIRST
	 * entry is the base image being edited; additional entries are style /
	 * content references (providers that accept lists get all of them).
	 * For video `generate`, a single entry maps to Sora `input_reference`.
	 */
	referenceImages?: MediaReferenceInput[];
	/** Optional mask (PNG alpha convention). Only valid with a mask-capable preset. */
	maskImage?: MediaReferenceInput;
	references?: ExplicitContextRef[];
	route: MediaExecutionRoute;
	nativeProfileId?: string;
	requestedModelId?: string;
	presetId: string;
	quantity?: number;
	aspectRatio?: string;
	durationSeconds?: number;
	/** Optional negative prompt (image / video). */
	negativePrompt?: string;
	/** Free-form basename hint for the vault attachment writer. */
	sourceHint?: string;
	/** Style / voice hint carried through to the adapter. */
	styleHint?: string;
}

/** Machine-readable problem raised by preflight; UI translates code to copy. */
export interface MediaPreflightProblem {
	code: string;
	message: string;
	configureAction?: 'profiles' | 'mcp' | 'media' | 'permissions';
}

/** Cost estimate carried on preflight and receipt. */
export interface MediaCostEstimate {
	amountUsd?: number;
	billingUnit: string;
	confidence: 'estimated' | 'provider-reported';
}

/** Preflight verdict for a request. `ready` alone means "safe to enqueue without extra UI". */
export interface MediaPreflight {
	state: 'ready' | 'needs-configuration' | 'unsupported' | 'needs-confirmation';
	executionRoute?: ResolvedMediaRoute;
	provider?: string;
	modelId?: string;
	estimate?: MediaCostEstimate;
	problems: MediaPreflightProblem[];
}

/** Terminal + interim states for a durable media job. */
export type MediaJobState =
	| 'queued'
	| 'awaiting-confirmation'
	| 'running'
	| 'completed'
	| 'failed'
	| 'cancelled';

/** Persisted job snapshot. `receiptIds` grows as adapter outputs are written. */
export interface MediaJob {
	jobId: string;
	runId: string;
	state: MediaJobState;
	request: MediaGenerationRequest;
	preflight: MediaPreflight;
	receiptIds: string[];
	/** Provider request id (e.g. fal.ai queue request_id) — required to resume poll. */
	providerRequestId?: string;
	/** Provider poll URL (fal-specific: response_url). */
	providerResponseUrl?: string;
	/** Terminal error message when state = 'failed'. */
	error?: string;
	createdAt: number;
	updatedAt: number;
	/** Optional conversation link (media commands may run without a run). */
	conversationId?: string;
}

/**
 * Media-generation-specific extension carried on the ChatArtifactReceipt's
 * receipt_json blob. Consumers cast (receipt as unknown as WithMediaExtras).
 * We do NOT extend ChatArtifactReceipt directly (avoid touching chat-studio
 * types until D lands). Persisted verbatim, never inferred.
 */
export interface MediaReceiptExtras {
	executionRoute: ResolvedMediaRoute;
	provider: string;
	modelId: string;
	jobId: string;
	cost?: MediaCostEstimate;
	mediaKind: MediaKind;
	presetId: string;
	/**
	 * D2 I2 — surfaced on the awaiting-confirmation cost card so the user
	 * can see EXACTLY what the confirm click will spend on
	 * (route/provider/model plus these quantitative fields). Persisted from
	 * the originating MediaGenerationRequest so a receipt loaded from disk
	 * after boot recovery still renders the correct cost gate. Undefined
	 * for image (uses `quantity` instead of duration).
	 */
	durationSeconds?: number;
	quantity?: number;
}

/** Legal state transitions. Any move not listed is an error. */
export const MEDIA_JOB_LEGAL_TRANSITIONS: Record<MediaJobState, readonly MediaJobState[]> = {
	'queued': ['awaiting-confirmation', 'running', 'cancelled', 'failed'],
	'awaiting-confirmation': ['running', 'cancelled', 'failed'],
	'running': ['completed', 'failed', 'cancelled'],
	'completed': [],
	'failed': [],
	'cancelled': [],
} as const;

export function isMediaJobTransitionLegal(from: MediaJobState, to: MediaJobState): boolean {
	return MEDIA_JOB_LEGAL_TRANSITIONS[from].includes(to);
}
