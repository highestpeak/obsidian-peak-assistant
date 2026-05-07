import { BookOpen } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { addEvidenceSchema } from '../copilot-schemas';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

async function toJsonSchema(zodSchema: unknown) {
	const { zodToJsonSchema } = await import('zod-to-json-schema');
	return zodToJsonSchema(zodSchema as import('zod').ZodTypeAny);
}

export const addEvidenceAction: CopilotAction = {
	id: 'add-evidence',
	label: 'Add Evidence',
	description: 'Find supporting evidence from your vault',
	icon: BookOpen,
	category: 'writing',

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 50) return 'Write at least 50 words before searching for evidence';
		return null;
	},

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 500) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const searchClient = AppContext.getInstance().searchClient;
		const aiManager = AppContext.getInstance().aiServiceManager;

		// Phase 1: Vector search for related content
		const queryText = ctx.selection ?? ctx.content.slice(0, 500);
		const searchResult = await searchClient.vectorSearch({
			text: queryText,
			topK: 10,
			scopeMode: 'vault',
		});

		// Filter out the current file
		const candidates = searchResult.items.filter(item => item.path !== ctx.file.path);

		if (candidates.length === 0) {
			return { type: 'structured', data: { evidence: [] } };
		}

		// Phase 2: LLM selects best evidence
		const sources = candidates
			.map((item, i) => `[${i + 1}] ${item.title} (${item.path})\n${item.content ?? item.highlight?.text ?? ''}`)
			.join('\n\n');

		const context = ctx.selection ?? ctx.content.slice(0, 1000);

		const result = await aiManager.queryStructured(
			PromptId.WritingAddEvidence,
			{ context, sources },
			await toJsonSchema(addEvidenceSchema),
		);

		return { type: 'structured', data: result };
	},

	ResultPanel: null as any, // Set in actions/index.ts after panel import
};
