/**
 * Media generation configuration — presets, routing defaults, cost estimates,
 * and poll timings. Source of truth: `templates/config/media-generation.json`.
 * The JSON import is the compiled fallback so callers always get sensible
 * defaults before TemplateManager binds.
 *
 * Spec: docs/superpowers/plans/2026-07-20-chat-runtime-capability-closure-claude-handoff.md §5.4
 *
 * All fal.ai hardcoded values from `FalMediaAdapter` (model ids, voice,
 * poll deadline, size defaults, cost) live here. Adapters read via
 * `MediaGenerationService`, not via the port constructor.
 */

import type { MediaExecutionRoute, MediaKind, MediaOperation } from '@/core/types/media-generation';
import type { MediaEditCodec } from '@/core/ports/MediaGenerationPort';
import type { MediaReferenceLimits } from '@/core/ports/MediaReferenceResolver';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';
import mediaGenerationDefaults from '../../../templates/config/media-generation.json';

/** A single (kind, presetId) tuple's runtime settings. */
export interface MediaPreset {
	provider: 'fal' | 'native';
	model: string;
	/** Operation this preset executes. Absent = 'generate'. */
	operation?: MediaOperation;
	/** fal edit payload field mapping (zero-gap plan §4 A3). */
	editCodec?: MediaEditCodec;
	voice?: string;
	aspectRatio?: string;
	quantity?: number;
	durationSeconds?: number;
	/**
	 * Upper bound the Composer duration input honours for this preset.
	 * D2 I1 fix — the UI used to hardcode `max={60}` which violated
	 * configurability (docs/conventions/configurability.md); the effective
	 * cap is now data-driven so per-endpoint limits (some fal video models
	 * refuse >30s) can be enforced without touching TSX. When absent, the
	 * UI falls back to `MEDIA_KIND_DEFAULT_MAX_DURATION_SECONDS[kind]` so
	 * a broken template cannot silently allow unbounded values.
	 */
	maxDurationSeconds?: number;
	estimatedCostUsd?: number;
	billingUnit: string;
	costConfidence: 'estimated' | 'provider-reported';
}

/**
 * Domain fallback for the Composer duration input max value, per kind.
 * Used when the resolved preset does not set `maxDurationSeconds`. Kept
 * next to `MediaPreset` so the code + config side of the bound stay
 * co-located. Image is unused (duration input hidden for image kind).
 */
export const MEDIA_KIND_DEFAULT_MAX_DURATION_SECONDS: Record<MediaKind, number> = {
	image: 0,
	video: 60,
	music: 60,
	tts: 300,
};

export interface MediaBudgetConfig {
	monthlyUsd: number;
}

/**
 * OpenAI native adapter runtime knobs. Kept in config so
 * base URL / size mapping / timeouts stay data-driven — never re-hardcoded
 * into the adapter itself (Configurability rule).
 */
