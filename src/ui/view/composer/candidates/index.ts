/**
 * Peak Composer — candidate UI barrel (WP3). Self-contained: nothing outside
 * this directory is imported by these components except core types and the
 * shared primitives. Mounting into the block chrome happens in the merged-tree
 * integration task (via `DocumentComposerRuntime.createCapabilityRuntime`).
 */

import {
	COMPOSER_STREAMING_TEXT_RENDERER_ID,
	COMPOSER_ANALYSIS_RENDERER_ID,
	COMPOSER_METADATA_SUGGESTION_RENDERER_ID,
	COMPOSER_FORMULA_ANNOTATION_RENDERER_ID,
	COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
	COMPOSER_NATIVE_FILE_PATCH_RENDERER_ID,
} from '@/core/composer';
import { StreamingTextCandidateCard } from './StreamingTextCandidateCard';
import { UnsupportedCandidateCard } from './UnsupportedCandidateCard';
import { NativeFilePatchCandidateCard } from './NativeFilePatchCandidateCard';
import { AnalysisCandidateCard } from './AnalysisCandidateCard';
import { CandidateRendererRegistry, createCandidateRendererRegistry } from './rendererRegistry';
// WP5 pack renderers (metadata-field-patch / formula-annotation). Registering
// them here keeps the generic candidate host from ever showing the unsupported
// fallback for a shipped pack result (spec §10). The bespoke frontmatter / math
// block UIs remain the richer primary entrances.
import { MetadataSuggestionCandidateCard } from '../blocks/frontmatter/MetadataSuggestionCandidateCard';
import { FormulaAnnotationCandidateCard } from '../blocks/math/FormulaAnnotationCandidateCard';

export * from './candidateUiConfig';
export * from './rendererRegistry';
export { StreamingTextCandidateCard } from './StreamingTextCandidateCard';
export { UnsupportedCandidateCard } from './UnsupportedCandidateCard';
export { NativeFilePatchCandidateCard } from './NativeFilePatchCandidateCard';
export { AnalysisCandidateCard } from './AnalysisCandidateCard';
export { ComposerCandidateHost, type ComposerCandidateHostProps } from './ComposerCandidateHost';

/**
 * Default registry with every built-in candidate renderer bound to its stable
 * renderer ID. The mount site creates ONE instance per view.
 */
export function createDefaultCandidateRendererRegistry(): CandidateRendererRegistry {
	const registry = createCandidateRendererRegistry(UnsupportedCandidateCard);
	registry.register(COMPOSER_ANALYSIS_RENDERER_ID, AnalysisCandidateCard);
	registry.register(COMPOSER_STREAMING_TEXT_RENDERER_ID, StreamingTextCandidateCard);
	registry.register(COMPOSER_LIST_ITEM_PATCH_RENDERER_ID, StreamingTextCandidateCard);
	registry.register(COMPOSER_METADATA_SUGGESTION_RENDERER_ID, MetadataSuggestionCandidateCard);
	registry.register(COMPOSER_FORMULA_ANNOTATION_RENDERER_ID, FormulaAnnotationCandidateCard);
	// WP-INT — native structural edits (Base/Canvas/Excalidraw typed-patch review).
	registry.register(COMPOSER_NATIVE_FILE_PATCH_RENDERER_ID, NativeFilePatchCandidateCard);
	return registry;
}
