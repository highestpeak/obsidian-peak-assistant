/**
 * Peak Composer — WP5 pack dispatch IDs (frontmatter + math).
 *
 * Stable renderer / writeback-adapter identifiers for the metadata and formula
 * capability packs. Like the WP3 IDs in `capabilityRuntime.ts`, these are the
 * ONLY keys renderers and writeback adapters dispatch on — never a label or an
 * `id.includes(...)` substring (spec §10, handoff §2.3). They live in a
 * dedicated core file so both the service packs (definitions) and the UI
 * renderer registry reference the same constants.
 */

import type { ComposerRendererId, ComposerWritebackAdapterId } from './capabilityContracts';

// ── Frontmatter (metadata) ────────────────────────────────────────────────────

/** Renders a `metadata-field-patch` candidate (per-field accept/reject, §8.3). */
export const COMPOSER_METADATA_SUGGESTION_RENDERER_ID: ComposerRendererId =
	'composer.renderer.metadata-suggestion';

/** Writeback: sets ONE frontmatter field in the YAML block, comments/order preserved (§8.4). */
export const COMPOSER_METADATA_FIELD_PATCH_WRITEBACK_ID: ComposerWritebackAdapterId =
	'composer.writeback.metadata-field-patch';

// ── Formula (math) ────────────────────────────────────────────────────────────

/** Renders a `formula-annotation` result (explain / split / variables layouts, §10.2). */
export const COMPOSER_FORMULA_ANNOTATION_RENDERER_ID: ComposerRendererId =
	'composer.renderer.formula-annotation';
