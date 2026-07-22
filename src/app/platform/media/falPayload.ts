// Shared fal.ai wire-protocol helpers. FalMediaAdapter (sync) and
// FalAsyncMediaAdapter (durable jobs) are two views of the SAME protocol —
// the payload/URL/extension logic lives here exactly once so they cannot
// drift (the async file previously carried a hand-mirrored copy).
//
// Payload facts (verified against docs.fal.ai, 2026-07-21):
//   - TTS (kokoro):     { prompt, voice }                (§7.2#5 — field is `prompt`)
//   - image generate:   { prompt, negative_prompt, image_size, num_images? }
//   - image edit:       codec-driven — `image_urls` list (nano-banana/edit)
//                       or `image_url` + `mask_url` (flux-pro/v1/fill).
//                       fal accepts base64 data URIs in every *_url field.
//   - music (lyria2):   { prompt }                       (§7.2#7 — no duration param)
//   - video (veo3.1):   { prompt, aspect_ratio, duration: "4s"|"6s"|"8s" } (§7.2#6)

import type { MediaGenerationRequest } from '@/core/ports/MediaGenerationPort';
import type { MediaKind, MediaOperation } from '@/core/types/media-generation';
import type { MediaGenerationConfig } from '@/service/media/mediaGenerationConfig';
import { resolveVideoDurationEnum } from '@/service/media/mediaGenerationConfig';

export const FAL_QUEUE_BASE = 'https://queue.fal.run';

export type FalVideoEnumConfig = Pick<
	MediaGenerationConfig,
	'videoDurationEnum' | 'videoDurationEnumDefault'
>;

/** Fallback when an adapter is constructed without a config supplier (legacy tests). */
export const FAL_FALLBACK_VIDEO_ENUM: FalVideoEnumConfig = {
	videoDurationEnum: {},
	videoDurationEnumDefault: ['4s', '6s', '8s'],
};

/** Operations fal can execute per kind (image edits via codec presets). */
export function falSupportedOperations(kind: MediaKind): readonly MediaOperation[] {
	return kind === 'image' ? ['generate', 'edit'] : ['generate'];
}

export function buildFalPayload(
	req: MediaGenerationRequest,
	cfg: FalVideoEnumConfig,
): Record<string, unknown> {
	if (req.kind === 'tts') {
		return { prompt: req.prompt, voice: req.styleHint || 'af_bella' };
	}
	if (req.kind === 'image') {
		if (req.operation === 'edit') {
			return buildFalEditPayload(req);
		}
		const payload: Record<string, unknown> = {
			prompt: req.prompt,
			negative_prompt: req.negativePrompt,
			image_size: req.aspectRatio ? mapFalAspect(req.aspectRatio) : 'square_hd',
		};
		if (typeof req.quantity === 'number' && req.quantity > 1) {
			payload['num_images'] = req.quantity;
		}
		return payload;
	}
	if (req.kind === 'music') {
		return { prompt: req.prompt };
	}
	// video
	const durationEnum = resolveVideoDurationEnum(
		cfg as MediaGenerationConfig,
		req.modelId ?? '',
		req.durationSeconds,
	);
	return {
		prompt: req.prompt,
		aspect_ratio: req.aspectRatio ?? '16:9',
		duration: durationEnum,
	};
}

/**
 * Edit payload — every field name comes from the preset's `editCodec`
 * (templates/config/media-generation.json). Reference bytes travel as
 * base64 data URIs, which fal accepts in any *_url input field.
 */
function buildFalEditPayload(req: MediaGenerationRequest): Record<string, unknown> {
	const codec = req.editCodec;
	if (!codec) {
		throw new Error('fal edit requires an editCodec (preset config) — none was supplied');
	}
	const references = req.references ?? [];
	if (references.length === 0) {
		throw new Error('fal edit requires at least one resolved reference image');
	}
	const payload: Record<string, unknown> = { prompt: req.prompt };
	const uris = references.map((r) => r.dataUri);
	payload[codec.imageField] = codec.imageMode === 'list' ? uris : uris[0];
	if (req.mask) {
		if (!codec.maskField) {
			throw new Error('fal edit: mask supplied but the preset codec declares no maskField');
		}
		payload[codec.maskField] = req.mask.dataUri;
	}
	if (typeof req.quantity === 'number' && req.quantity > 1) {
		payload['num_images'] = req.quantity;
	}
	return payload;
}

/**
 * Extract EVERY media URL from a fal final payload (order preserved).
 * Image models return `images: [{url}...]`; single-asset kinds return one.
 */
export function extractFalMediaUrls(kind: MediaKind, json: Record<string, unknown>): string[] {
	const anyJson = json as any;
	if (kind === 'tts' || kind === 'music') {
		if (anyJson.audio?.url) return [anyJson.audio.url as string];
		if (kind === 'music' && anyJson.audio_file?.url) return [anyJson.audio_file.url as string];
		return [];
	}
	if (kind === 'image') {
		if (Array.isArray(anyJson.images)) {
			return anyJson.images
				.map((entry: any) => entry?.url)
				.filter((url: unknown): url is string => typeof url === 'string');
		}
		if (anyJson.image?.url) return [anyJson.image.url as string];
		return [];
	}
	if (anyJson.video?.url) return [anyJson.video.url as string];
	return [];
}

export function falExtensionAndMime(kind: MediaKind, url: string): { extension: string; mimeType: string } {
	const lower = url.toLowerCase();
	if (kind === 'tts' || kind === 'music') {
		if (lower.endsWith('.wav')) return { extension: 'wav', mimeType: 'audio/wav' };
		return { extension: 'mp3', mimeType: 'audio/mpeg' };
	}
	if (kind === 'image') {
		if (lower.endsWith('.webp')) return { extension: 'webp', mimeType: 'image/webp' };
		if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return { extension: 'jpg', mimeType: 'image/jpeg' };
		return { extension: 'png', mimeType: 'image/png' };
	}
	return { extension: 'mp4', mimeType: 'video/mp4' };
}

export function mapFalAspect(ratio: string): string {
	if (ratio === '16:9') return 'landscape_16_9';
	if (ratio === '9:16') return 'portrait_9_16';
	if (ratio === '4:3') return 'landscape_4_3';
	if (ratio === '3:4') return 'portrait_4_3';
	return 'square_hd';
}
