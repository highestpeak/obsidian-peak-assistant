import type { Profile } from '@/core/profiles/types';
import { fetchLMStudioModels } from '@/core/providers/lmstudio/fetchLMStudioModels';
import { modelRegistry } from '@/core/providers/model-registry';
import { fetchOllamaModels } from '@/core/providers/ollama/fetchOllamaModels';
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
	const localProfiles = profiles.filter((profile) =>
		profile.enabled && (profile.kind === 'ollama' || profile.kind === 'lmstudio'),
	);
	const changed = await Promise.all(localProfiles.map(async (profile) => {
		const discover = profile.kind === 'ollama' ? fetchOllamaModels : fetchLMStudioModels;
		const modelIds = await discover(profile.baseUrl);
		const catalogId = profileModelCatalogId(profile);
		if (!catalogId || modelIds.length === 0) return false;

		const knownIds = new Set(modelRegistry.getModelsForProvider(catalogId).map((model) => model.id));
		if (modelIds.every((modelId) => knownIds.has(modelId))) return false;
		modelRegistry.mergeRuntimeModels(catalogId, modelIds);
		return true;
	}));

	return changed.some(Boolean);
}
