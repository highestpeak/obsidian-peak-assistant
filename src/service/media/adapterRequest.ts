/**
 * buildAdapterRequest — the single translation point from a domain
 * `MediaGenerationRequest` (persisted in jobs, stable refs only) to the
 * port-level request adapters consume (modelId resolved, references
 * materialised to bytes, edit codec attached).
 *
 * Shared by MediaGenerationService.produce (sync path) and MediaJobRunner
 * submit/confirm (async path) so the two paths cannot drift. This also
 * fixes the pre-existing async bug where the runner passed the raw domain
 * request to `adapter.submit()` — the domain request has no `modelId`
 * field, so every real fal submit would have thrown `modelId is required`.
 */

import type { MediaGenerationRequest as PortMediaRequest } from '@/core/ports/MediaGenerationPort';
import type {
	MediaReferenceResolver,
	ResolvedMediaReference,
} from '@/core/ports/MediaReferenceResolver';
import type { MediaGenerationRequest, MediaPreflight } from '@/core/types/media-generation';
import type { MediaGenerationConfig, MediaPreset } from './mediaGenerationConfig';

export interface BuildAdapterRequestArgs {
	request: MediaGenerationRequest;
	preflight: MediaPreflight;
	preset: MediaPreset;
	config: MediaGenerationConfig;
	referenceResolver?: MediaReferenceResolver;
	/**
	 * Default true. `false` skips materialising bytes — used by the runner's
	 * download stage, which only needs modelId/kind mapping (re-resolving at
	 * download time could fail if the user deleted the source file while the
	 * provider was still rendering, and the bytes are not needed anymore).
	 */
	resolveReferences?: boolean;
}

export async function buildAdapterRequest(args: BuildAdapterRequestArgs): Promise<PortMediaRequest> {
	const { request, preflight, preset, config, referenceResolver } = args;
	let references: ResolvedMediaReference[] | undefined;
	let mask: ResolvedMediaReference | undefined;
	const wantsRefs =
		(args.resolveReferences ?? true)
		&& ((request.referenceImages?.length ?? 0) > 0 || Boolean(request.maskImage));
	if (wantsRefs) {
		if (!referenceResolver) {
			throw new Error('Media reference resolution is not wired (no MediaReferenceResolver at the app layer).');
		}
		const limits = config.referenceLimits;
		if (request.referenceImages && request.referenceImages.length > 0) {
			references = await referenceResolver.resolve(request.referenceImages, limits);
		}
		if (request.maskImage) {
			const [resolvedMask] = await referenceResolver.resolve([request.maskImage], limits);
			mask = resolvedMask;
		}
	}
	return {
		kind: request.kind,
		prompt: request.prompt,
		operation: request.operation ?? 'generate',
		references,
		mask,
		editCodec: preset.editCodec,
		modelId: preflight.modelId ?? preset.model,
		styleHint: request.styleHint ?? preset.voice,
		negativePrompt: request.negativePrompt,
		aspectRatio: request.aspectRatio ?? preset.aspectRatio,
		durationSeconds: request.durationSeconds ?? preset.durationSeconds,
		quantity: request.quantity ?? preset.quantity,
	};
}
