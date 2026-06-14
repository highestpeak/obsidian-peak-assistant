import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/context/AppContext';
import { TagSuggestionEngine } from '../TagSuggestionEngine';
import {
	reviewResultSchema, splitPlanSchema,
	extractConceptsSchema, vaultHealthSchema,
	correctContentSchema, vaultSummarySchema,
	type TagSuggestions,
} from '../copilot-schemas';
import { CopilotActionRegistry } from '../CopilotActionRegistry';
import type { CopilotAction, DocumentContext, ActionResult, ActionUsage } from '../CopilotActionRegistry';
import type { LLMUsage, LLMStreamEvent } from '@/core/providers/types';
import { buildCopilotAgentStream } from './agent-actions';
import { v4 as uuidv4 } from 'uuid';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GraphEdgeType } from '@/core/po/graph.po';

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
	iconId: 'sparkles', category: 'document',
	relevance: (ctx) => ctx.selection ? 0.8 : ctx.wordCount > 200 ? 0.5 : 0.2,
	execute: (ctx, signal) => streamAction(PromptId.DocPolish, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope }, signal),
};

export const formatDocumentAction: CopilotAction = {
	id: 'format-polish', label: 'Format Polish', description: 'Fix heading hierarchy, list consistency, whitespace, and broken links',
	iconId: 'wrap-text', category: 'document',
	relevance: (ctx) => ctx.selection ? 0.6 : ctx.wordCount > 200 ? 0.5 : 0.2,
	execute: (ctx, signal) => streamAction(PromptId.DocFormatPolish, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope }, signal),
};

export const correctContentAction: CopilotAction = {
	id: 'correct-content', label: 'Correct Content', description: 'Find factual errors, logical inconsistencies, broken references, and typos',
	iconId: 'shield-check', category: 'document',
	guard: (ctx) => ctx.wordCount < 50 ? 'Document is too short to check for errors (minimum 50 words).' : null,
	relevance: (ctx) => ctx.selection ? 0.7 : ctx.wordCount > 300 ? 0.6 : 0.3,
	async *execute(ctx, signal) {
		let usage: ActionUsage | undefined;
		const result = await AppContext.getInstance().manager.queryStructured(
			PromptId.DocCorrectContent, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope },
			await toJsonSchema(correctContentSchema),
			{ signal, usageCallback: u => { usage = toActionUsage(u); } },
		);
		return { type: 'structured', data: result, usage };
	},
};

export const reviewArticleAction: CopilotAction = {
	id: 'review', label: 'Review Article', description: 'Get structural and content feedback',
	iconId: 'message-square-text', category: 'document',
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
};

export const suggestLinksAction: CopilotAction = {
	id: 'suggest-links', label: 'Suggest Links', description: 'Find potential wiki-link connections',
	iconId: 'link-2', category: 'document',
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
};

