import { PenLine } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const rewriteSelectionAction: CopilotAction = {
	id: 'rewrite-selection',
	label: 'Rewrite Selection',
	description: 'Rewrite selected text for clarity and style',
	icon: PenLine,
	category: 'writing',

	guard(ctx: DocumentContext): string | null {
		if (!ctx.selection) return 'Select text to rewrite';
		return null;
	},

	relevance(ctx: DocumentContext): number {
		if (ctx.selection) return 0.8;
		return 0.1;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const vars = {
			selection: ctx.selection!,
			content: ctx.content,
			title: ctx.title,
			style: 'concise',
		};
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.WritingRewrite, vars)) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: null as any, // Set in actions/index.ts after panel import
};
