import {
	Sparkles, Tag, MessageSquareText, Link2, GitFork, Lightbulb, AlignLeft,
	Languages, Search, HelpCircle, Layers, Activity, ChevronRight, PenLine, BookOpen,
} from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/context/AppContext';
import { TagSuggestionEngine } from '../TagSuggestionEngine';
import {
	reviewResultSchema, splitPlanSchema,
	extractConceptsSchema, vaultHealthSchema,
} from '../copilot-schemas';
import { CopilotActionRegistry } from '../CopilotActionRegistry';
import type { CopilotAction, DocumentContext, ActionResult, ActionUsage } from '../CopilotActionRegistry';
import type { LLMUsage, LLMStreamEvent } from '@/core/providers/types';
import { buildCopilotAgentStream } from './agent-actions';

// ── Re-exported types (consumed by UI panels) ──────────────────────────

export interface FindRelatedResult {
	items: Array<{ path: string; title: string; score: number; excerpt: string }>;
}

export interface SynthesizeResult {
	text: string;
	sources: Array<{ path: string; title: string }>;
}

// ── Shared helpers ─────────────────────────────────────────────────────

async function toJsonSchema(zodSchema: unknown) {
	const { zodToJsonSchema } = await import('zod-to-json-schema');
	return zodToJsonSchema(zodSchema as import('zod').ZodTypeAny);
}

function toActionUsage(u?: LLMUsage): ActionUsage | undefined {
	if (!u) return undefined;
	return { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0 };
}

/** Run a queryTextStream prompt, yielding text-delta events and returning the final result. */
async function* streamAction(promptId: PromptId, vars: Record<string, any>, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent, ActionResult> {
	const mgr = AppContext.getInstance().manager;
	let fullText = '';
	let usage: ActionUsage | undefined;
	for await (const chunk of mgr.queryTextStream(promptId, vars, { signal })) {
		if (chunk.type === 'delta') {
			fullText += chunk.text;
			yield { type: 'text-delta', text: chunk.text } as LLMStreamEvent;
		} else if (chunk.type === 'done') {
			usage = toActionUsage(chunk.usage);
		}
	}
	return { type: 'stream' as const, text: fullText, usage };
}

/** Scoped content: selection if available, otherwise full content. */
function scopedContent(ctx: DocumentContext): string {
	return ctx.scope === 'selection' ? ctx.selection! : ctx.content;
}

// ── Translate helpers ──────────────────────────────────────────────────

function hasCJKMajority(text: string): boolean {
	const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
	const matches = text.match(cjkRegex);
	return !!matches && matches.length / text.length > 0.1;
}

// ── Action definitions ─────────────────────────────────────────────────

export const polishDocumentAction: CopilotAction = {
	id: 'polish', label: 'Polish Document', description: 'Improve clarity and style',
	icon: Sparkles, category: 'document',
	relevance: (ctx) => ctx.selection ? 0.8 : ctx.wordCount > 200 ? 0.5 : 0.2,
	execute: (ctx, signal) => streamAction(PromptId.DocPolish, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope }, signal),
	ResultPanel: null as any,
};

export const reviewArticleAction: CopilotAction = {
	id: 'review', label: 'Review Article', description: 'Get structural and content feedback',
	icon: MessageSquareText, category: 'document',
	relevance: (ctx) => ctx.wordCount > 500 ? 0.7 : ctx.wordCount > 300 ? 0.5 : 0.2,
	async *execute(ctx, signal) {
		let usage: ActionUsage | undefined;
		const result = await AppContext.getInstance().manager.queryStructured(
			PromptId.DocReview, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope },
			await toJsonSchema(reviewResultSchema),
			{ signal, usageCallback: u => { usage = toActionUsage(u); } },
		);
		return { type: 'structured', data: result, usage };
	},
	ResultPanel: null as any,
};

export const suggestLinksAction: CopilotAction = {
	id: 'suggest-links', label: 'Suggest Links', description: 'Find potential wiki-link connections',
	icon: Link2, category: 'document',
	relevance: (ctx) => ctx.isOrphan ? 0.8 : ctx.links.length < 3 ? 0.5 : 0.2,
	async *execute(ctx, signal) {
		const app = AppContext.getInstance().app;
		const cache = app.metadataCache.getFileCache(ctx.file);
		const existingLinks = (cache?.links ?? []).map(l => l.link).join(', ');

		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentSuggestLinks, {},
		);
		const userPrompt = [
			`## Document: "${ctx.title}"`,
			`Word count: ${ctx.wordCount}`,
			existingLinks ? `Existing links: ${existingLinks}` : 'No existing links.',
			'',
			'## Content',
			ctx.content,
		].join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
	ResultPanel: null as any,
};

