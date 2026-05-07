import { Search } from 'lucide-react';

import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

export interface FindRelatedResult {
	items: Array<{
		path: string;
		title: string;
		score: number;
		excerpt: string;
	}>;
}

export const findRelatedAction: CopilotAction = {
	id: 'find-related',
	label: 'Find Related',
	description: 'Find semantically related notes in your vault',
	icon: Search,
	category: 'vault',

	relevance(ctx: DocumentContext): number {
		if (ctx.isOrphan) return 0.8;
		if (ctx.links.length < 3) return 0.5;
		return 0.3;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const searchClient = AppContext.getInstance().searchClient;
		const response = await searchClient.vectorSearch({
			text: ctx.content.slice(0, 1000),
			scopeMode: 'vault',
			topK: 10,
		});
		const items = response.items
			.filter(item => item.path !== ctx.file.path)
			.map(item => ({
				path: item.path,
				title: item.title || item.path.replace(/\.md$/, '').split('/').pop() || item.path,
				score: item.finalScore ?? item.score ?? 0,
				excerpt: item.content?.slice(0, 200) ?? item.highlight?.text ?? '',
			}));
		return { type: 'structured', data: { items } as FindRelatedResult };
	},

	ResultPanel: null as any,
};
