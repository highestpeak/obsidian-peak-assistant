/**
 * Peak Composer — image pack dispatch IDs (WP7).
 *
 * Stable renderer / writeback-adapter identifiers carried by typed image result
 * envelopes. Dispatch is by these IDs + result kind ONLY — never by a capability
 * label or an `id.includes(...)` substring (spec §10, handoff §2.3). Shared by
 * the service materializers/adapters and the UI renderer registry.
 */

import type { ComposerRendererId, ComposerWritebackAdapterId } from '@/core/composer';

/** Image-asset candidate card (paste rename review / AI edit / convert result). */
export const COMPOSER_IMAGE_ASSET_RENDERER_ID: ComposerRendererId = 'composer.renderer.image-asset';
/** Caption (figcaption) review card. */
export const COMPOSER_IMAGE_ANNOTATION_RENDERER_ID: ComposerRendererId = 'composer.renderer.image-annotation';
/** Multi-image layout review card. */
export const COMPOSER_IMAGE_LAYOUT_RENDERER_ID: ComposerRendererId = 'composer.renderer.image-layout';

/** Writeback: replace an image block's source with the captioned figure. */
export const COMPOSER_IMAGE_ANNOTATION_WRITEBACK_ID: ComposerWritebackAdapterId = 'composer.writeback.image-annotation';
/** Writeback: replace a layout block's source with regenerated HTML. */
export const COMPOSER_IMAGE_LAYOUT_WRITEBACK_ID: ComposerWritebackAdapterId = 'composer.writeback.image-layout';
