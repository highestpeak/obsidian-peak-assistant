/**
 * AIGraphAgent: builds a multi-lens knowledge graph from vault search results.
 *
 * Two entry points:
 * - startSession(query)  — search vault, then build graph
 * - startFromPaths(paths) — build graph from explicit file paths
 *
 * Yields LLMStreamEvents for progress tracking; final graph data is emitted
 * via a 'ui-signal' on the 'ai-graph-data' channel.
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { IAgentPrompter } from '@/core/llm/IAgentPrompter';
import { buildLensGraphFromSources, enrichWithThinkingTree } from './ai-graph/build-graph-data';
import type { LensGraphData } from '@/core/types/lens-graph';
import type { SearchResultItem } from '@/core/search/searchTypes';
import {
	runWebSearchQuery,
	type WebSearchQueryResult,
} from '@/service/search/web/runWebSearchQuery';
import { PromptId } from '@/core/types/prompt';
import {
	GraphOutputSchema,
	type GraphOutput,
} from './ai-graph/graph-output-types';
import { graphOutputToLensData } from './ai-graph/graph-output-to-lens';

export type AIGraphEvent = LLMStreamEvent;

/**
 * Harness tier: local-deep (graph build is compute-heavy; no LLM loop by default).
 *
 * T11J B1: takes explicit `app`, `searchClient`, `prompter` deps instead of
 * reaching `AppContext.getInstance()`.
 */
export class AIGraphAgent {
	constructor(
		private readonly app: AppHandle,
		private readonly searchClient: SearchClient,
		private readonly prompter: IAgentPrompter,
	) {}

