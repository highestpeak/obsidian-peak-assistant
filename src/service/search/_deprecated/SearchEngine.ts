/**
 * @deprecated This file is deprecated and will be removed in a future commit.
 * Worker-based search has been replaced by main-thread SQLite search (USKE architecture).
 * See: src/core/storage/README.md
 */

import type { AiAnalyzeRequest, AiAnalyzeResult, RagSource, SearchMode, SearchQuery, SearchResponse, SearchResultItem, SearchScope, SearchSnippet } from '@/service/search/types';
import type { OramaSearchIndex } from './orama/OramaSearchIndex';
import type { RecentOpenRepo } from '@/core/storage/sqlite/repositories/RecentOpenRepo';
import type { GraphStore } from '@/core/storage/graph/GraphStore';

/**
 * Build a small snippet window around the first occurrence of the query.
 *
 * Notes:
 * - Best-effort: for MVP we do not attempt tokenization or multiple highlights.
 * - Offsets are JS string indices (UTF-16).
 */
function buildSnippet(content: string, query: string): SearchSnippet | null {
	const q = query.trim();
	if (!content) return null;
	if (!q) {
		return { text: content.slice(0, 200), highlights: [] };
	}

	const lower = content.toLowerCase();
	const lowerQ = q.toLowerCase();
	const idx = lower.indexOf(lowerQ);

	// Fallback: return beginning of content.
	if (idx < 0) {
		return { text: content.slice(0, 220), highlights: [] };
	}

	const windowBefore = 80;
	const windowAfter = 140;
	const start = Math.max(0, idx - windowBefore);
	const end = Math.min(content.length, idx + lowerQ.length + windowAfter);
	const snippetText = content.slice(start, end);

	const highlightStart = idx - start;
	const highlightEnd = highlightStart + lowerQ.length;
	return { text: snippetText, highlights: [{ start: highlightStart, end: highlightEnd }] };
}

/**
 * Filter engine hits by UI scope.
 */
function shouldKeepPathByScope(params: {
	mode: SearchMode;
	scope?: SearchScope;
	path: string;
}): boolean {
	const { mode, scope, path } = params;

	if (mode === 'inFile') {
		return Boolean(scope?.currentFilePath && path === scope.currentFilePath);
	}
	if (mode === 'inFolder') {
		const folderPath = scope?.folderPath;
		if (!folderPath) return true;
		const prefix = `${folderPath}/`;
		return path === folderPath || path.startsWith(prefix);
	}
	return true;
}

type RankingSignals = Map<string, { lastOpenTs: number; openCount: number }>;

/**
 * Apply metadata/graph based boosts to items and return a sorted copy.
 *
 * Notes:
 * - This intentionally keeps the formula simple and stable.
 * - Minor tuning: clamp recency boost to [0, 0.3] to avoid unbounded negative drift.
 */
function applyRankingBoosts(params: {
	items: SearchResultItem[];
	signals: RankingSignals;
	relatedPaths: Set<string>;
	nowTs?: number;
}): SearchResultItem[] {
	const now = params.nowTs ?? Date.now();
	const items = params.items.map((i) => ({ ...i }));

	for (const item of items) {
		const s = params.signals.get(item.path);
		if (!s) continue;

		const freqBoost = Math.log1p(s.openCount) * 0.15;

		const dayMs = 1000 * 60 * 60 * 24;
		const days = s.lastOpenTs ? Math.max(0, (now - s.lastOpenTs) / dayMs) : Infinity;
		const recencyBoost = Number.isFinite(days) ? Math.max(0, 0.3 - days * 0.01) : 0;

		const graphBoost = params.relatedPaths.has(item.path) ? 0.2 : 0;

		const base = item.score ?? 0;
		item.finalScore = base + freqBoost + recencyBoost + graphBoost;
	}

	items.sort((a, b) => (b.finalScore ?? b.score ?? 0) - (a.finalScore ?? a.score ?? 0));
	return items;
}

/**
 * Build RAG sources list from Orama hits.
 */
