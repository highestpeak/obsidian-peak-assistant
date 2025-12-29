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

/**
 * Known Gemini model IDs extracted from @ai-sdk/google type definitions.
 * This serves as a fallback when API model fetching fails.
 * 
 * Note: This list should be kept in sync with GoogleGenerativeAIModelId type from @ai-sdk/google.
 * The list includes all known model IDs up to the package version.
 */
export const KNOWN_GEMINI_CHAT_MODELS: readonly string[] = [
	// Gemini 2.5 series
	'gemini-2.5-pro-exp-03-25',
	'gemini-2.5-pro-preview-05-06',
	'gemini-2.5-flash-preview-04-17',
	'gemini-2.5-pro',
	'gemini-2.5-flash',
	// Gemini 2.0 series
	'gemini-2.0-pro-exp-02-05',
	'gemini-2.0-flash-thinking-exp-01-21',
	'gemini-2.0-flash-exp',
	'gemini-2.0-flash',
	'gemini-2.0-flash-001',
	'gemini-2.0-flash-live-001',
	'gemini-2.0-flash-lite',
	// Gemini 1.5 series
	'gemini-1.5-pro',
	'gemini-1.5-pro-latest',
	'gemini-1.5-pro-001',
	'gemini-1.5-pro-002',
	'gemini-1.5-flash',
	'gemini-1.5-flash-latest',
	'gemini-1.5-flash-001',
	'gemini-1.5-flash-002',
	'gemini-1.5-flash-8b',
	'gemini-1.5-flash-8b-latest',
	'gemini-1.5-flash-8b-001',
	// Gemini experimental
	'gemini-exp-1206',
	// Gemma series
	'gemma-3-27b-it',
	// LearnLM series
	'learnlm-1.5-pro-experimental',
] as const;

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
		// Return all known Gemini models with appropriate icons
		return KNOWN_GEMINI_CHAT_MODELS.map((modelId) => ({
			id: modelId,
			displayName: modelId,
			// Set icon based on model type
			icon: 'gemini',
		}));
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'gemini',
			name: 'Google',
			defaultBaseUrl: GEMINI_DEFAULT_BASE,
			icon: 'google',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		throw new Error('Gemini provider does not support embedding generation');
	}
}

