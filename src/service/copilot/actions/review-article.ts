import { MessageSquareText } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { reviewResultSchema } from '../copilot-schemas';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

async function toJsonSchema(zodSchema: unknown) {
	const { zodToJsonSchema } = await import('zod-to-json-schema');
	return zodToJsonSchema(zodSchema as import('zod').ZodTypeAny);
}

export const reviewArticleAction: CopilotAction = {
	id: 'review',
	label: 'Review Article',
	description: 'Get structural and content feedback',
	icon: MessageSquareText,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 500) return 0.7;
		if (ctx.wordCount > 300) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const input = ctx.scope === 'selection' ? ctx.selection! : ctx.content;
		const result = await aiManager.queryStructured(
			PromptId.DocReview,
			{ content: input, title: ctx.title, scope: ctx.scope },
			await toJsonSchema(reviewResultSchema),
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: null as any,
};
