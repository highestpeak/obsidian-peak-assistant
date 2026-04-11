import {
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	ModelTokenLimits,
	ProviderOptions,
	ProviderOptionsConfig,
} from '../types';
import { createGoogleGenerativeAI, GoogleGenerativeAIProvider } from '@ai-sdk/google';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';
import { LLMRequest, LLMResponse, LLMStreamEvent } from '../types';
import { LanguageModel } from 'ai';
import { modelRegistry } from '../model-registry';

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PROVIDER_ID_GEMINI = 'gemini';

export function getKnownGeminiModelIds(): readonly string[] {
	return modelRegistry.getModelIdsForProvider(PROVIDER_ID_GEMINI);
}

export interface GeminiChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	extra?: Record<string, any>;
}

export class GeminiChatService implements LLMProviderService {
	private readonly client: GoogleGenerativeAIProvider;

	constructor(private readonly options: GeminiChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('Gemini API key is required');
		}
		this.client = createGoogleGenerativeAI({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? GEMINI_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return PROVIDER_ID_GEMINI;
	}

	private resolveApiModelId(modelId: string): string {
		return modelRegistry.resolveApiModelId(PROVIDER_ID_GEMINI, modelId);
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
		return modelRegistry.getModelsForProvider(PROVIDER_ID_GEMINI);
	}

	getProviderMetadata(): ProviderMetaData {
		return (
			modelRegistry.getProviderMetadata(PROVIDER_ID_GEMINI) ?? {
				id: PROVIDER_ID_GEMINI,
				name: 'Google',
				defaultBaseUrl: GEMINI_DEFAULT_BASE,
				icon: 'google',
			}
		);
	}

	getProviderOptions(optionConfig: ProviderOptionsConfig): ProviderOptions | undefined {
		const reasoningEffort = optionConfig.reasoningEffort === 'medium' ? 'low' : optionConfig.reasoningEffort ?? 'low';
		return {
			google: {
				thinkingConfig: {
					thinkingLevel: reasoningEffort,
					includeThoughts: optionConfig.noReasoning ? false : true,
				},
			},
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Gemini provider does not support embedding generation');
	}

	getModelTokenLimits(model: string): ModelTokenLimits | undefined {
		return modelRegistry.getModelTokenLimits(PROVIDER_ID_GEMINI, model);
	}
}
