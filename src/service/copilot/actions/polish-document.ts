import { Sparkles } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const polishDocumentAction: CopilotAction = {
	id: 'polish',
	label: 'Polish Document',
	description: 'Improve clarity and style',
	icon: Sparkles,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.selection) return 0.8;
		if (ctx.wordCount > 200) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().manager;
		const vars = { content: ctx.scope === 'selection' ? ctx.selection! : ctx.content, title: ctx.title, scope: ctx.scope };
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.DocPolish, vars)) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: null as any, // Set in actions/index.ts after panel import
};
