// src/app/commands/copilot-commands.ts
import type { Command } from 'obsidian';
import { Notice } from 'obsidian';
import type { ViewManager } from '@/app/view/ViewManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { CopilotResultModal } from '@/ui/view/copilot/CopilotResultModal';
import { getSelectedTextFromActiveEditor } from '@/core/utils/obsidian-utils';
import { isDesktop } from '@/core/platform';
import { reviewResultSchema, linkSuggestionsSchema, splitPlanSchema } from '@/service/copilot/copilot-schemas';

function openProgressNotice(initial: string): { setMessage: (text: string) => void; hide: () => void } {
	const notice = new Notice(initial, 0);
	return {
		setMessage: (text: string) => { notice.noticeEl.textContent = text; },
		hide: () => notice.hide(),
	};
}

export function buildCopilotCommands(viewManager: ViewManager, aiManager: AIServiceManager): Command[] {
	if (!isDesktop()) return [];

	const getContext = async () => {
		const app = viewManager.getApp();
		const file = app.workspace.getActiveFile();
		if (!file) { new Notice('Open a document first.'); return null; }
		const content = await app.vault.cachedRead(file);
		const selected = getSelectedTextFromActiveEditor(app) ?? undefined;
		const scope = selected ? 'selection' as const : 'full' as const;
		const input = selected ?? content;
		return { app, file, content, selected, scope, input };
	};

	const toJsonSchema = async (zodSchema: unknown) => {
		const { zodToJsonSchema } = await import('zod-to-json-schema');
		return zodToJsonSchema(zodSchema as import('zod').ZodTypeAny);
	};

	return [
		{
			id: 'peak-copilot-polish',
			name: 'Copilot: Polish Document',
			callback: async () => {
				const ctx = await getContext();
				if (!ctx) return;
				const ui = openProgressNotice('Polishing document...');
				try {
					const result = await aiManager.queryText(PromptId.DocPolish, {
						content: ctx.input, title: ctx.file.basename, scope: ctx.scope,
					});
					ui.hide();
					new CopilotResultModal(ctx.app, {
						type: 'polish', result, file: ctx.file, scope: ctx.scope,
						originalContent: ctx.input, selectedText: ctx.selected,
					}).open();
				} catch (e) {
					ui.hide();
					new Notice(`Polish failed: ${(e as Error).message}`);
				}
			},
		},
		{
			id: 'peak-copilot-review',
			name: 'Copilot: Review Article',
			callback: async () => {
				const ctx = await getContext();
				if (!ctx) return;
				const ui = openProgressNotice('Reviewing article...');
				try {
					const result = await aiManager.queryStructured(
						PromptId.DocReview,
						{ content: ctx.input, title: ctx.file.basename, scope: ctx.scope },
						await toJsonSchema(reviewResultSchema),
					);
					ui.hide();
					new CopilotResultModal(ctx.app, {
						type: 'review', result, file: ctx.file, scope: ctx.scope,
						originalContent: ctx.input, selectedText: ctx.selected,
					}).open();
				} catch (e) {
					ui.hide();
					new Notice(`Review failed: ${(e as Error).message}`);
				}
			},
		},
		{
			id: 'peak-copilot-suggest-links',
			name: 'Copilot: Suggest Links',
			callback: async () => {
				const ctx = await getContext();
				if (!ctx) return;
				// Extract existing links from metadata cache
				const cache = ctx.app.metadataCache.getFileCache(ctx.file);
				const existingLinks = (cache?.links ?? []).map(l => l.link).join(', ');
				const ui = openProgressNotice('Analyzing links...');
				try {
					const result = await aiManager.queryStructured(
						PromptId.DocSuggestLinks,
						{ content: ctx.input, title: ctx.file.basename, existingLinks },
						await toJsonSchema(linkSuggestionsSchema),
					);
					ui.hide();
					new CopilotResultModal(ctx.app, {
						type: 'suggest-links', result, file: ctx.file, scope: ctx.scope,
						originalContent: ctx.content,
					}).open();
				} catch (e) {
					ui.hide();
					new Notice(`Link suggestion failed: ${(e as Error).message}`);
				}
			},
		},
		{
			id: 'peak-copilot-split',
			name: 'Copilot: Suggest Split',
			callback: async () => {
				const ctx = await getContext();
				if (!ctx) return;
				const wordCount = ctx.content.split(/\s+/).filter(Boolean).length;
				if (wordCount < 500) {
					new Notice('Document is too short to split (< 500 words).');
					return;
				}
				const ui = openProgressNotice('Analyzing structure...');
				try {
					const result = await aiManager.queryStructured(
						PromptId.DocSplitSuggestion,
						{ content: ctx.content, title: ctx.file.basename, wordCount },
						await toJsonSchema(splitPlanSchema),
					);
					ui.hide();
					new CopilotResultModal(ctx.app, {
						type: 'split', result, file: ctx.file, scope: 'full',
						originalContent: ctx.content,
					}).open();
				} catch (e) {
					ui.hide();
					new Notice(`Split analysis failed: ${(e as Error).message}`);
				}
			},
		},
	];
}
