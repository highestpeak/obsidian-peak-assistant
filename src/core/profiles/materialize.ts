/** Provider-neutral profile materialization helpers. */

import type { Profile } from './types';

/**
 * Extract embedding config from a Profile. Returns null if the profile
 * has no embedding endpoint or model configured.
 */
export function toEmbeddingConfig(
	profile: Profile,
): { endpoint: string; apiKey: string; model: string } | null {
	if (!profile.embeddingEndpoint || !profile.embeddingModel) return null;
	return {
		endpoint: profile.embeddingEndpoint,
		apiKey: profile.embeddingApiKey ?? profile.apiKey ?? '',
		model: profile.embeddingModel,
	};
}