export const suggestSplitAction: CopilotAction = {
	id: 'suggest-split', label: 'Suggest Split', description: 'Propose how to split a long document',
	icon: GitFork, category: 'document',
	relevance: (ctx) => ctx.wordCount > 2000 ? 0.8 : ctx.wordCount > 1000 ? 0.5 : 0.2,
	guard: (ctx) => ctx.wordCount < 500 ? 'Document is too short to split (< 500 words)' : null,
	async *execute(ctx, signal) {
		let usage: ActionUsage | undefined;
		const result = await AppContext.getInstance().manager.queryStructured(
			PromptId.DocSplitSuggestion, { content: ctx.content, title: ctx.title, wordCount: ctx.wordCount },
			await toJsonSchema(splitPlanSchema),
			{ signal, usageCallback: u => { usage = toActionUsage(u); } },
		);
		return { type: 'structured', data: result, usage };
	},
	ResultPanel: null as any,
};

export const suggestTagsAction: CopilotAction = {
	id: 'suggest-tags', label: 'Suggest Tags', description: 'Analyze content and suggest relevant tags',
	icon: Tag, category: 'document',
	relevance: (ctx) => ctx.tags.length === 0 ? 0.9 : ctx.tags.length < 2 ? 0.6 : 0.2,
	async *execute(ctx, _signal) {
		const engine = new TagSuggestionEngine(AppContext.getInstance().manager);
		const ranked = await engine.suggestTags(ctx.file.path, ctx.content, ctx.title);
		return {
			type: 'structured',
			data: {
				suggestions: ranked.map(r => ({
					tag: r.tag, confidence: r.confidence, reason: r.reason,
					source: r.sources[0]?.source ?? 'content',
				})),
				summary: `Found ${ranked.length} tag suggestions using content analysis, graph neighbors, and folder history.`,
			},
		};
	},
	ResultPanel: null as any,
};

export const summarizeAction: CopilotAction = {
	id: 'summarize', label: 'Summarize', description: 'Generate a concise summary of the document',
	icon: AlignLeft, category: 'document',
	guard: (ctx) => ctx.wordCount < 100 ? 'Document is too short to summarize (minimum 100 words).' : null,
	relevance: (ctx) => ctx.wordCount > 1500 ? 0.8 : ctx.wordCount > 800 ? 0.5 : 0.2,
	execute: (ctx, signal) => streamAction(PromptId.DocSummarize, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope, length: 'short' }, signal),
	ResultPanel: null as any,
};

export const extractConceptsAction: CopilotAction = {
	id: 'extract-concepts', label: 'Extract Concepts', description: 'Identify key concepts and definitions',
	icon: Lightbulb, category: 'document',
	guard: (ctx) => ctx.wordCount < 100 ? 'Document is too short to extract concepts from (minimum 100 words).' : null,
	relevance: (ctx) => ctx.wordCount > 1000 && ctx.tags.length < 2 ? 0.7 : ctx.wordCount > 500 ? 0.5 : 0.2,
	async *execute(ctx, signal) {
		let usage: ActionUsage | undefined;
		const result = await AppContext.getInstance().manager.queryStructured(
			PromptId.DocExtractConcepts, { content: scopedContent(ctx), title: ctx.title },
			await toJsonSchema(extractConceptsSchema),
			{ signal, usageCallback: u => { usage = toActionUsage(u); } },
		);
		return { type: 'structured', data: result, usage };
	},
	ResultPanel: null as any,
};

export const translateAction: CopilotAction = {
	id: 'translate', label: 'Translate', description: 'Translate document content to another language',
	icon: Languages, category: 'document',
	relevance(ctx) {
		const content = ctx.scope === 'selection' ? ctx.selection ?? ctx.content : ctx.content;
		return hasCJKMajority(content) ? 0.6 : 0.3;
	},
	execute(ctx, signal) {
		const content = scopedContent(ctx);
		const targetLanguage = hasCJKMajority(content) ? 'English' : '中文';
		return streamAction(PromptId.DocTranslate, { content, title: ctx.title, scope: ctx.scope, targetLanguage }, signal);
	},
	ResultPanel: null as any,
};

