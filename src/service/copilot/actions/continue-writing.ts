import { ChevronRight } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const continueWritingAction: CopilotAction = {
	id: 'continue-writing',
	label: 'Continue Writing',
	description: 'Continue writing from where you left off',
	icon: ChevronRight,
	category: 'writing',

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount === 0) return 'Document is empty — write something first';
		return null;
	},

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount >= 50 && ctx.wordCount <= 2000) return 0.6;
		if (ctx.wordCount > 0) return 0.4;
		return 0.1;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const vars = { content: ctx.content, title: ctx.title };
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.WritingContinue, vars)) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: null as any, // Set in actions/index.ts after panel import
};
