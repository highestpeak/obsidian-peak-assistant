// Media generation port — abstracts the concrete backend (fal.ai today,
// possibly OpenAI native / ElevenLabs / local models later). Consumers speak
// in media kind + textual prompt/script + optional style hints and receive
// raw bytes + suggested extension + reported model/provider identifiers.
//
// The full request/preflight/job contract lives in
// `src/core/types/media-generation.ts` (task C1, plan §5.4). This port is
// intentionally minimal — the unified `MediaGenerationService` owns
// preflight, routing, cost, receipts, and job persistence; adapters here
// only translate a single request into bytes.

import type { MediaKind, MediaOperation } from '@/core/types/media-generation';
import type { ResolvedMediaReference } from '@/core/ports/MediaReferenceResolver';

export type { MediaKind, MediaOperation } from '@/core/types/media-generation';

/**
 * Provider-specific field mapping for edit payloads (fal). Declared per
 * preset in `templates/config/media-generation.json`; adapters consume the
 * codec verbatim — no model-specific field names live in adapter code.
 */
export interface MediaEditCodec {
	/** Payload field the reference image(s) land in (e.g. `image_urls`, `image_url`). */
	imageField: string;
	/** `list` sends every resolved reference; `single` sends only the base image. */
	imageMode: 'single' | 'list';
	/** Payload field for the mask, when the model supports one (e.g. `mask_url`). */
	maskField?: string;
	/** When true, preflight refuses edit requests without a mask for this preset. */
	maskRequired?: boolean;
}

export interface MediaGenerationRequest {
	kind: MediaKind;
	/** Textual input: script for TTS, prompt for image / video / music. */
	prompt: string;
	/** `generate` (default) or `edit`. Adapters must reject ops they cannot execute. */
	operation?: MediaOperation;
	/**
	 * Resolved reference images (bytes materialised by MediaReferenceResolver).
	 * For edits the first entry is the base image; for video generation a
	 * single entry maps to the provider's reference-image field.
	 */
	references?: ResolvedMediaReference[];
	/** Resolved mask image (PNG alpha convention). */
	mask?: ResolvedMediaReference;
	/** Field mapping for fal edit payloads. Supplied from preset config. */
	editCodec?: MediaEditCodec;
	/** Optional model id override. Overrides adapter's per-kind default. */
	modelId?: string;
	/** Optional voice/style/model hint the adapter may honor. */
	styleHint?: string;
	/** Optional negative prompt (images / video). */
	negativePrompt?: string;
	/** Optional target aspect ratio (images / video), e.g. "1:1", "16:9". */
	aspectRatio?: string;
	/** Optional target duration (video / music), in seconds. */
	durationSeconds?: number;
	/** Number of images/variants to generate. Adapter interprets as the `n`
	 * parameter (OpenAI) or equivalent. When absent the adapter falls back to
	 * its configured default (config.native.openai.defaultN / preset.quantity). */
	quantity?: number;
}

/** One produced asset. Batch generations return one entry per output. */
export interface MediaGenerationOutput {
	bytes: Uint8Array;
	/** File extension WITHOUT the leading dot, e.g. "mp3", "png", "mp4". */
	extension: string;
	/** MIME type, e.g. "audio/mpeg", "image/png". */
	mimeType: string;
}

export interface MediaGenerationResult {
	kind: MediaKind;
	/** Raw bytes of the FIRST generated asset (back-compat primary output). */
	bytes: Uint8Array;
	/** File extension WITHOUT the leading dot, e.g. "mp3", "png", "mp4". */
	extension: string;
	/** MIME type, e.g. "audio/mpeg", "image/png". */
	mimeType: string;
	/**
	 * Full output list for batch generations (quantity > 1). When present it
	 * INCLUDES the primary output as entry 0. Consumers write one vault file
	 * + one receipt per entry; failed entries never appear here (the adapter
	 * throws instead — partial batches are a provider-level all-or-nothing).
	 */
	outputs?: MediaGenerationOutput[];
	/** Backend-reported model identifier, for tracing / receipt. */
	modelId?: string;
	/** Backend-reported latency in ms. */
	latencyMs?: number;
	/** Provider-side request id (fal.ai queue request_id, etc). */
	providerRequestId?: string;
	/** Provider-side response URL (fal.ai queue response_url). Persisted so
	 * the job record carries the poll cursor for crash-recovery. */
	providerResponseUrl?: string;
}

export interface MediaGenerationPort {
	/** Provider name (e.g. `fal`, `openai`). Used for receipts + telemetry. */
	readonly providerId: string;
	/** True when the adapter has credentials + a valid endpoint configured. */
	isConfigured(): boolean;
	/** Kinds this adapter can execute today. Preflight consults this. */
	supportedKinds(): readonly MediaKind[];
	/**
	 * Operations this adapter can execute per kind (zero-gap §4 A3). Absent
	 * = generate-only, keeps back-compat with pre-edit adapters. Preflight
	 * consults this to decide whether an edit request can route here.
	 */
	supportedOperations?(kind: MediaKind): readonly MediaOperation[];
	generate(req: MediaGenerationRequest): Promise<MediaGenerationResult>;
}
