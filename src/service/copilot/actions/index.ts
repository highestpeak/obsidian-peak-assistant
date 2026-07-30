// T11B (2026-06-14): Built-in Copilot action definitions, factory shape.
//
// All actions close over a {@link CopilotActionPorts} bag — no
// `AppContext.getInstance()` / `SqliteStoreManager.getInstance()` /
// `ProfileRegistry.getInstance()` lookups live in this file anymore.
// The app composition layer (`src/app/copilot/actions/composeCopilotActionRuntime.ts`)
// is the only place that resolves concrete dependencies.
//
// T11 (2026-06-14) split icon/panel binding to the UI surface registry.
// T11B keeps that split intact and adds the execution-side split.

import { PromptId } from '@/core/types/prompt';
import {
	reviewResultSchema,
	splitPlanSchema,
	extractConceptsSchema,
	vaultHealthSchema,
	correctContentSchema,
	vaultSummarySchema,
} from '../copilot-schemas';
import type { CopilotAction, DocumentContext, ActionResult, ActionUsage } from '../CopilotActionRegistry';
import type { LLMUsage, LLMStreamEvent } from '@/core/providers/types';
import { v4 as uuidv4 } from 'uuid';
import type { CopilotActionPorts } from './CopilotActionPorts';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';
import type { VaultFileRef } from '@/core/ports/VaultFileRef';
import {
	POLISH_COPILOT_ACTION_ID,
	POLISH_PROMPT_ID,
	buildPolishPromptVariables,
} from '@/service/composer/capabilities/packs/prose';

// ── Re-exported types (consumed by UI panels) ──────────────────────────

