import { AIModelId } from '../types-models';
import { ChatRole } from '../types';
import { AIStreamEvent } from './types-events';

export type LLMProvider = 'openai' | 'gemini' | 'claude' | 'openrouter' | 'other';

export interface LLMProviderConfig {
	apiKey: string;
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
	model: AIModelId;
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

export interface LLMProviderService {
	blockChat(request: LLMRequest): Promise<LLMResponse>;
	streamChat?(request: LLMRequest): AsyncGenerator<AIStreamEvent>;
}
