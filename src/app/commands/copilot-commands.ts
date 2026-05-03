// src/app/commands/copilot-commands.ts
import type { Command } from 'obsidian';
import { Notice } from 'obsidian';
import type { ViewManager } from '@/app/view/ViewManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { CopilotResultModal } from '@/ui/view/copilot/CopilotResultModal';
import { getSelectedTextFromActiveEditor } from '@/core/utils/obsidian-utils';
import { isDesktop } from '@/core/platform';
import { reviewResultSchema, linkSuggestionsSchema, splitPlanSchema, tagSuggestionsSchema } from '@/service/copilot/copilot-schemas';
import { AppContext } from '@/app/context/AppContext';
import { CopilotActionEvent } from '@/core/eventBus';

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
				const modal = new CopilotResultModal(ctx.app, {
					type: 'polish', file: ctx.file, scope: ctx.scope,
					originalContent: ctx.input, selectedText: ctx.selected,
				});
				modal.open();
				try {
					let fullText = '';
					for await (const chunk of aiManager.queryTextStream(PromptId.DocPolish, {
						content: ctx.input, title: ctx.file.basename, scope: ctx.scope,
					})) {
						if (chunk.type === 'delta') {
							fullText += chunk.text;
							modal.updateProgress(fullText);
						}
					}
					modal.setResult(fullText);
					AppContext.getEventBus().dispatch(new CopilotActionEvent({ action: 'polish', targetFile: ctx.file.path, resultSummary: `Polished: ${ctx.file.basename}` }));
				} catch (e) {
					modal.setError(e as Error);
				}
			},
		},
		{
			id: 'peak-copilot-review',
			name: 'Copilot: Review Article',
			callback: async () => {
				const ctx = await getContext();
				if (!ctx) return;
				const modal = new CopilotResultModal(ctx.app, {
					type: 'review', file: ctx.file, scope: ctx.scope,
					originalContent: ctx.input, selectedText: ctx.selected,
				});
				modal.open();
				try {
					const result = await aiManager.queryStructured(
						PromptId.DocReview,
						{ content: ctx.input, title: ctx.file.basename, scope: ctx.scope },
						await toJsonSchema(reviewResultSchema),
					);
					modal.setResult(result);
					AppContext.getEventBus().dispatch(new CopilotActionEvent({ action: 'review', targetFile: ctx.file.path, resultSummary: `Reviewed: ${ctx.file.basename}` }));
				} catch (e) {
					modal.setError(e as Error);
				}
			},
		},
		{
			id: 'peak-copilot-suggest-links',
			name: 'Copilot: Suggest Links',
			callback: async () => {
				const ctx = await getContext();
				if (!ctx) return;
				const cache = ctx.app.metadataCache.getFileCache(ctx.file);
				const existingLinks = (cache?.links ?? []).map(l => l.link).join(', ');
				const modal = new CopilotResultModal(ctx.app, {
					type: 'suggest-links', file: ctx.file, scope: ctx.scope,
					originalContent: ctx.content,
				});
				modal.open();
				try {
					const result = await aiManager.queryStructured(
						PromptId.DocSuggestLinks,
						{ content: ctx.input, title: ctx.file.basename, existingLinks },
						await toJsonSchema(linkSuggestionsSchema),
					);
					modal.setResult(result);
					AppContext.getEventBus().dispatch(new CopilotActionEvent({ action: 'suggest-links', targetFile: ctx.file.path, resultSummary: `Suggested links for: ${ctx.file.basename}` }));
				} catch (e) {
					modal.setError(e as Error);
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
				const modal = new CopilotResultModal(ctx.app, {
					type: 'split', file: ctx.file, scope: 'full',
					originalContent: ctx.content,
				});
				modal.open();
				try {
					const result = await aiManager.queryStructured(
						PromptId.DocSplitSuggestion,
						{ content: ctx.content, title: ctx.file.basename, wordCount },
						await toJsonSchema(splitPlanSchema),
					);
					modal.setResult(result);
					AppContext.getEventBus().dispatch(new CopilotActionEvent({ action: 'split', targetFile: ctx.file.path, resultSummary: `Suggested split for: ${ctx.file.basename}` }));
				} catch (e) {
					modal.setError(e as Error);
				}
			},
		},
		{
			id: 'peak-copilot-suggest-tags',
			name: 'Copilot: Suggest Tags',
			callback: async () => {
				const ctx = await getContext();
				if (!ctx) return;
				const modal = new CopilotResultModal(ctx.app, {
					type: 'suggest-tags', file: ctx.file, scope: ctx.scope,
					originalContent: ctx.input,
				});
				modal.open();
				try {
					const result = await aiManager.queryStructured(
						PromptId.DocSuggestTags,
						{ content: ctx.input, title: ctx.file.basename },
						await toJsonSchema(tagSuggestionsSchema),
					);
					modal.setResult(result);
					AppContext.getEventBus().dispatch(new CopilotActionEvent({ action: 'suggest-tags', targetFile: ctx.file.path, resultSummary: `Suggested tags for: ${ctx.file.basename}` }));
				} catch (e) {
					modal.setError(e as Error);
				}
			},
		},
	];
}
