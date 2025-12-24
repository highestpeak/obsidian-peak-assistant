import {
	LLMResponse,
	LLMRequest,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from '../types';
import { AIStreamEvent } from '../types-events';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { generateText, streamText, type LanguageModel } from 'ai';
import { toAiSdkMessages, extractSystemMessage, streamTextToAIStreamEvents } from './helpers';

const DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS = 1024;
const CLAUDE_DEFAULT_BASE = 'https://api.anthropic.com/v1';

export interface ClaudeChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
	maxOutputTokens?: number;
	extra?: Record<string, any>;
}

export class ClaudeChatService implements LLMProviderService {
	private readonly client: AnthropicProvider;
	private readonly maxOutputTokens: number;

	constructor(private readonly options: ClaudeChatServiceOptions) {
		if (!this.options.apiKey) {
			throw new Error('Claude API key is required');
		}
		this.maxOutputTokens = this.options.maxOutputTokens ?? this.options.extra?.maxOutputTokens ?? DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS;
		this.client = createAnthropic({
			apiKey: this.options.apiKey,
			baseURL: this.options.baseUrl ?? CLAUDE_DEFAULT_BASE,
		});
	}

	getProviderId(): string {
		return 'claude';
	}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		const messages = toAiSdkMessages(request.messages);
		const systemMessage = extractSystemMessage(request.messages);

		const result = await generateText({
			model: this.client(request.model) as unknown as LanguageModel,
			messages,
			system: systemMessage,
			maxOutputTokens: this.maxOutputTokens,
		});

		return {
			content: result.text,
			model: result.response.modelId || request.model,
			usage: result.usage,
		};
	}

	streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		const messages = toAiSdkMessages(request.messages);
		const systemMessage = extractSystemMessage(request.messages);

		const result = streamText({
			model: this.client(request.model) as unknown as LanguageModel,
			messages,
			system: systemMessage,
			maxOutputTokens: this.maxOutputTokens,
		});

		return streamTextToAIStreamEvents(result, request.model);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		return Promise.resolve([
			{ id: 'claude-3-5-sonnet-20240620', displayName: 'Claude 3.5 Sonnet', icon: 'claude-3-5-sonnet' },
			{ id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus', icon: 'claude-3-opus' },
			{ id: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet', icon: 'claude-3-sonnet' },
			{ id: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku', icon: 'claude-3-haiku' },
		]);
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'claude',
			name: 'Claude',
			defaultBaseUrl: CLAUDE_DEFAULT_BASE,
			icon: 'anthropic',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Claude provider does not support embedding generation');
	}
}

