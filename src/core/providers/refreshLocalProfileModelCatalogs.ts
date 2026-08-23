import type { Profile } from '@/core/profiles/types';
import { fetchLMStudioModelMetadata } from '@/core/providers/lmstudio/fetchLMStudioModels';
import { modelRegistry } from '@/core/providers/model-registry';
import { fetchOllamaModelMetadata } from '@/core/providers/ollama/fetchOllamaModels';
import { fetchOpenRouterEmbeddingModels } from '@/core/providers/openrouter/fetchOpenRouterEmbeddingModels';
import { profileModelCatalogId } from '@/core/providers/profile-model-catalog';

/**
 * Refresh the runtime model catalog for configured local providers.
 *
 * The catalog is shared by every model-selection surface. Keeping discovery in
 * this adapter prevents a particular screen (for example Settings) from being
 * the accidental prerequisite for another screen (for example Chat Studio).
 * Failed local requests intentionally leave the current catalog untouched.
 */
export async function refreshLocalProfileModelCatalogs(profiles: readonly Profile[]): Promise<boolean> {
	const discoverableProfiles = profiles.filter((profile) =>
		profile.enabled && ['ollama', 'lmstudio', 'openrouter'].includes(profile.kind),
	);
	const changed = await Promise.all(discoverableProfiles.map(async (profile) => {
		const discover = profile.kind === 'ollama'
			? fetchOllamaModelMetadata
			: profile.kind === 'lmstudio'
				? fetchLMStudioModelMetadata
				: fetchOpenRouterEmbeddingModels;
		const models = await discover(profile.baseUrl);
		const catalogId = profileModelCatalogId(profile);
		if (!catalogId || models.length === 0) return false;
		return modelRegistry.mergeRuntimeModels(catalogId, models);
	}));

	return changed.some(Boolean);
}