	/**
	 * Search the vault for the given query and build a topology graph from results.
	 */
	async *startSession(
		userQuery: string,
		options: {
			webEnabled?: boolean;
			graphType?: 'free' | 'concept' | 'entity' | 'evidence' | 'causal' | 'timeline';
			signal?: AbortSignal;
		} = {},
	): AsyncGenerator<AIGraphEvent> {
		yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'searching' } } as any;

		const results = await this.searchClient.search(
			{ text: userQuery, scopeMode: 'all', topK: 30, searchMode: 'hybrid' },
		);

		yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'building-graph' } } as any;

		const extracted = await this.extractArtifactGraph(
			userQuery,
			results.items,
			options.graphType ?? 'free',
			options.signal,
			'',
		);
		const graphData = extracted
			?? await buildLensGraphFromSources(results.items, this.app);
		let webResearch: WebSearchQueryResult | null = null;
		if (options.webEnabled) {
			yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'web-searching' } } as any;
			webResearch = await runWebSearchQuery(userQuery);
			for (const source of webResearch.sources) {
				if (graphData.nodes.some((node) => node.path === source.url)) continue;
				graphData.nodes.push({
					label: source.title,
					path: source.url,
					role: 'leaf',
					group: 'Web',
				});
			}
		}

		yield {
			type: 'ui-signal',
			channel: 'ai-graph-data',
			data: { graphData, webResearch },
		} as any;

		yield { type: 'complete', result: { summary: `Built graph with ${graphData.nodes.length} nodes` } } as any;
	}

	private async extractArtifactGraph(
		searchQuery: string,
		results: readonly SearchResultItem[],
		graphType: 'free' | 'concept' | 'entity' | 'evidence' | 'causal' | 'timeline',
		signal?: AbortSignal,
		currentGraph = '',
	): Promise<LensGraphData | null> {
		const resolved = [];
		for (const result of results.slice(0, 12)) {
			if (!result.path) continue;
			const file = this.app.vault.getFileByPath(result.path);
			if (!file) continue;
			const content = await this.app.vault.cachedRead(file);
			resolved.push({
				source_path: result.path,
				title: result.title,
				// Keep the extraction envelope bounded. The canonical source
				// hash is computed later from the full file body.
				content: content.slice(0, 6_000),
			});
		}
		if (resolved.length === 0 && !currentGraph.trim()) return null;
		try {
			const output = await this.prompter.queryStructured<GraphOutput>(
				PromptId.AIGraphArtifactExtract,
				{
					searchQuery,
					graphType,
					sourcesText: JSON.stringify(resolved),
					currentGraph,
				},
				GraphOutputSchema,
				{
					signal,
					usageFeature: 'graph',
					usageAction: 'ai-graph-artifact-extract',
				},
			);
			if (!output?.nodes?.length) return null;
			const contentByPath = new Map(
				resolved.map((source) => [source.source_path, source.content]),
			);
			if (currentGraph.trim()) {
				try {
					const parsed = JSON.parse(currentGraph) as {
						sources?: Array<{ locator?: string; content?: string }>;
					};
					for (const source of parsed.sources ?? []) {
						if (source.locator && source.content) {
							contentByPath.set(source.locator, source.content);
						}
					}
				} catch {
					// The snapshot is app-produced JSON; a malformed optional
					// snapshot simply cannot contribute new evidence.
				}
			}
			const groundedEvidence = (
				items: readonly { source_path: string; quote: string }[] | undefined,
			) => (items ?? []).filter((item) =>
				contentByPath.get(item.source_path)?.includes(item.quote.trim()));
			const groundedOutput: GraphOutput = {
				...output,
				nodes: output.nodes.map((node) => ({
					...node,
					evidence: groundedEvidence(node.evidence),
				})),
				edges: output.edges.map((edge) => ({
					...edge,
					evidence: groundedEvidence(edge.evidence),
				})),
			};
			return graphOutputToLensData(
				groundedOutput,
				resolved.map((source) => source.source_path),
			);
		} catch (error) {
			console.warn('[AIGraphAgent] typed artifact extraction failed; using deterministic graph.', error);
			return null;
		}
	}

	/**
	 * Update path for a persisted artifact. It resolves the graph's registered
	 * Vault sources directly instead of running a new broad Vault search.
	 */
	async *startFromResolvedSources(
		userQuery: string,
		paths: string[],
		options: {
			graphType: 'free' | 'concept' | 'entity' | 'evidence' | 'causal' | 'timeline';
			currentGraph: string;
			webEnabled?: boolean;
			signal?: AbortSignal;
		},
	): AsyncGenerator<AIGraphEvent> {
		yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'building-graph' } } as any;
		const sources: SearchResultItem[] = [...new Set(paths)].map((path) => ({
			id: path,
			type: 'markdown' as any,
			title: path.split('/').pop() ?? path,
			path,
			lastModified: 0,
			score: 1,
			finalScore: 1,
			highlight: null,
		}));
		const extracted = await this.extractArtifactGraph(
			userQuery,
			sources,
			options.graphType,
			options.signal,
			options.currentGraph,
		);
		const graphData = extracted
			?? await buildLensGraphFromSources(sources, this.app);
		let webResearch: WebSearchQueryResult | null = null;
		if (options.webEnabled) {
			yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'web-searching' } } as any;
			webResearch = await runWebSearchQuery(userQuery);
			for (const source of webResearch.sources) {
				if (graphData.nodes.some((node) => node.path === source.url)) continue;
				graphData.nodes.push({
					label: source.title,
					path: source.url,
					artifactKind: 'web-resource',
					canonicalRef: source.url,
					role: 'leaf',
					group: 'Web',
				});
			}
		}
		yield {
			type: 'ui-signal',
			channel: 'ai-graph-data',
			data: { graphData, webResearch },
		} as any;
		yield {
			type: 'complete',
			result: { summary: `Built graph with ${graphData.nodes.length} nodes` },
		} as any;
	}

	/**
	 * Build a graph from explicit file paths (no search step).
	 */
	async *startFromPaths(paths: string[]): AsyncGenerator<AIGraphEvent> {
		yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'building-graph' } } as any;

		const sources: SearchResultItem[] = paths.map((p) => ({
			id: p,
			type: 'markdown' as any,
			title: p.split('/').pop() ?? p,
			path: p,
			lastModified: 0,
			score: 0,
			finalScore: 0,
			highlight: null,
		}));

		const graphData = await buildLensGraphFromSources(sources, this.app);

		yield {
			type: 'ui-signal',
			channel: 'ai-graph-data',
			data: { graphData },
		} as any;

		yield { type: 'complete', result: { summary: `Built graph with ${graphData.nodes.length} nodes` } } as any;
	}

	/**
	 * Enrich existing graph data with an AI-inferred thinking tree layer.
	 */
	async enrichThinkingTree(currentData: LensGraphData): Promise<LensGraphData> {
		return enrichWithThinkingTree(currentData, this.app, this.prompter);
	}
}