export const findRelatedAction: CopilotAction = {
	id: 'find-related', label: 'Find Related', description: 'Find semantically related notes in your vault',
	icon: Search, category: 'vault',
	relevance: (ctx) => ctx.isOrphan ? 0.8 : ctx.links.length < 3 ? 0.5 : 0.3,
	async *execute(ctx, _signal) {
		const response = await AppContext.getInstance().searchClient.vectorSearch({
			text: ctx.content.slice(0, 1000), scopeMode: 'vault', topK: 10,
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

export const knowledgeGapsAction: CopilotAction = {
	id: 'knowledge-gaps', label: 'Knowledge Gaps', description: 'Identify missing topics and knowledge gaps',
	icon: HelpCircle, category: 'vault',
	relevance: (ctx) => ctx.headingCount > 5 ? 0.7 : ctx.headingCount > 3 ? 0.5 : 0.2,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentKnowledgeGaps, {},
		);
		const userPrompt = [
			`## Document: "${ctx.title}"`,
			`Tags: ${ctx.tags.length > 0 ? ctx.tags.join(', ') : 'none'}`,
			`Headings: ${ctx.headingCount}`,
			'',
			'## Content',
			ctx.content,
		].join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
	ResultPanel: null as any,
};

export const synthesizeTopicAction: CopilotAction = {
	id: 'synthesize-topic', label: 'Synthesize Topic', description: 'Synthesize a topic overview from related notes',
	icon: Layers, category: 'vault',
	relevance(ctx) {
		const t = ctx.title.toLowerCase();
		return /moc|overview|summary|index/.test(t) ? 0.8 : ctx.tags.length > 0 ? 0.4 : 0.2;
	},
	guard: (ctx) => ctx.wordCount < 50 ? 'Document is too short to synthesize (< 50 words)' : null,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentSynthesizeTopic, {},
		);
		const userPrompt = [
			`## Seed Document: "${ctx.title}"`,
			'',
			'## Content',
			ctx.content,
		].join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
	ResultPanel: null as any,
};

export const vaultHealthAction: CopilotAction = {
	id: 'vault-health', label: 'Vault Health', description: 'Analyze vault structure for orphans, duplicates, and stale notes',
	icon: Activity, category: 'vault',
	relevance: () => 0.5,
	async *execute(_ctx, signal) {
		const aiManager = AppContext.getInstance().manager;
		const app = AppContext.getInstance().app;
		const files = app.vault.getMarkdownFiles();
		const now = Date.now();
		const oneDay = 86400000;

		let orphanCount = 0, totalLinks = 0, staleCount = 0;
		const tagCounts: Record<string, number> = {};

		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const linkCount = (cache?.links?.length ?? 0) + (cache?.embeds?.length ?? 0);
			const backlinks = Object.keys(app.metadataCache.resolvedLinks)
				.filter(src => app.metadataCache.resolvedLinks[src]?.[file.path]).length;
			if (linkCount === 0 && backlinks === 0) orphanCount++;
			totalLinks += linkCount;
			if (Math.floor((now - file.stat.mtime) / oneDay) > 90) staleCount++;
			const tags = cache?.tags?.map(t => t.tag) ?? [];
			const fmTags = (cache?.frontmatter?.tags as string[] | undefined) ?? [];
			for (const t of [...tags, ...fmTags]) tagCounts[t] = (tagCounts[t] || 0) + 1;
		}

		const stats = [
			`Total files: ${files.length}`,
			`Orphan notes (no links in or out): ${orphanCount}`,
			`Average links per note: ${(totalLinks / files.length).toFixed(1)}`,
			`Stale notes (>90 days): ${staleCount}`,
			`Unique tags: ${Object.keys(tagCounts).length}`,
			`Top tags: ${Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, c]) => `${t}(${c})`).join(', ')}`,
		].join('\n');

		let usage: ActionUsage | undefined;
		const result = await aiManager.queryStructured(
			PromptId.VaultHealth, { stats }, await toJsonSchema(vaultHealthSchema),
			{ signal, usageCallback: u => { usage = toActionUsage(u); } },
		);
		return { type: 'structured', data: result, usage };
	},
	ResultPanel: null as any,
};

export const continueWritingAction: CopilotAction = {
	id: 'continue-writing', label: 'Continue Writing', description: 'Continue writing from where you left off',
	icon: ChevronRight, category: 'writing',
	guard: (ctx) => ctx.wordCount === 0 ? 'Document is empty — write something first' : null,
	relevance: (ctx) => ctx.wordCount >= 50 && ctx.wordCount <= 2000 ? 0.6 : ctx.wordCount > 0 ? 0.4 : 0.1,
	execute: (ctx, signal) => streamAction(PromptId.WritingContinue, { content: ctx.content, title: ctx.title }, signal),
	ResultPanel: null as any,
};

export const rewriteSelectionAction: CopilotAction = {
	id: 'rewrite-selection', label: 'Rewrite Selection', description: 'Rewrite selected text for clarity and style',
	icon: PenLine, category: 'writing',
	guard: (ctx) => ctx.selection ? null : 'Select text to rewrite',
	relevance: (ctx) => ctx.selection ? 0.8 : 0.1,
	execute: (ctx, signal) => streamAction(PromptId.WritingRewrite, { selection: ctx.selection!, content: ctx.content, title: ctx.title, style: 'concise' }, signal),
	ResultPanel: null as any,
};

export const addEvidenceAction: CopilotAction = {
	id: 'add-evidence', label: 'Add Evidence', description: 'Find supporting evidence from your vault',
	icon: BookOpen, category: 'writing',
	guard: (ctx) => ctx.wordCount < 50 ? 'Write at least 50 words before searching for evidence' : null,
	relevance: (ctx) => ctx.wordCount > 500 ? 0.5 : 0.2,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentAddEvidence, {},
		);
		const userPrompt = [
			`## Document: "${ctx.title}"`,
			ctx.selection ? `## Selected Text\n${ctx.selection}` : '',
			'',
			'## Full Content',
			ctx.content,
		].filter(Boolean).join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
	ResultPanel: null as any,
};

