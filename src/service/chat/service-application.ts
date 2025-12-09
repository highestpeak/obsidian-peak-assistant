import { LLMProviderService } from './providers/types';

export interface LLMApplicationService {
	summarize(params: { provider: string; model: string; text: string; }): Promise<string>;
	generateTitle(params: { provider: string; model: string; messages: Array<{ role: string; content: string }> }): Promise<string>;
	generateConvName(params: { conversation: { id: string; messages: Array<{ role: string; content: string }> } }): Promise<string>;
}

export class PromptApplicationService implements LLMApplicationService {
	constructor(
		private readonly chat: LLMProviderService
	) {}

	async summarize(params: { provider: string; model: string; text: string }): Promise<string> {
		try {
			const completion = await this.chat.blockChat({
				provider: params.provider,
				model: params.model,
				messages: [
					{
						role: 'system',
						content: [{ type: 'text', text: 'You are a concise summarizer. Keep key facts and actions.' }],
					},
					{
						role: 'user',
						content: [{ type: 'text', text: params.text }],
					},
				],
			});
			return completion.content.trim();
		} catch (error) {
			console.warn('Summarize request failed', error);
			return params.text.slice(0, 800);
		}
	}

	async generateTitle(params: { provider: string; model: string; messages: Array<{ role: string; content: string }> }): Promise<string> {
		try {
			// Build conversation context from messages (limit to first few messages for efficiency)
			const contextMessages = params.messages.slice(0, 4).map(msg => {
				const role = msg.role === 'assistant' ? 'Assistant' : msg.role === 'user' ? 'User' : 'System';
				return `${role}: ${msg.content}`;
			}).join('\n\n');

			const completion = await this.chat.blockChat({
				provider: params.provider,
				model: params.model,
				messages: [
					{
						role: 'system',
						content: [{ type: 'text', text: 'You are a helpful assistant. Generate a concise, descriptive title (maximum 50 characters) for this conversation based on the initial messages. Return only the title, no quotes or additional text.' }],
					},
					{
						role: 'user',
						content: [{ type: 'text', text: `Generate a title for this conversation:\n\n${contextMessages}` }],
					},
				],
			});
			const title = completion.content.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
			return title.slice(0, 50) || 'New Conversation'; // Fallback to default if empty
		} catch (error) {
			console.warn('Title generation failed', error);
			// Fallback: use first user message or default
			const firstUserMessage = params.messages.find(m => m.role === 'user');
			if (firstUserMessage) {
				return firstUserMessage.content.slice(0, 50) || 'New Conversation';
			}
			return 'New Conversation';
		}
	}

	/**
	 * Generate conversation name based on conversation content
	 * Mock implementation that returns exampleConvTitleResult
	 */
	async generateConvName(params: { conversation: { id: string; messages: Array<{ role: string; content: string }> } }): Promise<string> {
		// Mock implementation - return example result
		return 'exampleConvTitleResult';
	}
}
