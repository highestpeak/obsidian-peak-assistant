import { Languages } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/context/AppContext';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

/** Returns true if >10% of characters are CJK. */
function hasCJKMajority(text: string): boolean {
	const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
	const matches = text.match(cjkRegex);
	if (!matches) return false;
	return matches.length / text.length > 0.1;
}

function detectTargetLanguage(content: string): string {
	return hasCJKMajority(content) ? 'English' : '中文';
}

export const translateAction: CopilotAction = {
	id: 'translate',
	label: 'Translate',
	description: 'Translate document content to another language',
	icon: Languages,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		const content = ctx.scope === 'selection' ? ctx.selection ?? ctx.content : ctx.content;
		// Non-Latin content (CJK) is more likely to benefit from translation
		if (hasCJKMajority(content)) return 0.6;
		return 0.3;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().manager;
		const content = ctx.scope === 'selection' ? ctx.selection! : ctx.content;
		const targetLanguage = detectTargetLanguage(content);
		const vars = {
			content,
			title: ctx.title,
			scope: ctx.scope,
			targetLanguage,
		};
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.DocTranslate, vars)) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: null as any, // Set in actions/index.ts after panel import
};
