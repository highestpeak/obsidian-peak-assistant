import {
	LLMRequest,
	LLMResponse,
	LLMProviderService,
	ModelMetaData,
	ProviderMetaData,
} from '../types';
import { AIStreamEvent } from '../types-events';
import { createOpenAI, OpenAIProvider } from '@ai-sdk/openai';
import { generateText, streamText, embedMany, type EmbeddingModel, type LanguageModel } from 'ai';
import { toAiSdkMessages, extractSystemMessage, streamTextToAIStreamEvents } from './helpers';

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

/**
 * Known OpenAI chat model IDs extracted from @ai-sdk/openai type definitions.
 * This serves as a fallback when API model fetching fails.
 * 
 * Note: This list should be kept in sync with OpenAIChatModelId type from @ai-sdk/openai.
 * The list includes all known model IDs up to the package version.
 * 
 * https://platform.openai.com/docs/models
 */
export const KNOWN_OPENAI_CHAT_MODELS: readonly string[] = [
	// O1 series
	'o1',
	'o1-2024-12-17',
	'o1-mini',
	'o1-mini-2024-09-12',
	'o1-preview',
	'o1-preview-2024-09-12',
	// O3 series
	'o3-mini',
	'o3-mini-2025-01-31',
	'o3',
	'o3-2025-04-16',
	// O4 series
	'o4-mini',
	'o4-mini-2025-04-16',
	// GPT-5 series
	'gpt-5',
	'gpt-5-2025-08-07',
	'gpt-5-mini',
	'gpt-5-mini-2025-08-07',
	'gpt-5-nano',
	'gpt-5-nano-2025-08-07',
	'gpt-5-chat-latest',
	// GPT-4.1 series
	'gpt-4.1',
	'gpt-4.1-2025-04-14',
	'gpt-4.1-mini',
	'gpt-4.1-mini-2025-04-14',
	'gpt-4.1-nano',
	'gpt-4.1-nano-2025-04-14',
	// GPT-4o series
	'gpt-4o',
	'gpt-4o-2024-05-13',
	'gpt-4o-2024-08-06',
	'gpt-4o-2024-11-20',
	'gpt-4o-audio-preview',
	'gpt-4o-audio-preview-2024-10-01',
	'gpt-4o-audio-preview-2024-12-17',
	'gpt-4o-search-preview',
	'gpt-4o-search-preview-2025-03-11',
	'gpt-4o-mini-search-preview',
	'gpt-4o-mini-search-preview-2025-03-11',
	'gpt-4o-mini',
	'gpt-4o-mini-2024-07-18',
	// GPT-4 series
	'gpt-4-turbo',
	'gpt-4-turbo-2024-04-09',
	'gpt-4-turbo-preview',
	'gpt-4-0125-preview',
	'gpt-4-1106-preview',
	'gpt-4',
	'gpt-4-0613',
	// GPT-4.5 series
	'gpt-4.5-preview',
	'gpt-4.5-preview-2025-02-27',
	// GPT-3.5 series
	'gpt-3.5-turbo-0125',
	'gpt-3.5-turbo',
	'gpt-3.5-turbo-1106',
	// Other
	'chatgpt-4o-latest',
] as const;

/**
 * Determine OpenAI model icon identifier based on model ID.
 * Returns the appropriate icon identifier for @lobehub/icons ModelIcon component.
 * 
 * The returned value should match the first keyword in @lobehub/icons modelMappings
 * (with '^' prefix removed). See SafeIconWrapper.tsx for details on how to find correct values.
 * 
 * @param modelId - Model ID string
 * @returns Icon identifier compatible with @lobehub/icons modelMappings keywords[0]
 */
export function getOpenAIAvatarType(modelId: string): string {
	// O series (o1, o3, o4, etc.)
	if (/^o[1-9]/.test(modelId)) {
		return 'o1';
	}
	
	// GPT-5 series
	if (modelId.startsWith('gpt-5')) {
		return 'gpt-5';
	}
	
	// GPT-4 series (including GPT-4o, GPT-4.1, GPT-4.5, etc.)
	if (modelId.startsWith('gpt-4')) {
		return 'gpt-4';
	}
	
	// GPT-3.5 series
	if (modelId.startsWith('gpt-3.5')) {
		return 'gpt-3.5';
	}
	
	// GPT-3 series (legacy)
	if (modelId.startsWith('gpt-3')) {
		return 'gpt-3.5';
	}
	
	// Default fallback - return original modelId, let @lobehub/icons handle it
	return modelId;
}

export interface OpenAIChatServiceOptions {
	baseUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
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
		return 'openai';
	}

	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		const messages = toAiSdkMessages(request.messages);
		const systemMessage = extractSystemMessage(request.messages);

		const result = await generateText({
			model: this.client(request.model) as unknown as LanguageModel,
			messages,
			system: systemMessage,
			temperature: request.outputControl?.temperature,
			topP: request.outputControl?.topP,
			presencePenalty: request.outputControl?.presencePenalty,
			frequencyPenalty: request.outputControl?.frequencyPenalty,
			...(request.outputControl?.maxOutputTokens !== undefined && { maxTokens: request.outputControl.maxOutputTokens }),
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
			temperature: request.outputControl?.temperature,
			topP: request.outputControl?.topP,
			presencePenalty: request.outputControl?.presencePenalty,
			frequencyPenalty: request.outputControl?.frequencyPenalty,
			...(request.outputControl?.maxOutputTokens !== undefined && { maxTokens: request.outputControl.maxOutputTokens }),
		});

		return streamTextToAIStreamEvents(result, request.model);
	}

	async getAvailableModels(): Promise<ModelMetaData[]> {
		// Fallback: Use known model IDs from @ai-sdk/openai type definitions
		// This ensures we have a comprehensive list even when API fetch fails
		return KNOWN_OPENAI_CHAT_MODELS.map((modelId) => ({
			id: modelId,
			displayName: modelId,
			// Set icon based on model type for OpenAI.Avatar component
			icon: getOpenAIAvatarType(modelId),
		}));
	}

	getProviderMetadata(): ProviderMetaData {
		return {
			id: 'openai',
			name: 'OpenAI',
			defaultBaseUrl: OPENAI_DEFAULT_BASE,
			icon: 'openai',
		};
	}

	async generateEmbeddings(texts: string[], model: string): Promise<number[][]> {
		const result = await embedMany({
			model: this.client.textEmbeddingModel(model) as unknown as EmbeddingModel<string>,
			values: texts,
		});

		return result.embeddings;
	}
}
