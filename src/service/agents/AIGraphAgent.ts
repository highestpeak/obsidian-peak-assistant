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

import type { LLMStreamEvent } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { AppContext } from '@/app/context/AppContext';
import { buildLensGraphFromSources, enrichWithThinkingTree } from './ai-graph/build-graph-data';
import type { LensGraphData } from '@/ui/component/mine/multi-lens-graph/types';
import type { SearchResultItem } from '@/service/search/types';

export type AIGraphEvent = LLMStreamEvent;

export class AIGraphAgent {
	constructor(private readonly aiServiceManager: AIServiceManager) {}

	/**
	 * Search the vault for the given query and build a topology graph from results.
	 */
	async *startSession(userQuery: string): AsyncGenerator<AIGraphEvent> {
		const ctx = AppContext.getInstance();

		yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'searching' } } as any;

		// Search vault for relevant sources
		const searchClient = ctx.searchClient;
		const results = await searchClient.search(
			{ text: userQuery, scopeMode: 'vault', topK: 30, searchMode: 'hybrid' },
			false,
		);

		yield { type: 'ui-signal', channel: 'search-stage', data: { stage: 'building-graph' } } as any;

		// Build graph from search results
		const graphData = await buildLensGraphFromSources(results.items);

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

		const graphData = await buildLensGraphFromSources(sources);

		yield {
			type: 'ui-signal',
			channel: 'ai-graph-data',
			data: { graphData },
		} as any;

		yield { type: 'complete', result: { summary: `Built graph with ${graphData.nodes.length} nodes` } } as any;
	}

	/**
	 * Enrich existing graph data with an AI-inferred thinking tree layer.
	 * Placeholder until Task 7 implements the actual enrichment.
	 */
	async enrichThinkingTree(currentData: LensGraphData): Promise<LensGraphData> {
		return enrichWithThinkingTree(currentData);
	}
}