export interface OpenAINativeMediaConfig {
	/** Default base URL used when a profile does not set one. */
	defaultBaseUrl: string;
	/** Path appended to base URL for `/v1/images/generations`. */
	imagesPath: string;
	/** Path appended to base URL for `/v1/images/edits` (multipart). */
	editsPath: string;
	/** Multipart part name for reference images (gpt-image-1 family: `image[]`). */
	editImagePartName: string;
	/** Per-model overrides (dall-e-2 uses a single `image` part). */
	editImagePartNameByModel: Record<string, string>;
	/** Whether the native edit endpoint accepts a mask part. */
	editSupportsMask: boolean;
	/** Provider cap on reference image count per edit request. */
	editMaxImages: number;
	/** Path appended to base URL for `/v1/videos` (Sora). */
	videosPath: string;
	/** Allowed `seconds` enum values the Sora API accepts (strings). */
	videoAllowedSeconds: string[];
	/** aspectRatio → Sora `size` value. */
	videoSizeByAspect: Record<string, string>;
	/** Fallback Sora size when the aspect is unmapped. */
	videoDefaultSize: string;
	/** Model ids the native video adapter accepts. */
	videoModels: string[];
	/** Preset id preferred when the caller says `presetId: 'default'` and route is native. */
	defaultPresetId: string;
	/** aspectRatio → size mapping (e.g. `1024x1024`, `1792x1024`). */
	sizeByAspect: Record<string, string>;
	/** Fallback size when neither aspectRatio nor preset supply one. */
	defaultSize: string;
	/** Default `n` when quantity is not supplied. */
	defaultN: number;
	/** Default `response_format` for models that support it (e.g. `dall-e-3`).
	 * Set to `null` (or omit) for models that reject the field (e.g. `gpt-image-1`).
	 * `b64_json` avoids a second fetch round-trip when supported. */
	defaultResponseFormat: 'b64_json' | 'url' | null;
	/** Per-model `response_format` overrides. Key is modelId (e.g. "gpt-image-1"),
	 * value is `null` to omit the field entirely, or `'b64_json'`/`'url'`.
	 * Overrides take precedence over `defaultResponseFormat`. */
	responseFormatByModel: Record<string, 'b64_json' | 'url' | null>;
	/**
	 * E2 R2#2 (E1 M-1): per-model upper bound on the `n` (quantity) request
	 * field. `gpt-image-1` refuses `n>1` at the provider; without a preflight
	 * guard the user would hit a 400 after paying nothing but wasting a
	 * round-trip. Missing entries fall back to `defaultMaxQuantity`.
	 * Setting this to 1 forbids batches for that model.
	 */
	maxQuantityByModel: Record<string, number>;
	/** Domain fallback used when a model has no entry in `maxQuantityByModel`. */
	defaultMaxQuantity: number;
	/** HTTP timeout for the images endpoint (ms). */
	requestTimeoutMs: number;
	/**
	 * Zero-gap C1 — transcription endpoint. Path appended to base URL for
	 * `/v1/audio/transcriptions`. Kept alongside `imagesPath`/`editsPath`/
	 * `videosPath` so all endpoint choices live in one config block.
	 */
	transcriptionsPath: string;
	/** Default model id sent to the transcription endpoint. */
	transcriptionModel: string;
}

export interface NativeMediaConfig {
	openai: OpenAINativeMediaConfig;
}

