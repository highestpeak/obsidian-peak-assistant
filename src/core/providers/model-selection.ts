import type { Profile } from '@/core/profiles/types';
import { ModelType, type ModelCapabilities, type ModelMetaData } from '@/core/providers/types';
import { profileModelCatalogId } from '@/core/providers/profile-model-catalog';

export type ModelCapabilityRequirement = Partial<ModelCapabilities> & {
	modelType?: ModelType;
};

export interface ModelCatalogReader {
	getModelsForProvider(providerId: string): ModelMetaData[];
}

export interface UnifiedModelChoice {
	profileId: string;
	profileName: string;
	profileKind: Profile['kind'];
	providerCatalogId: string;
	modelId: string;
	displayName: string;
	capabilities: ModelCapabilities | undefined;
	modelType: ModelType;
	selectable: boolean;
	unavailableReason: string | null;
}

/**
 * The route picker deliberately works with the rendered operation-candidate
 * shape (`model`), rather than leaking the catalog shape (`modelId`) into the
 * Scan runtime. Keeping that boundary explicit prevents a valid bound LLM
 * route from being looked up under an undefined property.
 */
export interface OperationRouteCandidate {
	profileId: string;
	model: string;
	provider?: string;
	selectable: boolean;
}

/**
 * Resolve the model shown for an enabled Scan operation.
 *
 * Only an explicit compatible binding is executable. Catalog ordering and a
 * single available candidate are presentation facts, never permission to
 * replace an absent or stale owner configuration.
 */
export function resolveOperationRouteCandidate(
	modelType: ModelType,
	binding: { profileId: string; modelId: string } | null,
	candidates: readonly OperationRouteCandidate[],
): OperationRouteCandidate | null {
	const bound = binding
		? candidates.find((candidate) => (
			candidate.profileId === binding.profileId
			&& candidate.model === binding.modelId
			&& candidate.selectable
		))
		: undefined;
	void modelType;
	return bound ?? null;
}

/**
 * Resolve only an explicit compatible embedding binding. Candidate count and
 * provider proximity never authorize a runtime model substitution.
 */
export function resolveEmbeddingDefault(
	binding: { profileId: string; modelId: string } | null,
	candidates: readonly Pick<UnifiedModelChoice, 'profileId' | 'modelId' | 'selectable'>[],
): Pick<UnifiedModelChoice, 'profileId' | 'modelId' | 'selectable'> | null {
	const bound = binding
		? candidates.find((candidate) => (
			candidate.profileId === binding.profileId
			&& candidate.modelId === binding.modelId
			&& candidate.selectable
		))
		: undefined;
	return bound ?? null;
}

const PROFILE_CATALOG_IDS: Partial<Record<Profile['kind'], string>> = {
	anthropic: 'claude',
	openai: 'openai',
	google: 'gemini',
	perplexity: 'perplexity',
	ollama: 'ollama',
	openrouter: 'openrouter',
	codex: 'openai',
	'claude-code': 'claude',
	simulator: 'simulator',
};

function missingCapabilityReason(
	model: ModelMetaData,
	requirement: ModelCapabilityRequirement,
): string | null {
	const modelType = model.modelType ?? ModelType.LLM;
	if (requirement.modelType && modelType !== requirement.modelType) {
		return `Requires a ${requirement.modelType} model`;
	}

	const requested = Object.entries(requirement).filter(([key, expected]) =>
		key !== 'modelType' && expected === true,
	) as Array<[keyof ModelCapabilities, true]>;
	for (const [capability] of requested) {
		if (model.capabilities?.[capability] === true) continue;
		const label = capability === 'pdfInput'
			? 'PDF input'
			: capability === 'imageGeneration'
				? 'image generation'
				: capability.replace(/([A-Z])/g, ' $1').toLowerCase();
		return `This action requires ${label} support`;
	}
	return null;
}

export function buildUnifiedModelChoices(
	registry: ModelCatalogReader,
	profiles: readonly Profile[],
	requirement: ModelCapabilityRequirement,
): UnifiedModelChoice[] {
	const choices: UnifiedModelChoice[] = [];
	for (const profile of profiles) {
		if (!profile.enabled) continue;
		const providerCatalogId = profileModelCatalogId(profile) ?? PROFILE_CATALOG_IDS[profile.kind];
		const catalogModels: ModelMetaData[] = providerCatalogId
			? registry.getModelsForProvider(providerCatalogId)
			: Array.from(new Set([profile.primaryModel, profile.fastModel]))
				.filter(Boolean)
				.map((id) => ({ id, displayName: id, modelType: ModelType.LLM } as ModelMetaData));
		for (const model of catalogModels) {
			const unavailableReason = missingCapabilityReason(model, requirement);
			choices.push({
				profileId: profile.id,
				profileName: profile.name,
				profileKind: profile.kind,
				providerCatalogId: providerCatalogId ?? profile.kind,
				modelId: model.id,
				displayName: model.displayName,
				capabilities: model.capabilities,
				modelType: model.modelType ?? ModelType.LLM,
				selectable: unavailableReason === null,
				unavailableReason,
			});
		}
	}
	return choices;
}
