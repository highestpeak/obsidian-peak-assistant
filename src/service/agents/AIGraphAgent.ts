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
	async *startSession(userQuery: string): AsyncGenerator<AIGraphEvent> {
		yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'searching' } } as any;

		const results = await this.searchClient.search(
			{ text: userQuery, scopeMode: 'vault', topK: 30, searchMode: 'hybrid' },
			false,
		);

		yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'building-graph' } } as any;

		const graphData = await buildLensGraphFromSources(results.items, this.app);

		yield {
			type: 'ui-signal',
			channel: 'ai-graph-data',
			data: { graphData },
		} as any;

		yield { type: 'complete', result: { summary: `Built graph with ${graphData.nodes.length} nodes` } } as any;
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