/** Externalised strings for preflight/adapter user-facing messages. */
export interface MediaGenerationStrings {
	nativeNoAdapter: string;
	nativeUnsupportedKind: string;
	nativeMissingProfile: string;
	nativeInvalidProfile: string;
	autoNoRoute: string;
	falKeyMissing: string;
	falUnsupportedKind: string;
	falInvalidEndpoint: string;
	presetMissing: string;
	routeMismatch: string;
	/** D1 §R1: Chat tool result templates. `{slots}` are filled at runtime. */
	toolImageSuccessPayload: string;
	toolExecuteFailedGeneric: string;
	toolExecuteFailedPayload: string;
	/** D2 §R1/§R2: async job (video/music) payload templates. */
	toolAsyncJobQueuedPayload: string;
	toolAsyncJobAwaitingConfirmationPayload: string;
	/**
	 * E2 R2#1 (E1 I-2): validation `detail` templates. Migrated out of
	 * `mediaSettingsOverlay.ts` so user-facing copy stays out of TypeScript
	 * (Configurability rule). Slots per template documented in-place.
	 */
	validateFalKeyMissingDetail: string;
	/** slots: {kind}, {presetId}, {modelId} */
	validateFalEndpointMalformedDetail: string;
	/** slots: {profileId} */
	validateNativeProfileInvalidDetail: string;
	validateNativeProfileMissingDetail: string;
	/** slots: {kind}, {presetId} */
	validatePresetMissingDetail: string;
	/** slots: {kind} */
	validateOverrideDurationPositiveDetail: string;
	/** slots: {kind} */
	validateOverrideMaxDurationPositiveDetail: string;
	/** slots: {kind}, {durationSeconds}, {maxDurationSeconds} */
	validateOverrideDurationExceedsMaxDetail: string;
	/** slots: {kind} */
	validateOverrideQuantityPositiveIntDetail: string;
	/** slots: {kind}, {modelId} */
	validateOverrideFalEndpointMalformedDetail: string;
	/** slots: {kind}, {quantity}, {modelId}, {maxQuantity} */
	validateOverrideQuantityExceedsMaxDetail: string;
	/**
	 * E2 R2#2 (E1 M-1): preflight guard fires when the request quantity
	 * exceeds the per-model native max (see `native.openai.maxQuantityByModel`).
	 * slots: {quantity}, {modelId}, {maxQuantity}
	 */
	preflightQuantityExceedsMaxDetail: string;
	/** slots: {kind}, {supportedKinds} */
	editUnsupportedKind: string;
	editMissingBaseImage: string;
	/** slots: {presetId}, {modelId} */
	editMaskNotSupported: string;
	/** slots: {presetId}, {modelId} */
	editMaskRequired: string;
	/** slots: {route} */
	editRouteUnsupported: string;
	/** slots: {presetId}, {presetOperation}, {operation} */
	presetOperationMismatch: string;
	/** slots: {ref}, {reason} */
	referenceResolveFailedDetail: string;
	/** slots: {route}, {model}, {referenceCount}, {maskNote}, {paths}, {receiptIds} */
	toolEditSuccessPayload: string;
	toolEditMaskNoteSuffix: string;
	nativeVideoMissingProfile: string;
	/** slots: {status} */
	soraContentDownloadFailed: string;
}

export interface MediaGenerationConfig {
	defaultRoute: MediaExecutionRoute;
	pollIntervalMs: number;
	pollBackoffMultiplier: number;
	pollMaxIntervalMs: number;
	pollDeadlineMs: number;
	budget: MediaBudgetConfig;
	/** kind → presetId → preset */
	presets: Record<MediaKind, Record<string, MediaPreset>>;
	/** Subfolder under ChatFolder/Attachments/ used when settings.mediaAttachmentFolder is not set. */
	attachmentSubfolder: string;
	/**
	 * Zero-gap plan §4 A1 — resolver limits + extension→MIME map used when a
	 * reference input carries no MIME hint. Enforced by MediaReferenceResolver.
	 */
	referenceLimits: MediaReferenceLimits & { mimeByExtension: Record<string, string> };
	/** Kinds that accept `operation:'edit'` at all (today: image only). */
	editSupportedKinds: MediaKind[];
	/**
	 * V1 R1 §7.2#6/#9 — video model requires `duration` as an enum string
	 * ("4s"/"6s"/"8s"), not integer seconds. This map keys per-modelId to
	 * the allowed enum values so the adapter can round the requested
	 * `durationSeconds` (integer) down to the nearest allowed value.
	 * Missing modelIds fall back to `videoDurationEnumDefault`.
	 */
	videoDurationEnum: Record<string, string[]>;
	/** Domain fallback duration enum when a video model has no entry. */
	videoDurationEnumDefault: string[];
	/**
	 * V1 R1 §7.1#7 (music) — Composer duration control label for music,
	 * shown in place of a numeric input because lyria2 does not accept a
	 * duration parameter (output ~30s decided by the model).
	 */
	musicFixedDurationLabel: string;
	/** Native provider runtime knobs. */
	native: NativeMediaConfig;
	/** Externalised user-facing strings (no i18n / label hardcode). */
	strings: MediaGenerationStrings;
}

/**
 * Domain fallback: the shape that survives when no template is loaded.
 * Values must match the pre-C1 hardcoded behaviour so a broken template
 * cannot silently change media generation behaviour.
 */