export const suggestSemanticLinksAction: CopilotAction = {
	id: 'suggest-semantic-links', label: 'Suggest Links (Graph)', description: 'Find unlinked semantic neighbors from the knowledge graph',
	iconId: 'share-2', category: 'document',
	relevance: (ctx) => ctx.isOrphan ? 0.9 : ctx.links.length < 3 ? 0.6 : 0.3,
	async *execute(ctx, _signal) {
		const storeManager = SqliteStoreManager.getInstance();
		const nodeRepo = storeManager.getMobiusNodeRepo();
		const edgeRepo = storeManager.getMobiusEdgeRepo();

		// 1. Find the mobius node for this document
		const docNode = await nodeRepo.getByPath(ctx.file.path);
		if (!docNode) {
			return { type: 'structured', data: { suggestions: [], summary: 'Document not indexed yet. Run indexing first.' } };
		}
		const docNodeId = docNode.node_id;

		// 2. Get semantic_related edges (both directions)
		const outEdges = await edgeRepo.getByFromNode(docNodeId);
		const semanticOut = outEdges.filter(e => e.type === GraphEdgeType.SemanticRelated);

		// Also check incoming semantic edges
		const inRows = await edgeRepo.getByToNodesAndTypes([docNodeId], [GraphEdgeType.SemanticRelated]);
		const inFromIds = inRows.map(r => r.from_node_id);

		// Merge all neighbor node IDs with weights
		const neighborMap = new Map<string, { weight: number; direction: 'outgoing' | 'incoming' }>();
		for (const e of semanticOut) {
			neighborMap.set(e.to_node_id, { weight: e.weight, direction: 'outgoing' });
		}
		for (const nid of inFromIds) {
			if (!neighborMap.has(nid)) {
				neighborMap.set(nid, { weight: 0.5, direction: 'incoming' });
			}
		}

		if (neighborMap.size === 0) {
			return { type: 'structured', data: { suggestions: [], summary: 'No semantic neighbors found. The document may not have been indexed.' } };
		}

		// 3. Resolve neighbor node IDs to paths/labels
		const neighborIds = [...neighborMap.keys()];
		const neighborMeta = new Map<string, { path: string | null; label: string }>();
		for (const nid of neighborIds) {
			const row = await nodeRepo.getByNodeId(nid);
			if (row) neighborMeta.set(nid, { path: row.path, label: row.label });
		}

		// 4. Get existing links to filter them out
		const app = AppContext.getInstance().app;
		const cache = app.metadataCache.getFileCache(ctx.file);
		const existingLinkTargets = new Set<string>();
		for (const l of cache?.links ?? []) {
			const resolved = app.metadataCache.getFirstLinkpathDest(l.link, ctx.file.path);
			if (resolved) existingLinkTargets.add(resolved.path);
		}

		// 5. Build suggestions: unlinked semantic neighbors
		const suggestions: Array<{
			path: string; title: string; score: number;
			direction: 'outgoing' | 'incoming'; snippet: string;
		}> = [];

		for (const [nid, info] of neighborMap.entries()) {
			const meta = neighborMeta.get(nid);
			if (!meta || !meta.path) continue;
			if (existingLinkTargets.has(meta.path)) continue;
			if (meta.path === ctx.file.path) continue;

			const title = meta.label || meta.path.replace(/\.md$/, '').split('/').pop() || meta.path;
			suggestions.push({
				path: meta.path,
				title,
				score: info.weight,
				direction: info.direction,
				snippet: `Similarity: ${(info.weight * 100).toFixed(0)}%`,
			});
		}

		// Sort by score descending
		suggestions.sort((a, b) => b.score - a.score);
		const topSuggestions = suggestions.slice(0, 20);

		return {
			type: 'structured',
			data: {
				suggestions: topSuggestions,
				summary: `Found ${topSuggestions.length} unlinked semantic neighbor${topSuggestions.length !== 1 ? 's' : ''} from ${neighborMap.size} total neighbors.`,
			},
		};
	},
};

export const suggestSplitAction: CopilotAction = {
	id: 'suggest-split', label: 'Suggest Split', description: 'Propose how to split a long document',
	iconId: 'git-fork', category: 'document',
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
};

