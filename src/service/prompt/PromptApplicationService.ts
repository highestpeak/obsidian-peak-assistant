import { PromptService } from './PromptService';
import { PromptId } from './PromptId';

/**
 * Service for prompt-related application functions.
 * Collects functions that don't belong to a specific domain.
 */
export class PromptApplicationService {
	constructor(
		private readonly promptService: PromptService,
	) {}

	/**
	 * Rewrite prompt using library references.
	 */
	async rewritePrompt(params: {
		originalPrompt: string;
		qualityIssues: string[];
		provider: string;
		model: string;
	}): Promise<string> {
		try {
			return await this.promptService.chatWithPrompt(
				PromptId.PromptRewriteWithLibrary,
				{
					originalPrompt: params.originalPrompt,
					qualityIssues: params.qualityIssues,
				},
				params.provider,
				params.model
			);
		} catch (error) {
			console.warn('[PromptApplicationService] Failed to rewrite prompt:', error);
			return params.originalPrompt;
		}
	}
}