export interface FindRelatedResult {
	items: Array<{ path: string; title: string; score: number; excerpt: string }>;
	/**
	 * T11Y-7c: when the search subsystem is not ready (mobile mode or
	 * the SQLite-deferred window), the action surfaces an explicit
	 * unavailable flag so panels can render "Search not ready" instead
	 * of the generic "no related notes" empty state. `items` stays an
	 * empty array on this branch so the panel render path does not
	 * branch on `undefined`.
	 */
	searchUnavailable?: { reason: string };
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

/**
 * Run a streaming prompt via {@link IAgentPrompter.queryStream}, forwarding
 * text-delta events and returning the final aggregated result.
 *
 * T11Y-7a: the previous wrapper read `queryTextStream`'s `{type:'delta'|'done'}`
 * shape; the action now consumes the shared `LLMStreamEvent` stream — `complete`
 * carries the usage payload and we forward `text-delta` straight through.
 */
async function* streamAction(
	ai: IAgentPrompter,
	promptId: PromptId,
	vars: Record<string, any>,
	signal?: AbortSignal,
): AsyncGenerator<LLMStreamEvent, ActionResult> {
	let fullText = '';
	let usage: ActionUsage | undefined;
	for await (const event of ai.queryStream(promptId, vars, { signal })) {
		if (event.type === 'text-delta') {
			fullText += event.text;
			yield event;
		} else if (event.type === 'complete') {
			usage = toActionUsage(event.usage);
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
	const cjkRegex = /[一-鿿㐀-䶿　-〿぀-ゟ゠-ヿ가-힯]/g;
	const matches = text.match(cjkRegex);
	return !!matches && matches.length / text.length > 0.1;
}

// ── Action factory ─────────────────────────────────────────────────────

/**
 * Build the full set of built-in Copilot actions from {@link CopilotActionPorts}.
 *
 * The 28 service-side action definitions live inside this factory as
 * closures, so each `execute()` body talks only to the injected ports.
 * The app composition layer is the single place that wires concrete
 * Obsidian / AppContext / sqlite / Peak Harness dependencies.
 */
export function createBuiltInCopilotActions(deps: CopilotActionPorts): CopilotAction[] {
	// T11Y-7b: actions read the vault through three shared narrow ports
	// (DocumentVaultReaderPort + VaultMetadataResolverPort +
	// VaultMetadataCachePort) instead of a bespoke `vault` wrapper. Local
	// helpers preserve the previous call shapes.
	const { ai, vaultReader, linkResolver, vaultMetadataCache, search, semanticGraph, tags, agent } = deps;

	const listMarkdownFiles = (): VaultFileRef[] =>
		vaultReader.listFiles().filter(f => f.extension === 'md');
	const cachedReadFile = (file: VaultFileRef): Promise<string> => vaultReader.readText(file);
	const lookupFileCache = (file: VaultFileRef) => vaultMetadataCache.getFileCache(file);
	const lookupResolvedLinks = (): Record<string, Record<string, number>> =>
		vaultMetadataCache.getResolvedLinks();
	const resolveLinkPath = (linkText: string, sourcePath: string): string | null =>
		linkResolver.resolveLinkPath(linkText, sourcePath);

	// WP3 (2026-07-25): `polish` is now canonically defined by the Composer
	// capability `composer.prose.polish` (service/composer/capabilities/packs/
	// prose.ts). This Copilot projection shares the stable identity, PromptId
	// and prompt-variable mapping instead of keeping its own copy; the legacy
	// invocation path stays until the WP10 parity gate.
	const polishDocumentAction: CopilotAction = {
		id: POLISH_COPILOT_ACTION_ID, label: 'Polish Document', description: 'Improve clarity and style',
		iconId: 'sparkles', category: 'document',
		relevance: (ctx) => ctx.selection ? 0.8 : ctx.wordCount > 200 ? 0.5 : 0.2,
		execute: (ctx, signal) => streamAction(
			ai,
			POLISH_PROMPT_ID,
			buildPolishPromptVariables({ content: scopedContent(ctx), title: ctx.title, scope: ctx.scope }),
			signal,
		),
	};

	const formatDocumentAction: CopilotAction = {
		id: 'format-polish', label: 'Format Polish', description: 'Fix heading hierarchy, list consistency, whitespace, and broken links',
		iconId: 'wrap-text', category: 'document',
		relevance: (ctx) => ctx.selection ? 0.6 : ctx.wordCount > 200 ? 0.5 : 0.2,
		execute: (ctx, signal) => streamAction(ai, PromptId.DocFormatPolish, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope }, signal),
	};

	const correctContentAction: CopilotAction = {
		id: 'correct-content', label: 'Correct Content', description: 'Find factual errors, logical inconsistencies, broken references, and typos',
		iconId: 'shield-check', category: 'document',
		guard: (ctx) => ctx.wordCount < 50 ? 'Document is too short to check for errors (minimum 50 words).' : null,
		relevance: (ctx) => ctx.selection ? 0.7 : ctx.wordCount > 300 ? 0.6 : 0.3,
		async *execute(ctx, signal) {
			let usage: ActionUsage | undefined;
			const result = await ai.queryStructured(
				PromptId.DocCorrectContent, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope },
				await toJsonSchema(correctContentSchema),
				{ signal, usageCallback: u => { usage = toActionUsage(u); } },
			);
			return { type: 'structured', data: result, usage };
		},
	};

	const reviewArticleAction: CopilotAction = {
		id: 'review', label: 'Review Article', description: 'Get structural and content feedback',
		iconId: 'message-square-text', category: 'document',
		relevance: (ctx) => ctx.wordCount > 500 ? 0.7 : ctx.wordCount > 300 ? 0.5 : 0.2,
		async *execute(ctx, signal) {
			let usage: ActionUsage | undefined;
			const result = await ai.queryStructured(
				PromptId.DocReview, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope },
				await toJsonSchema(reviewResultSchema),
				{ signal, usageCallback: u => { usage = toActionUsage(u); } },
			);
			return { type: 'structured', data: result, usage };
		},
	};