export const DEFAULT_MEDIA_GENERATION_CONFIG: MediaGenerationConfig =
	mediaGenerationDefaults as unknown as MediaGenerationConfig;

/**
 * Load Media Generation config from the runtime config template, deep-merged
 * onto the compiled defaults. Always resolves — never rejects.
 */
export async function loadMediaGenerationConfig(): Promise<MediaGenerationConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_MEDIA_GENERATION_CONFIG;
		const parsed = await tm.loadJson<Partial<MediaGenerationConfig>>(ConfigTemplateId.MediaGeneration);
		if (!parsed || typeof parsed !== 'object') return DEFAULT_MEDIA_GENERATION_CONFIG;
		return mergeMediaGenerationConfig(DEFAULT_MEDIA_GENERATION_CONFIG, parsed);
	} catch {
		return DEFAULT_MEDIA_GENERATION_CONFIG;
	}
}

function mergeMediaGenerationConfig(
	base: MediaGenerationConfig,
	override: Partial<MediaGenerationConfig>,
): MediaGenerationConfig {
	const mergedPresets: MediaGenerationConfig['presets'] = {
		image: { ...base.presets.image, ...(override.presets?.image ?? {}) },
		video: { ...base.presets.video, ...(override.presets?.video ?? {}) },
		music: { ...base.presets.music, ...(override.presets?.music ?? {}) },
		tts: { ...base.presets.tts, ...(override.presets?.tts ?? {}) },
	};
	return {
		defaultRoute: override.defaultRoute ?? base.defaultRoute,
		pollIntervalMs: override.pollIntervalMs ?? base.pollIntervalMs,
		pollBackoffMultiplier: override.pollBackoffMultiplier ?? base.pollBackoffMultiplier,
		pollMaxIntervalMs: override.pollMaxIntervalMs ?? base.pollMaxIntervalMs,
		pollDeadlineMs: override.pollDeadlineMs ?? base.pollDeadlineMs,
		budget: { ...base.budget, ...(override.budget ?? {}) },
		presets: mergedPresets,
		attachmentSubfolder: override.attachmentSubfolder ?? base.attachmentSubfolder,
		referenceLimits: {
			...base.referenceLimits,
			...(override.referenceLimits ?? {}),
			mimeByExtension: {
				...base.referenceLimits.mimeByExtension,
				...(override.referenceLimits?.mimeByExtension ?? {}),
			},
			allowedMimeTypes:
				override.referenceLimits?.allowedMimeTypes ?? base.referenceLimits.allowedMimeTypes,
		},
		editSupportedKinds: override.editSupportedKinds ?? base.editSupportedKinds,
		videoDurationEnum: {
			...base.videoDurationEnum,
			...(override.videoDurationEnum ?? {}),
		},
		videoDurationEnumDefault:
			override.videoDurationEnumDefault ?? base.videoDurationEnumDefault,
		musicFixedDurationLabel:
			override.musicFixedDurationLabel ?? base.musicFixedDurationLabel,
		native: {
			openai: {
				...base.native.openai,
				...(override.native?.openai ?? {}),
				sizeByAspect: {
					...base.native.openai.sizeByAspect,
					...(override.native?.openai?.sizeByAspect ?? {}),
				},
				editImagePartNameByModel: {
					...base.native.openai.editImagePartNameByModel,
					...(override.native?.openai?.editImagePartNameByModel ?? {}),
				},
				videoSizeByAspect: {
					...base.native.openai.videoSizeByAspect,
					...(override.native?.openai?.videoSizeByAspect ?? {}),
				},
				responseFormatByModel: {
					...base.native.openai.responseFormatByModel,
					...(override.native?.openai?.responseFormatByModel ?? {}),
				},
				maxQuantityByModel: {
					...base.native.openai.maxQuantityByModel,
					...(override.native?.openai?.maxQuantityByModel ?? {}),
				},
			},
		},
		strings: { ...base.strings, ...(override.strings ?? {}) },
	};
}