export const suggestTagsAction: CopilotAction = {
	id: 'suggest-tags', label: 'Suggest Tags', description: 'Analyze content and suggest relevant tags',
	iconId: 'tag', category: 'document',
	relevance: (ctx) => ctx.tags.length === 0 ? 0.9 : ctx.tags.length < 2 ? 0.6 : 0.2,
	async *execute(ctx, _signal) {
		const engine = new TagSuggestionEngine(AppContext.getInstance().manager);
		const ranked = await engine.suggestTags(ctx.file.path, ctx.content, ctx.title);
		const batchId = uuidv4();
		// Persist initial suggestions to DB for feedback tracking
		try {
			const repo = SqliteStoreManager.getInstance().getTagSuggestionRepo();
			await repo.insertBatch({
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

export const summarizeAction: CopilotAction = {
	id: 'summarize', label: 'Summarize', description: 'Generate a concise summary of the document',
	iconId: 'align-left', category: 'document',
	guard: (ctx) => ctx.wordCount < 100 ? 'Document is too short to summarize (minimum 100 words).' : null,
	relevance: (ctx) => ctx.wordCount > 1500 ? 0.8 : ctx.wordCount > 800 ? 0.5 : 0.2,
	execute: (ctx, signal) => streamAction(PromptId.DocSummarize, { content: scopedContent(ctx), title: ctx.title, scope: ctx.scope, length: 'short' }, signal),
};

export const extractConceptsAction: CopilotAction = {
	id: 'extract-concepts', label: 'Extract Concepts', description: 'Identify key concepts and definitions',
	iconId: 'lightbulb', category: 'document',
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
};

export const translateAction: CopilotAction = {
	id: 'translate', label: 'Translate', description: 'Translate document content to another language',
	iconId: 'languages', category: 'document',
	relevance(ctx) {
		const content = ctx.scope === 'selection' ? ctx.selection ?? ctx.content : ctx.content;
		return hasCJKMajority(content) ? 0.6 : 0.3;
	},
	execute(ctx, signal) {
		const content = scopedContent(ctx);
		const targetLanguage = hasCJKMajority(content) ? 'English' : '中文';
		return streamAction(PromptId.DocTranslate, { content, title: ctx.title, scope: ctx.scope, targetLanguage }, signal);
	},
};

export const findRelatedAction: CopilotAction = {
	id: 'find-related', label: 'Find Related', description: 'Find semantically related notes in your vault',
	iconId: 'search', category: 'vault',
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
};

export const knowledgeGapsAction: CopilotAction = {
	id: 'knowledge-gaps', label: 'Knowledge Gaps', description: 'Identify missing topics and knowledge gaps',
	iconId: 'help-circle', category: 'vault',
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
};

export const synthesizeTopicAction: CopilotAction = {
	id: 'synthesize-topic', label: 'Synthesize Topic', description: 'Synthesize a topic overview from related notes',
	iconId: 'layers', category: 'vault',
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
};

export const vaultHealthAction: CopilotAction = {
	id: 'vault-health', label: 'Vault Health', description: 'Analyze vault structure for orphans, duplicates, and stale notes',
	iconId: 'activity', category: 'vault',
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
};

export const vaultSummaryAction: CopilotAction = {
	id: 'vault-summary', label: 'Vault Summary', description: 'Summarize recent vault activity over a time period',
	iconId: 'calendar', category: 'vault',
	relevance: () => 0.5,
	async *execute(_ctx, signal) {
		const app = AppContext.getInstance().app;
		const files = app.vault.getMarkdownFiles();
		const now = Date.now();
		const days = 7; // default weekly
		const cutoff = now - days * 86400000;

		// Collect recently modified files
		const recentFiles = files
			.filter(f => f.stat.mtime >= cutoff)
			.sort((a, b) => b.stat.mtime - a.stat.mtime);

		if (recentFiles.length === 0) {
			return { type: 'structured', data: { period: `Past ${days} days`, totalNotes: 0, groups: [], narrative: 'No notes were modified in this period.' } };
		}

		// Build note list for LLM
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
		const result = await AppContext.getInstance().manager.queryStructured(
			PromptId.VaultSummary,
			{ period, noteList: noteListLines.join('\n') },
			await toJsonSchema(vaultSummarySchema),
			{ signal, usageCallback: u => { usage = toActionUsage(u); } },
		);
		return { type: 'structured', data: result, usage };
	},
};

export const continueWritingAction: CopilotAction = {
	id: 'continue-writing', label: 'Continue Writing', description: 'Continue writing from where you left off',
	iconId: 'chevron-right', category: 'writing',
	guard: (ctx) => ctx.wordCount === 0 ? 'Document is empty — write something first' : null,
	relevance: (ctx) => ctx.wordCount >= 50 && ctx.wordCount <= 2000 ? 0.6 : ctx.wordCount > 0 ? 0.4 : 0.1,
	execute: (ctx, signal) => streamAction(PromptId.WritingContinue, { content: ctx.content, title: ctx.title }, signal),
};

export const rewriteSelectionAction: CopilotAction = {
	id: 'rewrite-selection', label: 'Rewrite Selection', description: 'Rewrite selected text for clarity and style',
	iconId: 'pen-line', category: 'writing',
	guard: (ctx) => ctx.selection ? null : 'Select text to rewrite',
	relevance: (ctx) => ctx.selection ? 0.8 : 0.1,
	execute: (ctx, signal) => streamAction(PromptId.WritingRewrite, { selection: ctx.selection!, content: ctx.content, title: ctx.title, style: 'concise' }, signal),
};

export const addEvidenceAction: CopilotAction = {
	id: 'add-evidence', label: 'Add Evidence', description: 'Find supporting evidence from your vault',
	iconId: 'book-open', category: 'writing',
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
};

export const extractTodosAction: CopilotAction = {
	id: 'extract-todos', label: 'Extract Todos', description: 'Find all unchecked todos across the vault',
	iconId: 'check-square', category: 'vault',
	relevance: () => 0.6,
	async *execute(_ctx, _signal) {
		const app = AppContext.getInstance().app;
		const files = app.vault.getMarkdownFiles();
		const todoPattern = /^(\s*)-\s\[\s\]\s(.+)$/;
		const tagPattern = /#[\w/-]+/g;

		const todos: Array<{ filePath: string; text: string; lineNumber: number; tags: string[] }> = [];

		for (const file of files) {
			const content = await app.vault.cachedRead(file);
			const lines = content.split('\n');
			for (let i = 0; i < lines.length; i++) {
				const match = lines[i].match(todoPattern);
				if (!match) continue;
				const text = match[2].trim();
				const tags = text.match(tagPattern) ?? [];
				todos.push({
					filePath: file.path,
					text,
					lineNumber: i + 1,
					tags,
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

export const writingPlanAction: CopilotAction = {
	id: 'writing-plan', label: 'Writing Plan', description: 'Create a structured writing plan for a topic, grounded in vault notes',
	iconId: 'clipboard-list', category: 'writing',
	relevance: () => 0.4,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentWritingPlan, {},
		);
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

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
};

export const runWorkflowAction: CopilotAction = {
	id: 'run-workflow', label: 'Run Workflow', description: 'Execute a multi-step workflow (find → summarize → report)',
	iconId: 'workflow', category: 'vault',
	relevance: () => 0.3,
	async *execute(ctx, signal) {
		const { runWorkflow } = await import('@/service/workflow/WorkflowAgent');
		const description = ctx.selection
			? ctx.selection
			: `Find notes related to "${ctx.title}" and create a summary report`;
		const result = await runWorkflow(description, signal);
		return { type: 'structured', data: result };
	},
};

// ── Write Article (#32) ───────────────────────────────────────────────

export const writeArticleAction: CopilotAction = {
	id: 'write-article', label: 'Write Article', description: 'Find vault notes on a topic and synthesize an article with [[citations]]',
	iconId: 'file-text', category: 'writing',
	relevance: (ctx) => ctx.wordCount < 100 ? 0.6 : 0.3,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentWriteArticle, {},
		);
		const userPrompt = [
			`## Topic`,
			'',
			`Write an article about: "${ctx.title}"`,
			'',
			ctx.content ? `## Existing Notes/Context\n${ctx.content.slice(0, 2000)}` : '',
		].filter(Boolean).join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
};

// ── Detect & File (#34) ───────────────────────────────────────────────

export const detectAndFileAction: CopilotAction = {
	id: 'detect-and-file', label: 'Detect & File', description: 'Analyze text and suggest which note to append it to',
	iconId: 'inbox', category: 'vault',
	guard: (ctx) => !ctx.selection ? 'Select text to detect and file' : null,
	relevance: (ctx) => ctx.selection ? 0.7 : 0.1,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentDetectAndFile, {},
		);
		const textToAnalyze = ctx.selection ?? ctx.content.slice(0, 2000);
		const userPrompt = [
			`## Text to Analyze and File`,
			'',
			textToAnalyze,
			'',
			`## Source Document: "${ctx.title}"`,
		].join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
};

// ── Check Task List (#43) ─────────────────────────────────────────────

export const checkTaskListAction: CopilotAction = {
	id: 'check-task-list', label: 'Check Task List', description: 'Analyze tasks for priority, overdue items, blockers, and staleness',
	iconId: 'list-checks', category: 'document',
	guard: (ctx) => {
		const hasTasks = /- \[[ x]\]/.test(ctx.content);
		return hasTasks ? null : 'No task items found in document (need - [ ] or - [x])';
	},
	relevance: (ctx) => /- \[[ x]\]/.test(ctx.content) ? 0.8 : 0.1,
	async *execute(ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentCheckTaskList, {},
		);
		const userPrompt = [
			`## Document: "${ctx.title}"`,
			'',
			'## Content',
			ctx.content,
		].join('\n');

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
};

// ── Prompt Audit (#29) ────────────────────────────────────────────────

export const promptAuditAction: CopilotAction = {
	id: 'prompt-audit', label: 'Prompt Audit', description: 'Evaluate prompt templates for quality and suggest improvements',
	iconId: 'clipboard-check', category: 'vault',
	relevance: () => 0.3,
	async *execute(_ctx, signal) {
		const systemPrompt = await AppContext.getInstance().manager.renderPrompt(
			PromptId.CopilotAgentPromptAudit, {},
		);
		// List all prompt templates for the agent to read
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

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
};

// ── Deduplicate Scan (#20) ───────────────────────────────────────────

export const deduplicateScanAction: CopilotAction = {
	id: 'deduplicate-scan', label: 'Deduplicate Scan', description: 'Find files with identical content by MD5 hash',
	iconId: 'fingerprint', category: 'vault',
	relevance: () => 0.4,
	async *execute(_ctx, _signal) {
		const app = AppContext.getInstance().app;
		const files = app.vault.getMarkdownFiles();
		const { hashMD5 } = await import('@/core/utils/hash-utils');

		const hashMap = new Map<string, Array<{ path: string; size: number; modified: number }>>();

		for (const file of files) {
			const content = await app.vault.cachedRead(file);
			const hash = hashMD5(content);
			const entry = { path: file.path, size: file.stat.size, modified: file.stat.mtime };
			const existing = hashMap.get(hash);
			if (existing) {
				existing.push(entry);
			} else {
				hashMap.set(hash, [entry]);
			}
		}

		// Only keep groups with duplicates, sort files in each by modified desc
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

// ── Find & Solve Tasks (#44) ─────────────────────────────────────────

export const findAndSolveTasksAction: CopilotAction = {
	id: 'find-solve-tasks', label: 'Find & Solve Tasks', description: 'Find open tasks with questions and suggest answers from vault notes',
	iconId: 'circle-help', category: 'vault',
	relevance: () => 0.5,
	async *execute(_ctx, signal) {
		const systemPrompt = `You are a task resolution assistant. You search a knowledge vault to find answers to open tasks that contain questions or research items.

Your job:
1. You will receive a list of open tasks (checkboxes) from the vault.
2. For each task that contains a question or research item, search the vault for relevant notes that might answer it.
3. Return a structured JSON result via submit_result with this schema:
{
  "tasks": [
    {
      "filePath": "path/to/file.md",
      "lineNumber": 42,
      "taskText": "the original task text",
      "suggestedAnswer": "concise answer found in vault",
      "sourceNotePath": "path/to/source.md",
      "sourceNoteTitle": "Source Note Title",
      "confidence": 0.85
    }
  ],
  "totalTasksScanned": 15,
  "summary": "Found answers for 3 of 15 tasks"
}

Focus on tasks that ask questions (contain "?"), request research, or mention finding/looking up information. Skip simple action items like "buy groceries" unless the vault contains relevant information.
Only include tasks where you found a credible answer with confidence >= 0.5.`;

		const app = AppContext.getInstance().app;
		const files = app.vault.getMarkdownFiles();
		const todoPattern = /^(\s*)-\s\[\s\]\s(.+)$/;
		const questionIndicators = /\?|find|research|look up|investigate|what|how|why|when|where|figure out/i;

		// Collect tasks that look like questions/research items
		const candidateTasks: Array<{ filePath: string; lineNumber: number; text: string }> = [];
		for (const file of files) {
			const content = await app.vault.cachedRead(file);
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

		const userPrompt = `## Open Tasks with Questions/Research Items

${taskList}

Search the vault for answers to these tasks. Use vault_grep and vault_read_note to find relevant information.`;

		yield* buildCopilotAgentStream({ systemPrompt, userPrompt, signal });
	},
};

// ── Smart Connections (#89) ──────────────────────────────────────────

export const smartConnectionsAction: CopilotAction = {
	id: 'smart-connections', label: 'Smart Connections', description: 'Find semantically similar unlinked notes via graph inspector',
	iconId: 'zap', category: 'vault',
	relevance: (ctx) => ctx.isOrphan ? 0.9 : ctx.links.length < 5 ? 0.6 : 0.3,
	async *execute(ctx, _signal) {
		const { getSemanticNeighbors } = await import('@/service/tools/search-graph-inspector/common');

		const storeManager = SqliteStoreManager.getInstance();
		const indexedDocRepo = storeManager.getIndexedDocumentRepo();

		// 1. Resolve the current document's node ID
		const docMeta = await indexedDocRepo.getByPath(ctx.file.path);
		if (!docMeta) {
			return {
				type: 'structured',
				data: {
					connections: [],
					summary: 'Document not indexed yet. Run indexing first.',
				},
			};
		}

		// 2. Get existing direct links to exclude them
		const app = AppContext.getInstance().app;
		const cache = app.metadataCache.getFileCache(ctx.file);
		const existingLinkPaths = new Set<string>();
		for (const l of cache?.links ?? []) {
			const resolved = app.metadataCache.getFirstLinkpathDest(l.link, ctx.file.path);
			if (resolved) existingLinkPaths.add(resolved.path);
		}

		// Resolve existing link paths to node IDs for filtering
		const existingNodeIds = new Set<string>();
		for (const linkPath of existingLinkPaths) {
			const linkedDoc = await indexedDocRepo.getByPath(linkPath);
			if (linkedDoc) existingNodeIds.add(linkedDoc.id);
		}

		// 3. Get semantic neighbors using the graph inspector's function
		const semanticNeighbors = await getSemanticNeighbors(docMeta.id, 20, existingNodeIds);

		// 4. Build connections with shared themes
		const connections: Array<{
			path: string; title: string; similarityScore: number;
			sharedThemes: string[]; suggestedLinkText: string;
		}> = [];

		// Get tags for the current document
		const { idMapToTags } = await storeManager.getGraphRepo().getTagsByDocIds([docMeta.id]);
		const myTags = new Set<string>(
			idMapToTags.get(docMeta.id)?.topicTags ?? []
		);

		for (const neighbor of semanticNeighbors) {
			const path = JSON.parse(neighbor.attributes || '{}').path;
			if (!path) continue;
			if (path === ctx.file.path) continue;
			if (existingLinkPaths.has(path)) continue;

			// Get tags for the neighbor to find shared themes
			const { idMapToTags: neighborTagsMap } = await storeManager.getGraphRepo().getTagsByDocIds([neighbor.id]);
			const neighborTags = neighborTagsMap.get(neighbor.id)?.topicTags ?? [];
			const sharedThemes = neighborTags.filter(t => myTags.has(t));

			const similarity = parseFloat(neighbor.similarity) / 100;
			const title = neighbor.label || path.replace(/\.md$/, '').split('/').pop() || path;

			connections.push({
				path,
				title,
				similarityScore: similarity,
				sharedThemes: sharedThemes.slice(0, 5),
				suggestedLinkText: title,
			});
		}

		// Sort by similarity
		connections.sort((a, b) => b.similarityScore - a.similarityScore);

		return {
			type: 'structured',
			data: {
				connections: connections.slice(0, 15),
				summary: `Found ${connections.length} semantically similar note${connections.length !== 1 ? 's' : ''} not directly linked to "${ctx.title}".`,
			},
		};
	},
};

// ── Registration ───────────────────────────────────────────────────────

/** All actions in display order: document → vault → writing. */
const ALL_ACTIONS: CopilotAction[] = [
	// Document
	suggestTagsAction, suggestLinksAction, suggestSemanticLinksAction, suggestSplitAction, reviewArticleAction,
	correctContentAction, polishDocumentAction, formatDocumentAction, summarizeAction, extractConceptsAction, translateAction,
	checkTaskListAction,
	// Vault
	findRelatedAction, knowledgeGapsAction, synthesizeTopicAction, vaultHealthAction, vaultSummaryAction, extractTodosAction,
	deduplicateScanAction, findAndSolveTasksAction, smartConnectionsAction,
	detectAndFileAction, promptAuditAction, runWorkflowAction,
	// Writing
	continueWritingAction, rewriteSelectionAction, addEvidenceAction, writingPlanAction, writeArticleAction,
];

/**
 * Register built-in service-side action definitions only.
 *
 * T11 (2026-06-14): UI panel binding moved to
 * `src/ui/view/copilot/copilot-action-surfaces.tsx`. This function no
 * longer mutates actions with React components. Custom prompts load
 * via {@link loadCustomPromptActions} from the app boot path so this
 * module stays free of `@/ui/view/copilot/panels/*` imports.
 */
export function registerAllCopilotActions(): void {
	const registry = CopilotActionRegistry.getInstance();
	for (const action of ALL_ACTIONS) {
		registry.register(action);
	}

	// Load custom prompts from vault (async, non-blocking). Panel binding
	// for `custom-*` ids is provided by the UI surface registry default.
	loadCustomPromptActions().catch(e => console.warn('[Copilot] Failed to load custom prompts:', e));
}

async function loadCustomPromptActions(): Promise<void> {
	const { CustomPromptRegistry } = await import('../CustomPromptRegistry');
	const appContext = AppContext.getInstance();
	const settings = AppContext.getSettings();
	const folder = settings.customPromptsFolder ?? '_prompts';

	const customRegistry = CustomPromptRegistry.getInstance();
	await customRegistry.loadFromVault(appContext.app, folder);

	const registry = CopilotActionRegistry.getInstance();
	for (const def of customRegistry.getAll()) {
		registry.register(customRegistry.buildAction(def));
	}
}
