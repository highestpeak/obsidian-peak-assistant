import { AlignLeft } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const summarizeAction: CopilotAction = {
	id: 'summarize',
	label: 'Summarize',
	description: 'Generate a concise summary of the document',
	icon: AlignLeft,
	category: 'document',

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 100) return 'Document is too short to summarize (minimum 100 words).';
		return null;
	},

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 1500) return 0.8;
		if (ctx.wordCount > 800) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const vars = {
			content: ctx.scope === 'selection' ? ctx.selection! : ctx.content,
			title: ctx.title,
			scope: ctx.scope,
			length: 'short',
		};
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.DocSummarize, vars)) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: null as any, // Set in actions/index.ts after panel import
};
