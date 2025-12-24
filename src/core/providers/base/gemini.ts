import {
	LLMResponse,
	LLMRequest,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from '../types';
import { AIStreamEvent } from '../types-events';
import { createGoogleGenerativeAI, GoogleGenerativeAIProvider } from '@ai-sdk/google';
import { generateText, streamText, type LanguageModel } from 'ai';
import { toAiSdkMessages, extractSystemMessage, streamTextToAIStreamEvents } from './helpers';

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
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
		return 'gemini';
	}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		const messages = toAiSdkMessages(request.messages);
		const systemMessage = extractSystemMessage(request.messages);

		const result = await generateText({
			model: this.client(request.model) as unknown as LanguageModel,
			messages,
			system: systemMessage,
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
		});

		return streamTextToAIStreamEvents(result, request.model);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		return Promise.resolve([
			{ id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', icon: 'gemini-1.5-pro' },
			{ id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', icon: 'gemini-1.5-flash' },
			{ id: 'gemini-1.0-pro', displayName: 'Gemini 1.0 Pro', icon: 'gemini-1.0-pro' },
		]);
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'gemini',
			name: 'Gemini',
			defaultBaseUrl: GEMINI_DEFAULT_BASE,
			icon: 'google',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Gemini provider does not support embedding generation');
	}
}