	const suggestLinksAction: CopilotAction = {
		id: 'suggest-links', label: 'Suggest Links', description: 'Find potential wiki-link connections',
		iconId: 'link-2', category: 'document',
		relevance: (ctx) => ctx.isOrphan ? 0.8 : ctx.links.length < 3 ? 0.5 : 0.2,
		async *execute(ctx, signal) {
			const cache = lookupFileCache(ctx.file);
			const existingLinks = (cache?.links ?? []).map(l => l.link).join(', ');

			const systemPrompt = await ai.renderPrompt(PromptId.CopilotAgentSuggestLinks, {} as any);
			const userPrompt = [
				`## Document: "${ctx.title}"`,
				`Word count: ${ctx.wordCount}`,
				existingLinks ? `Existing links: ${existingLinks}` : 'No existing links.',
				'',
				'## Content',
				ctx.content,
			].join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const suggestSemanticLinksAction: CopilotAction = {
		id: 'suggest-semantic-links', label: 'Suggest Links (Graph)', description: 'Find unlinked semantic neighbors from the knowledge graph',
		iconId: 'share-2', category: 'document',
		relevance: (ctx) => ctx.isOrphan ? 0.9 : ctx.links.length < 3 ? 0.6 : 0.3,
		async *execute(ctx, _signal) {
			const cache = lookupFileCache(ctx.file);
			const existingLinkPaths = new Set<string>();
			for (const l of cache?.links ?? []) {
				const resolved = resolveLinkPath(l.link, ctx.file.path);
				if (resolved) existingLinkPaths.add(resolved);
			}

			const { suggestions, totalNeighbors, indexed } = await semanticGraph.findSemanticLinkNeighbors(
				ctx.file.path,
				existingLinkPaths,
			);

			if (!indexed) {
				return {
					type: 'structured',
					data: { suggestions: [], summary: 'Document not indexed yet. Run indexing first.' },
				};
			}

			if (totalNeighbors === 0) {
				return {
					type: 'structured',
					data: { suggestions: [], summary: 'No semantic neighbors found. The document may not have been indexed.' },
				};
			}

			return {
				type: 'structured',
				data: {
					suggestions,
					summary: `Found ${suggestions.length} unlinked semantic neighbor${suggestions.length !== 1 ? 's' : ''} from ${totalNeighbors} total neighbors.`,
				},
			};
		},
	};

	const suggestSplitAction: CopilotAction = {
		id: 'suggest-split', label: 'Suggest Split', description: 'Propose how to split a long document',
		iconId: 'git-fork', category: 'document',
		relevance: (ctx) => ctx.wordCount > 2000 ? 0.8 : ctx.wordCount > 1000 ? 0.5 : 0.2,
		guard: (ctx) => ctx.wordCount < 500 ? 'Document is too short to split (< 500 words)' : null,
		async *execute(ctx, signal) {
			let usage: ActionUsage | undefined;
			const result = await ai.queryStructured(
				PromptId.DocSplitSuggestion, { content: ctx.content, title: ctx.title, wordCount: ctx.wordCount },
				await toJsonSchema(splitPlanSchema),
				{ signal, usageCallback: u => { usage = toActionUsage(u); } },
			);
			return { type: 'structured', data: result, usage };
		},
	};

	const suggestTagsAction: CopilotAction = {
		id: 'suggest-tags', label: 'Suggest Tags', description: 'Analyze content and suggest relevant tags',
		iconId: 'tag', category: 'document',
		relevance: (ctx) => ctx.tags.length === 0 ? 0.9 : ctx.tags.length < 2 ? 0.6 : 0.2,
		async *execute(ctx, _signal) {
			const ranked = await tags.suggestTags(ctx.file.path, ctx.content, ctx.title);
			const batchId = uuidv4();
			try {
				await tags.persistSuggestionBatch({
					docPath: ctx.file.path,
					batchId,
					suggestions: ranked.map(r => ({
						tag: r.tag,
						category: r.category,
						confidence: r.confidence,
						sources: r.sources,
						reason: r.reason,
						isExisting: false,
					})),
				});
			} catch (e) {
				console.warn('[suggestTagsAction] Failed to persist suggestions:', e);
			}
			return {
				type: 'structured',
				data: {
					suggestions: ranked.map(r => ({
						tag: r.tag,
						confidence: r.confidence,
						reason: r.reason,
						category: r.category,
						sources: r.sources,
					})),
					summary: `Found ${ranked.length} tag suggestion${ranked.length !== 1 ? 's' : ''} using content, graph, and folder signals.`,
					batchId,
				},
			};
		},
	};

	const summarizeAction: CopilotAction = {
		id: 'summarize', label: 'Summarize', description: 'Generate a concise summary of the document',
		iconId: 'align-left', category: 'document',
		guard: (ctx) => ctx.wordCount < 100 ? 'Document is too short to summarize (minimum 100 words).' : null,
		relevance: (ctx) => ctx.wordCount > 1500 ? 0.8 : ctx.wordCount > 800 ? 0.5 : 0.2,
		execute: (ctx, signal) => streamAction(ai, PromptId.DocSummarize, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope, length: 'short' }, signal),
	};

	const extractConceptsAction: CopilotAction = {
		id: 'extract-concepts', label: 'Extract Concepts', description: 'Identify key concepts and definitions',
		iconId: 'lightbulb', category: 'document',
		guard: (ctx) => ctx.wordCount < 100 ? 'Document is too short to extract concepts from (minimum 100 words).' : null,
		relevance: (ctx) => ctx.wordCount > 1000 && ctx.tags.length < 2 ? 0.7 : ctx.wordCount > 500 ? 0.5 : 0.2,
		async *execute(ctx, signal) {
			let usage: ActionUsage | undefined;
			const result = await ai.queryStructured(
				PromptId.DocExtractConcepts, { content: scopedContent(ctx), title: ctx.title },
				await toJsonSchema(extractConceptsSchema),
				{ signal, usageCallback: u => { usage = toActionUsage(u); } },
			);
			return { type: 'structured', data: result, usage };
		},
	};

	const translateAction: CopilotAction = {
		id: 'translate', label: 'Translate', description: 'Translate document content to another language',
		iconId: 'languages', category: 'document',
		relevance(ctx) {
			const content = ctx.scope === 'selection' ? ctx.selection ?? ctx.content : ctx.content;
			return hasCJKMajority(content) ? 0.6 : 0.3;
		},
		execute(ctx, signal) {
			const content = scopedContent(ctx);
			const targetLanguage = hasCJKMajority(content) ? 'English' : '中文';
			return streamAction(ai, PromptId.DocTranslate, { content, title: ctx.title, scope: ctx.scope, targetLanguage }, signal);
		},
	};

	const findRelatedAction: CopilotAction = {
		id: 'find-related', label: 'Find Related', description: 'Find semantically related notes in your vault',
		iconId: 'search', category: 'vault',
		relevance: (ctx) => ctx.isOrphan ? 0.8 : ctx.links.length < 3 ? 0.5 : 0.3,
		async *execute(ctx, _signal) {
			const response = await search.vectorSearch({
				text: ctx.content.slice(0, 1000), scopeMode: 'vault', topK: 10,
			});
			// T11Y-7c: thread the availability discriminator through so
			// the panel can render "Search not ready" distinctly from
			// "no related notes found".
			if (!response.available) {
				const data: FindRelatedResult = {
					items: [],
					searchUnavailable: { reason: response.reason },
				};
				return { type: 'structured', data };
			}
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
	};

	const knowledgeGapsAction: CopilotAction = {
		id: 'knowledge-gaps', label: 'Knowledge Gaps', description: 'Identify missing topics and knowledge gaps',
		iconId: 'help-circle', category: 'vault',
		relevance: (ctx) => ctx.headingCount > 5 ? 0.7 : ctx.headingCount > 3 ? 0.5 : 0.2,
		async *execute(ctx, signal) {
			const systemPrompt = await ai.renderPrompt(PromptId.CopilotAgentKnowledgeGaps, {} as any);
			const userPrompt = [
				`## Document: "${ctx.title}"`,
				`Tags: ${ctx.tags.length > 0 ? ctx.tags.join(', ') : 'none'}`,
				`Headings: ${ctx.headingCount}`,
				'',
				'## Content',
				ctx.content,
			].join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const synthesizeTopicAction: CopilotAction = {
		id: 'synthesize-topic', label: 'Synthesize Topic', description: 'Synthesize a topic overview from related notes',
		iconId: 'layers', category: 'vault',
		relevance(ctx) {
			const t = ctx.title.toLowerCase();
			return /moc|overview|summary|index/.test(t) ? 0.8 : ctx.tags.length > 0 ? 0.4 : 0.2;
		},
		guard: (ctx) => ctx.wordCount < 50 ? 'Document is too short to synthesize (< 50 words)' : null,
		async *execute(ctx, signal) {
			const systemPrompt = await ai.renderPrompt(PromptId.CopilotAgentSynthesizeTopic, {} as any);
			const userPrompt = [
				`## Seed Document: "${ctx.title}"`,
				'',
				'## Content',
				ctx.content,
			].join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const vaultHealthAction: CopilotAction = {
		id: 'vault-health', label: 'Vault Health', description: 'Analyze vault structure for orphans, duplicates, and stale notes',
		iconId: 'activity', category: 'vault',
		relevance: () => 0.5,
		async *execute(_ctx, signal) {
			const files = listMarkdownFiles();
			const resolvedLinks = lookupResolvedLinks();
			const now = Date.now();
			const oneDay = 86400000;

			let orphanCount = 0, totalLinks = 0, staleCount = 0;
			const tagCounts: Record<string, number> = {};

			for (const file of files) {
				const cache = lookupFileCache(file);
				const linkCount = (cache?.links?.length ?? 0) + (cache?.embeds?.length ?? 0);
				const backlinks = Object.keys(resolvedLinks)
					.filter(src => resolvedLinks[src]?.[file.path]).length;
				if (linkCount === 0 && backlinks === 0) orphanCount++;
				totalLinks += linkCount;
				if (Math.floor((now - file.stat.mtime) / oneDay) > 90) staleCount++;
				const fileTags = cache?.tags?.map(t => t.tag) ?? [];
				const fmTags = (cache?.frontmatter?.tags as string[] | undefined) ?? [];
				for (const t of [...fileTags, ...fmTags]) tagCounts[t] = (tagCounts[t] || 0) + 1;
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
			const result = await ai.queryStructured(
				PromptId.VaultHealth, { stats }, await toJsonSchema(vaultHealthSchema),
				{ signal, usageCallback: u => { usage = toActionUsage(u); } },
			);
			return { type: 'structured', data: result, usage };
		},
	};

	const vaultSummaryAction: CopilotAction = {
		id: 'vault-summary', label: 'Vault Summary', description: 'Summarize recent vault activity over a time period',
		iconId: 'calendar', category: 'vault',
		relevance: () => 0.5,
		async *execute(_ctx, signal) {
			const files = listMarkdownFiles();
			const now = Date.now();
			const days = 7;
			const cutoff = now - days * 86400000;

			const recentFiles = files
				.filter(f => f.stat.mtime >= cutoff)
				.sort((a, b) => b.stat.mtime - a.stat.mtime);

			if (recentFiles.length === 0) {
				return { type: 'structured', data: { period: `Past ${days} days`, totalNotes: 0, groups: [], narrative: 'No notes were modified in this period.' } };
			}

			const noteListLines = recentFiles.map(f => {
				const date = new Date(f.stat.mtime).toISOString().slice(0, 10);
				const title = f.basename;
				const folder = f.parent?.path ?? '/';
				return `- **${title}** (${folder}) — modified ${date}`;
			});

			const startDate = new Date(cutoff).toISOString().slice(0, 10);
			const endDate = new Date(now).toISOString().slice(0, 10);
			const period = `Past ${days} days (${startDate} to ${endDate})`;

			let usage: ActionUsage | undefined;
			const result = await ai.queryStructured(
				PromptId.VaultSummary,
				{ period, noteList: noteListLines.join('\n') },
				await toJsonSchema(vaultSummarySchema),
				{ signal, usageCallback: u => { usage = toActionUsage(u); } },
			);
			return { type: 'structured', data: result, usage };
		},
	};

	const continueWritingAction: CopilotAction = {
		id: 'continue-writing', label: 'Continue Writing', description: 'Continue writing from where you left off',
		iconId: 'chevron-right', category: 'writing',
		guard: (ctx) => ctx.wordCount === 0 ? 'Document is empty — write something first' : null,
		relevance: (ctx) => ctx.wordCount >= 50 && ctx.wordCount <= 2000 ? 0.6 : ctx.wordCount > 0 ? 0.4 : 0.1,
		execute: (ctx, signal) => streamAction(ai, PromptId.WritingContinue, { content: ctx.content, title: ctx.title }, signal),
	};

	const rewriteSelectionAction: CopilotAction = {
		id: 'rewrite-selection', label: 'Rewrite Selection', description: 'Rewrite selected text for clarity and style',
		iconId: 'pen-line', category: 'writing',
		guard: (ctx) => ctx.selection ? null : 'Select text to rewrite',
		relevance: (ctx) => ctx.selection ? 0.8 : 0.1,
		execute: (ctx, signal) => streamAction(ai, PromptId.WritingRewrite, { selection: ctx.selection!, content: ctx.content, title: ctx.title, style: 'concise' }, signal),
	};

	const addEvidenceAction: CopilotAction = {
		id: 'add-evidence', label: 'Add Evidence', description: 'Find supporting evidence from your vault',
		iconId: 'book-open', category: 'writing',
		guard: (ctx) => ctx.wordCount < 50 ? 'Write at least 50 words before searching for evidence' : null,
		relevance: (ctx) => ctx.wordCount > 500 ? 0.5 : 0.2,
		async *execute(ctx, signal) {
			const systemPrompt = await ai.renderPrompt(PromptId.CopilotAgentAddEvidence, {} as any);
			const userPrompt = [
				`## Document: "${ctx.title}"`,
				ctx.selection ? `## Selected Text\n${ctx.selection}` : '',
				'',
				'## Full Content',
				ctx.content,
			].filter(Boolean).join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const extractTodosAction: CopilotAction = {
		id: 'extract-todos', label: 'Extract Todos', description: 'Find all unchecked todos across the vault',
		iconId: 'check-square', category: 'vault',
		relevance: () => 0.6,
		async *execute(_ctx, _signal) {
			const files = listMarkdownFiles();
			const todoPattern = /^(\s*)-\s\[\s\]\s(.+)$/;
			const tagPattern = /#[\w/-]+/g;

			const todos: Array<{ filePath: string; text: string; lineNumber: number; tags: string[] }> = [];

			for (const file of files) {
				const content = await cachedReadFile(file);
				const lines = content.split('\n');
				for (let i = 0; i < lines.length; i++) {
					const match = lines[i].match(todoPattern);
					if (!match) continue;
					const text = match[2].trim();
					const tagsFound = text.match(tagPattern) ?? [];
					todos.push({
						filePath: file.path,
						text,
						lineNumber: i + 1,
						tags: tagsFound,
					});
				}
			}

			return {
				type: 'structured',
				data: {
					todos,
					totalFiles: files.length,
					summary: `Found ${todos.length} todo${todos.length !== 1 ? 's' : ''} across ${files.length} files.`,
				},
			};
		},
	};

	const writingPlanAction: CopilotAction = {
		id: 'writing-plan', label: 'Writing Plan', description: 'Create a structured writing plan for a topic, grounded in vault notes',
		iconId: 'clipboard-list', category: 'writing',
		relevance: () => 0.4,
		async *execute(ctx, signal) {
			const systemPrompt = await ai.renderPrompt(PromptId.CopilotAgentWritingPlan, {} as any);
			const userPrompt = [
				`## Writing Task`,
				'',
				`Create a writing plan for the following topic/task:`,
				'',
				`**Document:** "${ctx.title}"`,
				'',
				'## Context',
				ctx.content,
			].join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const writeArticleAction: CopilotAction = {
		id: 'write-article', label: 'Write Article', description: 'Find vault notes on a topic and synthesize an article with [[citations]]',
		iconId: 'file-text', category: 'writing',
		relevance: (ctx) => ctx.wordCount < 100 ? 0.6 : 0.3,
		async *execute(ctx, signal) {
			const systemPrompt = await ai.renderPrompt(PromptId.CopilotAgentWriteArticle, {} as any);
			const userPrompt = [
				`## Topic`,
				'',
				`Write an article about: "${ctx.title}"`,
				'',
				ctx.content ? `## Existing Notes/Context\n${ctx.content.slice(0, 2000)}` : '',
			].filter(Boolean).join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const detectAndFileAction: CopilotAction = {
		id: 'detect-and-file', label: 'Detect & File', description: 'Analyze text and suggest which note to append it to',
		iconId: 'inbox', category: 'vault',
		guard: (ctx) => !ctx.selection ? 'Select text to detect and file' : null,
		relevance: (ctx) => ctx.selection ? 0.7 : 0.1,
		async *execute(ctx, signal) {
			const systemPrompt = await ai.renderPrompt(PromptId.CopilotAgentDetectAndFile, {} as any);
			const textToAnalyze = ctx.selection ?? ctx.content.slice(0, 2000);
			const userPrompt = [
				`## Text to Analyze and File`,
				'',
				textToAnalyze,
				'',
				`## Source Document: "${ctx.title}"`,
			].join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const checkTaskListAction: CopilotAction = {
		id: 'check-task-list', label: 'Check Task List', description: 'Analyze tasks for priority, overdue items, blockers, and staleness',
		iconId: 'list-checks', category: 'document',
		guard: (ctx) => {
			const hasTasks = /- \[[ x]\]/.test(ctx.content);
			return hasTasks ? null : 'No task items found in document (need - [ ] or - [x])';
		},
		relevance: (ctx) => /- \[[ x]\]/.test(ctx.content) ? 0.8 : 0.1,
		async *execute(ctx, signal) {
			const systemPrompt = await ai.renderPrompt(PromptId.CopilotAgentCheckTaskList, {} as any);
			const userPrompt = [
				`## Document: "${ctx.title}"`,
				'',
				'## Content',
				ctx.content,
			].join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const promptAuditAction: CopilotAction = {
		id: 'prompt-audit', label: 'Prompt Audit', description: 'Evaluate prompt templates for quality and suggest improvements',
		iconId: 'clipboard-check', category: 'vault',
		relevance: () => 0.3,
		async *execute(_ctx, signal) {
			const systemPrompt = await ai.renderPrompt(PromptId.CopilotAgentPromptAudit, {} as any);
			const userPrompt = [
				`## Task: Audit Prompt Templates`,
				'',
				'Read all prompt template files in the vault (search for "prompt" or browse the templates/prompts folder).',
				'Evaluate each prompt template for quality using the evaluation criteria.',
				'Focus on the copilot and document-related prompts.',
				'',
				'Start by using vault_list_folders and vault_grep to find prompt files,',
				'then read and evaluate each one.',
			].join('\n');

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const deduplicateScanAction: CopilotAction = {
		id: 'deduplicate-scan', label: 'Deduplicate Scan', description: 'Find files with identical content by MD5 hash',
		iconId: 'fingerprint', category: 'vault',
		relevance: () => 0.4,
		async *execute(_ctx, _signal) {
			const files = listMarkdownFiles();
			const { hashMD5 } = await import('@/core/utils/hash-utils');

			const hashMap = new Map<string, Array<{ path: string; size: number; modified: number }>>();

			for (const file of files) {
				const content = await cachedReadFile(file);
				const hash = hashMD5(content);
				const entry = { path: file.path, size: file.stat.size, modified: file.stat.mtime };
				const existing = hashMap.get(hash);
				if (existing) {
					existing.push(entry);
				} else {
					hashMap.set(hash, [entry]);
				}
			}

			const groups = Array.from(hashMap.entries())
				.filter(([_, entries]) => entries.length > 1)
				.map(([hash, entries]) => ({
					hash,
					files: entries.sort((a, b) => b.modified - a.modified),
				}))
				.sort((a, b) => b.files.length - a.files.length);

			const duplicateFiles = groups.reduce((sum, g) => sum + g.files.length, 0);

			return {
				type: 'structured',
				data: {
					groups,
					totalFiles: files.length,
					duplicateFiles,
					summary: `Found ${groups.length} duplicate group${groups.length !== 1 ? 's' : ''} (${duplicateFiles} files) across ${files.length} total files.`,
				},
			};
		},
	};

	const findAndSolveTasksAction: CopilotAction = {
		id: 'find-solve-tasks', label: 'Find & Solve Tasks', description: 'Find open tasks with questions and suggest answers from vault notes',
		iconId: 'circle-help', category: 'vault',
		relevance: () => 0.5,
		async *execute(_ctx, signal) {
			const systemPrompt = await ai.renderPrompt(PromptId.CopilotFindAndSolveTasksSystem, {} as any);

			const files = listMarkdownFiles();
			const todoPattern = /^(\s*)-\s\[\s\]\s(.+)$/;
			const questionIndicators = /\?|find|research|look up|investigate|what|how|why|when|where|figure out/i;

			const candidateTasks: Array<{ filePath: string; lineNumber: number; text: string }> = [];
			for (const file of files) {
				const content = await cachedReadFile(file);
				const lines = content.split('\n');
				for (let i = 0; i < lines.length; i++) {
					const match = lines[i].match(todoPattern);
					if (!match) continue;
					const text = match[2].trim();
					if (questionIndicators.test(text)) {
						candidateTasks.push({ filePath: file.path, lineNumber: i + 1, text });
					}
				}
			}

			if (candidateTasks.length === 0) {
				return {
					type: 'structured',
					data: {
						tasks: [],
						totalTasksScanned: 0,
						summary: 'No question-like tasks found in the vault.',
					},
				};
			}

			const taskList = candidateTasks.slice(0, 30).map(t =>
				`- [${t.filePath}:L${t.lineNumber}] ${t.text}`
			).join('\n');

			const userPrompt = await ai.renderPrompt(PromptId.CopilotFindAndSolveTasksUser, { taskList } as any);

			yield* agent.runAgentStream({ systemPrompt, userPrompt, signal });
		},
	};

	const smartConnectionsAction: CopilotAction = {
		id: 'smart-connections', label: 'Smart Connections', description: 'Find semantically similar unlinked notes via graph inspector',
		iconId: 'zap', category: 'vault',
		relevance: (ctx) => ctx.isOrphan ? 0.9 : ctx.links.length < 5 ? 0.6 : 0.3,
		async *execute(ctx, _signal) {
			const cache = lookupFileCache(ctx.file);
			const existingLinkPaths = new Set<string>();
			for (const l of cache?.links ?? []) {
				const resolved = resolveLinkPath(l.link, ctx.file.path);
				if (resolved) existingLinkPaths.add(resolved);
			}

			const { connections, indexed } = await semanticGraph.findSmartConnections(
				ctx.file.path,
				existingLinkPaths,
			);

			if (!indexed) {
				return {
					type: 'structured',
					data: {
						connections: [],
						summary: 'Document not indexed yet. Run indexing first.',
					},
				};
			}

			return {
				type: 'structured',
				data: {
					connections,
					summary: `Found ${connections.length} semantically similar note${connections.length !== 1 ? 's' : ''} not directly linked to "${ctx.title}".`,
				},
			};
		},
	};

	return [
		// Document
		suggestTagsAction, suggestLinksAction, suggestSemanticLinksAction, suggestSplitAction, reviewArticleAction,
		correctContentAction, polishDocumentAction, formatDocumentAction, summarizeAction, extractConceptsAction, translateAction,
		checkTaskListAction,
		// Vault
		findRelatedAction, knowledgeGapsAction, synthesizeTopicAction, vaultHealthAction, vaultSummaryAction, extractTodosAction,
		deduplicateScanAction, findAndSolveTasksAction, smartConnectionsAction,
		detectAndFileAction, promptAuditAction,
		// Writing
		continueWritingAction, rewriteSelectionAction, addEvidenceAction, writingPlanAction, writeArticleAction,
	];
}
