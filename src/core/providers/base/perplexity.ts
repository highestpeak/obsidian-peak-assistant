import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
	ModelTokenLimits,
	ProviderOptionsConfig,
	ProviderOptions,
} from '../types';
import { createPerplexity, type PerplexityProvider } from '@ai-sdk/perplexity';
import { type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';
import { modelRegistry } from '../model-registry';

const PERPLEXITY_DEFAULT_BASE = 'https://api.perplexity.ai';

export const PROVIDER_ID_PERPLEXITY = 'perplexity';

export function getKnownPerplexityModelIds(): readonly string[] {
	return modelRegistry.getModelIdsForProvider(PROVIDER_ID_PERPLEXITY);
}

export interface PerplexityChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	extra?: Record<string, any>;
}

export class PerplexityChatService implements LLMProviderService {
	private readonly client: PerplexityProvider;

	constructor(private readonly options: PerplexityChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('Perplexity API key is required');
		}
		this.client = createPerplexity({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? PERPLEXITY_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return PROVIDER_ID_PERPLEXITY;
	}

	private resolveApiModelId(modelId: string): string {
		return modelRegistry.resolveApiModelId(PROVIDER_ID_PERPLEXITY, modelId);
	}

	modelClient(model: string): LanguageModel {
		return this.client(this.resolveApiModelId(model)) as unknown as LanguageModel;
	}

	async blockChat(request: LLMRequest<any>): Promise<LLMResponse> {
		return blockChat(this.modelClient(request.model), request);
	}

	streamChat(request: LLMRequest<any>): AsyncGenerator<LLMStreamEvent> {
		return streamChat(this.modelClient(request.model), request);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		return modelRegistry.getModelsForProvider(PROVIDER_ID_PERPLEXITY);
	}

	getProviderMetadata(): ProviderMetaData {
		return (
			modelRegistry.getProviderMetadata(PROVIDER_ID_PERPLEXITY) ?? {
				id: PROVIDER_ID_PERPLEXITY,
				name: 'Perplexity',
				defaultBaseUrl: PERPLEXITY_DEFAULT_BASE,
				icon: 'perplexity',
			}
		);
	}

	getProviderOptions(_optionConfig: ProviderOptionsConfig): ProviderOptions | undefined {
		return undefined;
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Perplexity does not support embeddings');
	}

	getModelTokenLimits(model: string): ModelTokenLimits | undefined {
		return modelRegistry.getModelTokenLimits(PROVIDER_ID_PERPLEXITY, model);
	}
}
