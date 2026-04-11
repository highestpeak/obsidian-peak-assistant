import catalogData from '../../../data/model-catalog.json';
import {
	ModelCapabilities,
	ModelMetaData,
	ModelTokenLimits,
	ModelType,
	ProviderMetaData,
} from './types';

type CatalogModelEntry = Omit<ModelMetaData, 'modelType'> & {
	apiModelId?: string;
	modelType?: ModelType | `${ModelType}`;
};

type CatalogProviderEntry = ProviderMetaData & {
	models: CatalogModelEntry[];
};

type CatalogRoot = {
	providers: CatalogProviderEntry[];
};

type InternalModelEntry = Omit<CatalogModelEntry, 'modelType'> & {
	modelType: ModelType;
	normalizedId: string;
	normalizedApiModelId?: string;
};

type InternalProviderEntry = ProviderMetaData & {
	models: InternalModelEntry[];
	modelById: Map<string, InternalModelEntry>;
	modelByApiModelId: Map<string, InternalModelEntry>;
};

const DEFAULT_MODEL_TYPE = ModelType.LLM;

function normalizeModelKey(modelId: string): string {
	return modelId.trim().toLowerCase();
}

function normalizeProviderId(providerId: string): string {
	return providerId.trim().toLowerCase();
}

function normalizeModelForFuzzyMatch(modelId: string): string {
	const raw = normalizeModelKey(modelId);
	const withoutTag = raw.replace(/:[^/]+$/, '');
	if (withoutTag.includes('/')) {
		return withoutTag.split('/').slice(-1)[0] ?? withoutTag;
	}
	return withoutTag;
}

function resolveModelType(modelType: CatalogModelEntry['modelType']): ModelType {
	if (typeof modelType === 'string') {
		for (const value of Object.values(ModelType)) {
			if (value === modelType) {
				return value;
			}
		}
	}
	return DEFAULT_MODEL_TYPE;
}

function cloneCapabilities(capabilities?: ModelCapabilities): ModelCapabilities | undefined {
	if (!capabilities) return undefined;
	return { ...capabilities };
}

function cloneTokenLimits(tokenLimits?: ModelTokenLimits): ModelTokenLimits | undefined {
	if (!tokenLimits) return undefined;
	return { ...tokenLimits };
}

function toModelMetadata(entry: InternalModelEntry): ModelMetaData {
	return {
		id: entry.id,
		displayName: entry.displayName ?? entry.id,
		icon: entry.icon,
		modelType: entry.modelType,
		releaseTimestamp: entry.releaseTimestamp,
		costInput: entry.costInput,
		costOutput: entry.costOutput,
		capabilities: cloneCapabilities(entry.capabilities),
		tokenLimits: cloneTokenLimits(entry.tokenLimits),
	};
}

export class ModelRegistry {
	private static instance: ModelRegistry | null = null;

	private readonly providers = new Map<string, InternalProviderEntry>();

	private constructor() {
		const rawCatalog = catalogData as CatalogRoot;
		for (const provider of rawCatalog.providers ?? []) {
			const providerId = normalizeProviderId(provider.id);
			const models = (provider.models ?? []).map((model) => {
				const id = model.id;
				const apiModelId = model.apiModelId?.trim();
				return {
					...model,
					id,
					displayName: model.displayName ?? id,
					modelType: resolveModelType(model.modelType),
					normalizedId: normalizeModelKey(id),
					normalizedApiModelId: apiModelId ? normalizeModelKey(apiModelId) : undefined,
				} as InternalModelEntry;
			});

			const modelById = new Map<string, InternalModelEntry>();
			const modelByApiModelId = new Map<string, InternalModelEntry>();
			for (const model of models) {
				modelById.set(model.normalizedId, model);
				if (model.normalizedApiModelId) {
					modelByApiModelId.set(model.normalizedApiModelId, model);
				}
			}

			this.providers.set(providerId, {
				id: provider.id,
				name: provider.name,
				defaultBaseUrl: provider.defaultBaseUrl,
				icon: provider.icon,
				models,
				modelById,
				modelByApiModelId,
			});
		}
	}

