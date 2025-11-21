import { AIModelId } from '../types-models';
import { LLMResponse, ProviderContentPart, LLMMessage, LLMRequest } from './types';
import { AIStreamEvent } from './types-events';

export class NoopChatProvider {
	async blockChat(request: LLMRequest): Promise<LLMResponse> {
		console.warn('LLM chat service not configured, returning synthesized response', request);
		return {
			content: this.flattenMessages(request.messages) || 'LLM service not configured.',
			model: request.model,
		};
	}

	async *streamChat(request: LLMRequest): AsyncGenerator<AIStreamEvent> {
		const result = await this.blockChat(request);
		if (result.content) {
			yield {
				type: 'delta',
				text: result.content,
				model: result.model,
			};
		}
		yield {
			type: 'complete',
			model: result.model,
			usage: result.usage,
		};
	}

	private flattenMessages(messages: LLMMessage[]): string {
		const lines: string[] = [];
		for (const message of messages) {
			const rolePrefix = message.role.toUpperCase();
			const content = message.content.map((part) => this.describePart(part)).filter(Boolean).join('\n');
			lines.push(`${rolePrefix}:\n${content || '(empty)'}`);
		}
		return lines.join('\n\n');
	}

	private describePart(part: ProviderContentPart): string {
		switch (part.type) {
			case 'text':
				return part.text;
			case 'document':
				return `[Document${part.name ? `: ${part.name}` : ''}]\n${part.text}`;
			case 'inline_image':
				return `[Image Attachment | MediaType: ${part.mediaType}, size: ${part.data.length} base64 chars]`;
			case 'image_url':
				return `[Image Attachment URL] ${part.url}`;
			default:
				return '';
		}
	}
}

export class NoopApplicationProvider {
	async summarize(params: { model: AIModelId; text: string }): Promise<string> {
		console.warn('Application service not configured, returning truncated text', params.model);
		return params.text.slice(0, 800);
	}

	async generateTitle(params: { model: AIModelId; messages: Array<{ role: string; content: string }> }): Promise<string> {
		console.warn('Application service not configured, using fallback title', params.model);
		const firstUserMessage = params.messages.find(m => m.role === 'user');
		if (firstUserMessage) {
			return firstUserMessage.content.slice(0, 50) || 'New Conversation';
		}
		return 'New Conversation';
	}

	async generateConvName(params: { conversation: { id: string; messages: Array<{ role: string; content: string }> } }): Promise<string> {
		// Mock implementation - return example result
		return 'exampleConvTitleResult';
	}
}

