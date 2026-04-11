import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
	ModelTokenLimits,
	ProviderOptions,
	ProviderOptionsConfig,
} from '../types';
import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai';
import { embedMany, type EmbeddingModel, type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';
import { modelRegistry } from '../model-registry';

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';
const PROVIDER_ID_OPENAI = 'openai';

export function getKnownOpenAIModelIds(): readonly string[] {
	return modelRegistry.getModelIdsForProvider(PROVIDER_ID_OPENAI);
}

export function getOpenAIAvatarType(modelId: string): string {
	return modelRegistry.getModelIcon(PROVIDER_ID_OPENAI, modelId) || modelId;
}

export interface OpenAIChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	extra?: Record<string, any>;
}

export class OpenAIChatService implements LLMProviderService {
	private readonly client: OpenAIProvider;

	constructor(private readonly options: OpenAIChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('OpenAI API key is required');
		}
		this.client = createOpenAI({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? OPENAI_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return PROVIDER_ID_OPENAI;
	}

	private resolveApiModelId(modelId: string): string {
		return modelRegistry.resolveApiModelId(PROVIDER_ID_OPENAI, modelId);
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
		return modelRegistry.getModelsForProvider(PROVIDER_ID_OPENAI);
	}

	getProviderMetadata(): ProviderMetaData {
		return (
			modelRegistry.getProviderMetadata(PROVIDER_ID_OPENAI) ?? {
				id: PROVIDER_ID_OPENAI,
				name: 'OpenAI',
				defaultBaseUrl: OPENAI_DEFAULT_BASE,
				icon: 'openai',
			}
		);
	}

	getProviderOptions(optionConfig: ProviderOptionsConfig): ProviderOptions | undefined {
		return {
			openai: {
				reasoningEffort: optionConfig.noReasoning ? 'none' : optionConfig.reasoningEffort ?? 'medium',
			},
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		const result = await embedMany({
			model: this.client.textEmbeddingModel(model) as unknown as EmbeddingModel,
			values: texts,
		});

		return result.embeddings;
	}

	getModelTokenLimits(model: string): ModelTokenLimits | undefined {
		return (
			modelRegistry.getModelTokenLimits(PROVIDER_ID_OPENAI, model) ?? {
				maxTokens: 4096,
				maxInputTokens: 4096,
				recommendedSummaryThreshold: 3000,
			}
		);
	}
}
