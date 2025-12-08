import { AIModelId } from '../types-models';
import { ChatRole } from '../types';
import { AIStreamEvent } from './types-events';

export type LLMProvider = 'openai' | 'gemini' | 'claude' | 'openrouter' | 'ollama' | 'other';

export interface LLMProviderConfig {
	apiKey?: string;
	baseUrl?: string;
}

export type ProviderContentPart =
	| {
			type: 'text';
			text: string;
	  }
	| {
			type: 'document';
			text: string;
			name?: string;
	  }
	| {
			type: 'inline_image';
			mediaType: string;
			data: string;
			alt?: string;
	  }
	| {
			type: 'image_url';
			url: string;
			alt?: string;
	  };

export interface LLMMessage {
	role: ChatRole;
	content: ProviderContentPart[];
}

export interface LLMRequest {
	provider: LLMProvider;
	model: string;
	messages: LLMMessage[];
}

export interface LLMUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface LLMResponse {
	content: string;
	model: string;
	usage?: LLMUsage;
}

export interface ProviderModelInfo {
	id: AIModelId;
	displayName: string;
}

export interface ProviderMetadata {
	id: LLMProvider;
	name: string;
	defaultBaseUrl: string;
}

export interface LLMProviderService {
	blockChat(request: LLMRequest): Promise<LLMResponse>;
	streamChat?(request: LLMRequest): AsyncGenerator<AIStreamEvent>;
	/**
	 * Get provider ID
	 */
	getProviderId(): LLMProvider;
	/**
	 * Get list of available models for this provider
	 * Returns empty array if models cannot be fetched or provider doesn't support listing
	 */
	getAvailableModels?(): Promise<ProviderModelInfo[]>;
	/**
	 * Get provider metadata (name and default baseUrl)
	 */
	getProviderMetadata?(): ProviderMetadata;
}