	public static getInstance(): ModelRegistry {
		if (!ModelRegistry.instance) {
			ModelRegistry.instance = new ModelRegistry();
		}
		return ModelRegistry.instance;
	}

	public getProviderMetadata(providerId: string): ProviderMetaData | undefined {
		const provider = this.providers.get(normalizeProviderId(providerId));
		if (!provider) return undefined;
		return {
			id: provider.id,
			name: provider.name,
			defaultBaseUrl: provider.defaultBaseUrl,
			icon: provider.icon,
		};
	}

	public getAllProviderMetadata(): ProviderMetaData[] {
		return Array.from(this.providers.values()).map((provider) => ({
			id: provider.id,
			name: provider.name,
			defaultBaseUrl: provider.defaultBaseUrl,
			icon: provider.icon,
		}));
	}

	public getModelIdsForProvider(providerId: string): readonly string[] {
		const provider = this.providers.get(normalizeProviderId(providerId));
		if (!provider) return [];
		return provider.models.map((model) => model.id);
	}

	public getModelsForProvider(providerId: string): ModelMetaData[] {
		const provider = this.providers.get(normalizeProviderId(providerId));
		if (!provider) return [];
		return provider.models.map(toModelMetadata);
	}

	public resolveApiModelId(providerId: string, modelId: string): string {
		const model = this.findModel(providerId, modelId);
		return model?.apiModelId ?? model?.id ?? modelId;
	}

	public getModelCapabilities(providerId: string, modelId: string): ModelCapabilities | undefined {
		return cloneCapabilities(this.findModel(providerId, modelId)?.capabilities);
	}

	public getModelTokenLimits(providerId: string, modelId: string): ModelTokenLimits | undefined {
		return cloneTokenLimits(this.findModel(providerId, modelId)?.tokenLimits);
	}

	public getModelIcon(providerId: string, modelId: string): string | undefined {
		return this.findModel(providerId, modelId)?.icon;
	}

	public mergeServerData(providerId: string, serverModels: ModelMetaData[]): ModelMetaData[] {
		return serverModels.map((serverModel) => {
			const catalogModel = this.findModel(providerId, serverModel.id);
			const fallback = catalogModel ? toModelMetadata(catalogModel) : undefined;
			return {
				...fallback,
				...serverModel,
				id: serverModel.id,
				displayName: serverModel.displayName || fallback?.displayName || serverModel.id,
				modelType: serverModel.modelType ?? fallback?.modelType ?? DEFAULT_MODEL_TYPE,
				icon: serverModel.icon ?? fallback?.icon,
				tokenLimits: serverModel.tokenLimits ?? fallback?.tokenLimits,
				capabilities: serverModel.capabilities ?? fallback?.capabilities,
				costInput: serverModel.costInput ?? fallback?.costInput,
				costOutput: serverModel.costOutput ?? fallback?.costOutput,
			};
		});
	}

	private findModel(providerId: string, modelId: string): InternalModelEntry | undefined {
		const provider = this.providers.get(normalizeProviderId(providerId));
		if (!provider) return undefined;

		const normalizedInput = normalizeModelKey(modelId);
		const exact = provider.modelById.get(normalizedInput);
		if (exact) return exact;

		const byApiModelId = provider.modelByApiModelId.get(normalizedInput);
		if (byApiModelId) return byApiModelId;

		const fuzzyInput = normalizeModelForFuzzyMatch(modelId);
		let best: InternalModelEntry | undefined;
		let bestScore = -1;

		for (const model of provider.models) {
			const keys = [model.normalizedId, model.normalizedApiModelId].filter(Boolean) as string[];
			for (const key of keys) {
				if (!key) continue;
				const matched = fuzzyInput.includes(key) || key.includes(fuzzyInput);
				if (!matched) continue;
				const score = key.length;
				if (score > bestScore) {
					best = model;
					bestScore = score;
				}
			}
		}

		return best;
	}
}

export const modelRegistry = ModelRegistry.getInstance();
