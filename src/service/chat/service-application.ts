import { AIModelId } from './types-models';
import { LLMProviderService } from './providers/types';

export interface LLMApplicationService {
	summarize(params: { model: AIModelId; text: string; }): Promise<string>;
}

export class PromptApplicationService implements LLMApplicationService {
	constructor(private readonly chat: LLMProviderService) {}

	async summarize(params: { model: AIModelId; text: string }): Promise<string> {
		try {
			const completion = await this.chat.blockChat({
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
}