/**
 * Look up a preset with fallback: (kind, id) → (kind, default-for-operation)
 * → null. Returns null when no preset matches so the caller can surface a
 * configuration problem instead of guessing a default model id.
 *
 * Operation-aware (zero-gap §4 A1): when `operation` is supplied and the
 * (kind, id) preset's own operation does not match, the caller gets the
 * exact-id preset back anyway — preflight raises `preset-operation-mismatch`
 * with the concrete ids so the user picks a matching preset (no silent
 * substitution). The FALLBACK path is operation-scoped: edits fall back to
 * `edit-default`, generates to `default`.
 */
export function resolvePreset(
	cfg: MediaGenerationConfig,
	kind: MediaKind,
	presetId: string,
	operation?: MediaOperation,
): MediaPreset | null {
	const byKind = cfg.presets[kind];
	if (!byKind) return null;
	const preset = byKind[presetId];
	if (preset) return preset;
	const fallbackId = operation === 'edit' ? 'edit-default' : 'default';
	return byKind[fallbackId] ?? null;
}

/** Normalised operation of a preset (absent = 'generate'). */
export function presetOperation(preset: MediaPreset): MediaOperation {
	return preset.operation ?? 'generate';
}

/**
 * V1 R1 §7.2#6/#9 — resolve the enum-string value adapters send in the
 * fal `duration` field for a given `(modelId, seconds)` pair. Rules:
 *   1. Look up the allowed enum via `videoDurationEnum[modelId]`, falling
 *      back to `videoDurationEnumDefault`.
 *   2. Parse each entry as an integer number of seconds (strip trailing `s`).
 *   3. Return the enum value whose seconds are closest to the request; on a
 *      tie, prefer the LOWER value (safer for cost).
 *   4. If `seconds` is null/undefined, return the LAST enum value (which is
 *      the "quality default" — highest allowed by the model, e.g. `"8s"`).
 * Never throws — a missing / empty enum surfaces "8s" as an ultimate
 * fallback so a broken template does not brick video generation.
 */
export function resolveVideoDurationEnum(
	cfg: MediaGenerationConfig,
	modelId: string,
	seconds: number | undefined,
): string {
	const enumList = cfg.videoDurationEnum?.[modelId] ?? cfg.videoDurationEnumDefault ?? [];
	if (enumList.length === 0) return '8s';
	const parsed = enumList
		.map((s) => ({ raw: s, secs: Number.parseInt(String(s).replace(/[^\d]/g, ''), 10) }))
		.filter((p) => Number.isFinite(p.secs) && p.secs > 0);
	if (parsed.length === 0) return enumList[enumList.length - 1] ?? '8s';
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
		return parsed[parsed.length - 1].raw;
	}
	// nearest neighbour, tie → lower (cost-safe)
	parsed.sort((a, b) => a.secs - b.secs);
	let best = parsed[0];
	let bestDist = Math.abs(seconds - best.secs);
	for (const p of parsed) {
		const d = Math.abs(seconds - p.secs);
		if (d < bestDist) {
			best = p;
			bestDist = d;
		}
	}
	return best.raw;
}

/**
 * Validate a fal.ai endpoint id shape. Fal endpoints are `owner/model` or
 * `owner/model/subpath` — reject empty strings, whitespace, or obviously
 * malformed values. Used at startup + settings save so stale `veo3`-style
 * ids don't sit unnoticed until a user triggers generation.
 */
export function isValidFalEndpointId(id: string | undefined | null): boolean {
	if (typeof id !== 'string') return false;
	const trimmed = id.trim();
	if (trimmed.length === 0) return false;
	if (/\s/.test(trimmed)) return false;
	// Must contain at least one slash separating owner from model.
	if (!/^[\w-]+\/[\w./-]+$/.test(trimmed)) return false;
	return true;
}
