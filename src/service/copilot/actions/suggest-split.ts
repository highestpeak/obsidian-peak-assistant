import { GitFork } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { splitPlanSchema } from '../copilot-schemas';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

async function toJsonSchema(zodSchema: unknown) {
	const { zodToJsonSchema } = await import('zod-to-json-schema');
	return zodToJsonSchema(zodSchema as import('zod').ZodTypeAny);
}

export const suggestSplitAction: CopilotAction = {
	id: 'suggest-split',
	label: 'Suggest Split',
	description: 'Propose how to split a long document',
	icon: GitFork,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 2000) return 0.8;
		if (ctx.wordCount > 1000) return 0.5;
		return 0.2;
	},

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 500) return 'Document is too short to split (< 500 words)';
		return null;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().manager;
		const result = await aiManager.queryStructured(
			PromptId.DocSplitSuggestion,
			{ content: ctx.content, title: ctx.title, wordCount: ctx.wordCount },
			await toJsonSchema(splitPlanSchema),
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: null as any,
};
