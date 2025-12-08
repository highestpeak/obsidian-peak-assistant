import { ProviderMetadata, LLMProviderService } from './types';
import { OpenAIChatService } from './openai';
import { ClaudeChatService } from './claude';
import { GeminiChatService } from './gemini';
import { OpenRouterChatService } from './openrouter';
import { OllamaChatService } from './ollama';

export function trimTrailingSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

export async function safeReadError(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch (error) {
		console.warn('Failed to read error response', error);
		return '';
	}
}

/**
 * Get metadata for all available providers
 */
export function getAllProviderMetadata(): ProviderMetadata[] {
	const providers: Array<LLMProviderService> = [
		new OpenAIChatService({}),
		new ClaudeChatService({}),
		new GeminiChatService({}),
		new OpenRouterChatService({}),
		new OllamaChatService({}),
	];

	return providers
		.map((service) => {
			if (service.getProviderMetadata) {
				return service.getProviderMetadata();
			}
			return null;
		})
		.filter((metadata): metadata is ProviderMetadata => metadata !== null);
}

