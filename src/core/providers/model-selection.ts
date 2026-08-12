import type { Profile } from '@/core/profiles/types';
import { ModelType, type ModelCapabilities, type ModelMetaData } from '@/core/providers/types';

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
		const providerCatalogId = PROFILE_CATALOG_IDS[profile.kind];
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
