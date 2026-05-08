import { Tag } from 'lucide-react';

import { TagSuggestionEngine } from '../TagSuggestionEngine';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

export const suggestTagsAction: CopilotAction = {
	id: 'suggest-tags',
	label: 'Suggest Tags',
	description: 'Analyze content and suggest relevant tags',
	icon: Tag,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.tags.length === 0) return 0.9;
		if (ctx.tags.length < 2) return 0.6;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().manager;
		const engine = new TagSuggestionEngine(aiManager);
		const ranked = await engine.suggestTags(ctx.file.path, ctx.content, ctx.title);
		const result = {
			suggestions: ranked.map(r => ({
				tag: r.tag,
				confidence: r.confidence,
				reason: r.reason,
				source: r.sources[0]?.source ?? 'content',
			})),
			summary: `Found ${ranked.length} tag suggestions using content analysis, graph neighbors, and folder history.`,
		};
		return { type: 'structured', data: result };
	},

	ResultPanel: null as any,
};
