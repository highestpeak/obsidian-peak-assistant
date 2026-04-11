import {
	LLMResponse,
	LLMRequest,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
	LLMStreamEvent,
	ModelTokenLimits,
	ProviderOptionsConfig,
	ProviderOptions,
} from '../types';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { type LanguageModel } from 'ai';
import { blockChat, streamChat } from '../adapter/ai-sdk-adapter';
import { modelRegistry } from '../model-registry';

const CLAUDE_DEFAULT_BASE = 'https://api.anthropic.com/v1';
const PROVIDER_ID_CLAUDE = 'claude';

export function getKnownClaudeModelIds(): readonly string[] {
	return modelRegistry.getModelIdsForProvider(PROVIDER_ID_CLAUDE);
}

export interface ClaudeChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	extra?: Record<string, any>;
}

export class ClaudeChatService implements LLMProviderService {
	private readonly client: AnthropicProvider;

	constructor(private readonly options: ClaudeChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('Claude API key is required');
		}
		this.client = createAnthropic({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? CLAUDE_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return PROVIDER_ID_CLAUDE;
	}

	private resolveApiModelId(modelId: string): string {
		return modelRegistry.resolveApiModelId(PROVIDER_ID_CLAUDE, modelId);
	}

	modelClient(model: string, _optionConfig?: ProviderOptionsConfig): LanguageModel {
		return this.client(this.resolveApiModelId(model)) as unknown as LanguageModel;
	}

	async blockChat(request: LLMRequest<any>): Promise<LLMResponse> {
		return blockChat(this.modelClient(request.model), request);
	}

	streamChat(request: LLMRequest<any>): AsyncGenerator<LLMStreamEvent> {
		return streamChat(this.modelClient(request.model), request);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		return modelRegistry.getModelsForProvider(PROVIDER_ID_CLAUDE);
	}

	getProviderMetadata(): ProviderMetaData {
		return (
			modelRegistry.getProviderMetadata(PROVIDER_ID_CLAUDE) ?? {
				id: PROVIDER_ID_CLAUDE,
				name: 'Anthropic',
				defaultBaseUrl: CLAUDE_DEFAULT_BASE,
				icon: 'anthropic',
			}
		);
	}

	getProviderOptions(optionConfig: ProviderOptionsConfig): ProviderOptions | undefined {
		return {
			anthropic: {
				thinking: optionConfig.noReasoning ? 'disabled' : 'enabled',
				effort: optionConfig.reasoningEffort ?? 'low',
			},
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Claude provider does not support embedding generation');
	}

	getModelTokenLimits(model: string): ModelTokenLimits | undefined {
		return (
			modelRegistry.getModelTokenLimits(PROVIDER_ID_CLAUDE, model) ?? {
				maxTokens: 200000,
				maxInputTokens: 200000,
				recommendedSummaryThreshold: 150000,
			}
		);
	}
}