// ── Panel imports (static so esbuild resolves @/ aliases) ─────────────

import { PolishPanel } from '@/ui/view/copilot/panels/PolishPanel';
import { ReviewPanel } from '@/ui/view/copilot/panels/ReviewPanel';
import { LinkSuggestPanel } from '@/ui/view/copilot/panels/LinkSuggestPanel';
import { SplitPanel } from '@/ui/view/copilot/panels/SplitPanel';
import { TagSuggestionPanel } from '@/ui/view/copilot/panels/TagSuggestionPanel';
import { SummarizePanel } from '@/ui/view/copilot/panels/SummarizePanel';
import { ExtractConceptsPanel } from '@/ui/view/copilot/panels/ExtractConceptsPanel';
import { TranslatePanel } from '@/ui/view/copilot/panels/TranslatePanel';
import { FindRelatedPanel } from '@/ui/view/copilot/panels/FindRelatedPanel';
import { KnowledgeGapsPanel } from '@/ui/view/copilot/panels/KnowledgeGapsPanel';
import { SynthesizePanel } from '@/ui/view/copilot/panels/SynthesizePanel';
import { VaultHealthPanel } from '@/ui/view/copilot/panels/VaultHealthPanel';
import { ContinueWritingPanel } from '@/ui/view/copilot/panels/ContinueWritingPanel';
import { RewriteSelectionPanel } from '@/ui/view/copilot/panels/RewriteSelectionPanel';
import { AddEvidencePanel } from '@/ui/view/copilot/panels/AddEvidencePanel';

// ── Registration ───────────────────────────────────────────────────────

const PANEL_MAP: Record<string, React.FC<any>> = {
	'polish': PolishPanel,
	'review': ReviewPanel,
	'suggest-links': LinkSuggestPanel,
	'suggest-split': SplitPanel,
	'suggest-tags': TagSuggestionPanel,
	'summarize': SummarizePanel,
	'extract-concepts': ExtractConceptsPanel,
	'translate': TranslatePanel,
	'find-related': FindRelatedPanel,
	'knowledge-gaps': KnowledgeGapsPanel,
	'synthesize-topic': SynthesizePanel,
	'vault-health': VaultHealthPanel,
	'continue-writing': ContinueWritingPanel,
	'rewrite-selection': RewriteSelectionPanel,
	'add-evidence': AddEvidencePanel,
};

/** All actions in display order: document → vault → writing. */
const ALL_ACTIONS: CopilotAction[] = [
	// Document
	suggestTagsAction, suggestLinksAction, suggestSplitAction, reviewArticleAction,
	polishDocumentAction, summarizeAction, extractConceptsAction, translateAction,
	// Vault
	findRelatedAction, knowledgeGapsAction, synthesizeTopicAction, vaultHealthAction,
	// Writing
	continueWritingAction, rewriteSelectionAction, addEvidenceAction,
];

export function registerAllCopilotActions(): void {
	const registry = CopilotActionRegistry.getInstance();
	for (const action of ALL_ACTIONS) {
		const panel = PANEL_MAP[action.id];
		if (panel) action.ResultPanel = panel;
		registry.register(action);
	}
}
