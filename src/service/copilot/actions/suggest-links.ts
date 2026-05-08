import { Link2 } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { linkSuggestionsSchema } from '../copilot-schemas';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

async function toJsonSchema(zodSchema: unknown) {
	const { zodToJsonSchema } = await import('zod-to-json-schema');
	return zodToJsonSchema(zodSchema as import('zod').ZodTypeAny);
}

export const suggestLinksAction: CopilotAction = {
	id: 'suggest-links',
	label: 'Suggest Links',
	description: 'Find potential wiki-link connections',
	icon: Link2,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.isOrphan) return 0.8;
		if (ctx.links.length < 3) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().manager;
		const app = AppContext.getInstance().app;
		const cache = app.metadataCache.getFileCache(ctx.file);
		const existingLinks = (cache?.links ?? []).map(l => l.link).join(', ');
		const result = await aiManager.queryStructured(
			PromptId.DocSuggestLinks,
			{ content: ctx.content, title: ctx.title, existingLinks },
			await toJsonSchema(linkSuggestionsSchema),
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: null as any,
};
