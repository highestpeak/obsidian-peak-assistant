import { HelpCircle } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { knowledgeGapsSchema } from '../copilot-schemas';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

async function toJsonSchema(zodSchema: unknown) {
	const { zodToJsonSchema } = await import('zod-to-json-schema');
	return zodToJsonSchema(zodSchema as import('zod').ZodTypeAny);
}

export const knowledgeGapsAction: CopilotAction = {
	id: 'knowledge-gaps',
	label: 'Knowledge Gaps',
	description: 'Identify missing topics and knowledge gaps',
	icon: HelpCircle,
	category: 'vault',

	relevance(ctx: DocumentContext): number {
		if (ctx.headingCount > 5) return 0.7;
		if (ctx.headingCount > 3) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const app = AppContext.getInstance().app;

		// Gather related note titles via metadataCache link resolution
		const cache = app.metadataCache.getFileCache(ctx.file);
		const resolvedLinks = (cache?.links ?? [])
			.map(l => {
				const resolved = app.metadataCache.getFirstLinkpathDest(l.link, ctx.file.path);
				return resolved?.basename ?? l.link;
			});
		const relatedNotes = [...new Set(resolvedLinks)].join(', ');

		const result = await aiManager.queryStructured(
			PromptId.VaultKnowledgeGaps,
			{ content: ctx.content, title: ctx.title, relatedNotes },
			await toJsonSchema(knowledgeGapsSchema),
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: null as any,
};