function buildRagSources(params: { hits: any[]; query: string }): RagSource[] {
	const q = params.query ?? '';
	return (params.hits ?? []).map((hit: any) => {
		const doc = hit.document ?? {};
		const snippet = buildSnippet(doc.content ?? '', q);
		return {
			path: doc.path ?? hit.id,
			title: doc.title ?? doc.path ?? hit.id,
			snippet: snippet?.text ?? '',
			score: hit.score,
		};
	});
}

/**
 * Build AI analyze result payload (summary is produced by LLM later).
 */
function buildAiAnalyzeResult(params: { hits: any[]; query: string; graphStore: GraphStore }): AiAnalyzeResult {
	const sources = buildRagSources({ hits: params.hits, query: params.query });
	const focusPath = sources[0]?.path;
	const graphPreview = focusPath ? params.graphStore.getPreview({ currentFilePath: focusPath, maxNodes: 28 }) : { nodes: [], edges: [] };

	return {
		summary: '',
		sources,
		insights: {
			graph: graphPreview,
		},
		usage: { estimatedTokens: 0 },
	};
}

/**
 * SearchEngine owns search business logic (scope filtering, snippet building, ranking, rag assembly).
 *
 * Notes:
 * - Runs inside worker thread.
 * - Does not manage worker lifecycle or RPC.
 */
export class SearchEngine {
	constructor(
		private readonly orama: OramaSearchIndex,
		private readonly recentOpen: RecentOpenRepo,
		private readonly graphStore: GraphStore,
	) {}

	async search(params: { query: SearchQuery }): Promise<SearchResponse> {
		const q = params.query;
		const term = q?.text ?? '';
		const embedding = q?.embedding;
		const searchMode = embedding
			? q?.searchMode ?? 'hybrid'
			: q?.searchMode ?? 'fulltext';

		const results = await this.orama.search({
			searchMode,
			term: term || undefined,
			embedding,
			properties: ['title', 'content'],
			boost: { title: 2, content: 1 },
			limit: q?.topK ?? 50,
		});

		let hits: any[] = results?.hits ?? [];
		const mode = q?.mode ?? 'vault';
		const scope = q?.scope ?? {};

		hits = hits.filter((h) => shouldKeepPathByScope({ mode, scope, path: String(h?.document?.path ?? '') }));

		const items: SearchResultItem[] = hits.map((hit: any) => {
			const doc = hit.document ?? {};
			const snippet = buildSnippet(doc.content ?? '', term);
			return {
				id: doc.id ?? hit.id,
				type: (doc.type ?? 'markdown') as any,
				title: doc.title ?? doc.path ?? hit.id,
				path: doc.path ?? hit.id,
				lastModified: doc.mtime ?? 0,
				snippet: snippet ? { text: snippet.text, highlights: snippet.highlights } : null,
				score: hit.score,
				finalScore: hit.score,
			};
		});

		const signals = this.recentOpen.getSignalsForPaths(items.map((i) => i.path));
		const related = scope?.currentFilePath ? this.graphStore.getRelatedFilePaths({ currentFilePath: scope.currentFilePath, maxHops: 2 }) : new Set<string>();
		const ranked = applyRankingBoosts({ items, signals, relatedPaths: related });

		return {
			query: q,
			items: ranked,
		};
	}

	async aiAnalyze(params: { req: AiAnalyzeRequest; embedding?: number[] }): Promise<AiAnalyzeResult> {
		const q = params.req?.query ?? '';
		const topK = Number(params.req?.topK ?? 8);
		const embedding = params.embedding;
		const searchMode = embedding ? 'hybrid' : 'fulltext';

		const results = await this.orama.search({
			searchMode,
			term: q || undefined,
			embedding,
			properties: ['title', 'content'],
			boost: { title: 2, content: 1 },
			limit: topK,
		});

		return buildAiAnalyzeResult({ hits: results?.hits ?? [], query: q, graphStore: this.graphStore });
	}
}


