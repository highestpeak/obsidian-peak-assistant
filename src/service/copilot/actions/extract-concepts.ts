import { Lightbulb } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { extractConceptsSchema } from '../copilot-schemas';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

async function toJsonSchema(zodSchema: unknown) {
	const { zodToJsonSchema } = await import('zod-to-json-schema');
	return zodToJsonSchema(zodSchema as import('zod').ZodTypeAny);
}

export const extractConceptsAction: CopilotAction = {
	id: 'extract-concepts',
	label: 'Extract Concepts',
	description: 'Identify key concepts and definitions',
	icon: Lightbulb,
	category: 'document',

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 100) return 'Document is too short to extract concepts from (minimum 100 words).';
		return null;
	},

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 1000 && ctx.tags.length < 2) return 0.7;
		if (ctx.wordCount > 500) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().manager;
		const input = ctx.scope === 'selection' ? ctx.selection! : ctx.content;
		const result = await aiManager.queryStructured(
			PromptId.DocExtractConcepts,
			{ content: input, title: ctx.title },
			await toJsonSchema(extractConceptsSchema),
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: null as any,
};
