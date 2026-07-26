/**
 * Peak Composer — image candidate renderer registration (WP7).
 *
 * Registers the three image renderers (asset / annotation / layout) onto a
 * shared {@link CandidateRendererRegistry} by their stable renderer IDs. The
 * mount site calls this after `createDefaultCandidateRendererRegistry()` so the
 * image cards join the WP3 streaming-text card without modifying the candidates
 * barrel. Dispatch is by renderer ID only.
 */

import {
	COMPOSER_IMAGE_ANNOTATION_RENDERER_ID,
	COMPOSER_IMAGE_ASSET_RENDERER_ID,
	COMPOSER_IMAGE_LAYOUT_RENDERER_ID,
} from '@/service/composer';
import type { CandidateRendererRegistry } from '../../candidates/rendererRegistry';
import { ImageAssetCandidateCard } from './ImageAssetCandidateCard';
import { ImageAnnotationCandidateCard } from './ImageAnnotationCandidateCard';
import { ImageLayoutCandidateCard } from './ImageLayoutCandidateCard';

/** Register the image renderers onto a shared registry (additive; idempotent-safe). */
export function registerImageCandidateRenderers(registry: CandidateRendererRegistry): void {
	if (!registry.has(COMPOSER_IMAGE_ASSET_RENDERER_ID)) {
		registry.register(COMPOSER_IMAGE_ASSET_RENDERER_ID, ImageAssetCandidateCard);
	}
	if (!registry.has(COMPOSER_IMAGE_ANNOTATION_RENDERER_ID)) {
		registry.register(COMPOSER_IMAGE_ANNOTATION_RENDERER_ID, ImageAnnotationCandidateCard);
	}
	if (!registry.has(COMPOSER_IMAGE_LAYOUT_RENDERER_ID)) {
		registry.register(COMPOSER_IMAGE_LAYOUT_RENDERER_ID, ImageLayoutCandidateCard);
	}
}
