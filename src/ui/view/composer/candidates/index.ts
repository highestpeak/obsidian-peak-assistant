/**
 * Peak Composer — candidate UI barrel (WP3). Self-contained: nothing outside
 * this directory is imported by these components except core types and the
 * shared primitives. Mounting into the block chrome happens in the merged-tree
 * integration task (via `DocumentComposerRuntime.createCapabilityRuntime`).
 */

import { COMPOSER_STREAMING_TEXT_RENDERER_ID } from '@/core/composer';
import { StreamingTextCandidateCard } from './StreamingTextCandidateCard';
import { UnsupportedCandidateCard } from './UnsupportedCandidateCard';
import { CandidateRendererRegistry, createCandidateRendererRegistry } from './rendererRegistry';

export * from './candidateUiConfig';
export * from './rendererRegistry';
export { StreamingTextCandidateCard } from './StreamingTextCandidateCard';
export { UnsupportedCandidateCard } from './UnsupportedCandidateCard';
export { ComposerCandidateHost, type ComposerCandidateHostProps } from './ComposerCandidateHost';

/**
 * Default registry with every built-in candidate renderer bound to its stable
 * renderer ID. The mount site creates ONE instance per view.
 */
export function createDefaultCandidateRendererRegistry(): CandidateRendererRegistry {
	const registry = createCandidateRendererRegistry(UnsupportedCandidateCard);
	registry.register(COMPOSER_STREAMING_TEXT_RENDERER_ID, StreamingTextCandidateCard);
	return registry;
}
