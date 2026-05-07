import { Layers } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export interface SynthesizeResult {
	text: string;
	sources: Array<{ path: string; title: string }>;
}

export const synthesizeTopicAction: CopilotAction = {
	id: 'synthesize-topic',
	label: 'Synthesize Topic',
	description: 'Synthesize a topic overview from related notes',
	icon: Layers,
	category: 'vault',

	relevance(ctx: DocumentContext): number {
		const titleLower = ctx.title.toLowerCase();
		if (/moc|overview|summary|index/.test(titleLower)) return 0.8;
		if (ctx.tags.length > 0) return 0.4;
		return 0.2;
	},

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 50) return 'Document is too short to synthesize (< 50 words)';
		return null;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const searchClient = AppContext.getInstance().searchClient;

		// Phase 1: vector search for related sources
		const response = await searchClient.vectorSearch({
			text: ctx.content.slice(0, 1000),
			scopeMode: 'vault',
			topK: 8,
		});
		const sources = response.items
			.filter(item => item.path !== ctx.file.path)
			.map(item => ({
				path: item.path,
				title: item.title || item.path.replace(/\.md$/, '').split('/').pop() || item.path,
				excerpt: item.content?.slice(0, 500) ?? '',
			}));

		const sourcesText = sources
			.map((s, i) => `[${i + 1}] ${s.title}\n${s.excerpt}`)
			.join('\n\n');

		// Phase 2: LLM synthesis via streaming
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.VaultSynthesize, {
			topic: ctx.title,
			sources: sourcesText,
		})) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}

		const result: SynthesizeResult = {
			text: fullText,
			sources: sources.map(s => ({ path: s.path, title: s.title })),
		};
		return { type: 'structured', data: result };
	},

	ResultPanel: null as any,
};
