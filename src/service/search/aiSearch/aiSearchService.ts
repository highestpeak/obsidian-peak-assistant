import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchResultItem, AiAnalyzeResult } from '../types';
import type { StreamingCallbacks } from '@/service/chat/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { GraphPreview } from '@/core/storage/graph/types';
import type { GraphNodeType } from '@/core/po/graph.po';
import type { SearchSettings } from '@/app/settings/types';
import {
	AI_SEARCH_GRAPH_MAX_NODES_PER_SOURCE,
	AI_SEARCH_GRAPH_MAX_HOPS,
	AI_SEARCH_GRAPH_FINAL_MAX_NODES,
} from '@/core/constant';
import { PromptId } from '@/service/prompt/PromptId';

/**
 * AI Search Service for generating summaries, graphs, and topics from search results.
 */
export class AISearchService {

	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly searchSettings: SearchSettings,
	) {
	}

	/**
	 * Generate summary with streaming support using streamChatWithPrompt.
	 */
	private async generateSummaryWithStreaming(params: {
		query: string;
		sources: SearchResultItem[];
		webEnabled: boolean;
		graph?: GraphPreview;
		callbacks?: StreamingCallbacks;
	}): Promise<{ summary: string; estimatedTokens: number }> {
		const { query, sources, webEnabled, graph, callbacks } = params;

		try {
			// Build sources array for prompt
			const sourcesArray = sources.map((s) => ({
				title: s.title,
				path: s.path,
				snippet: s.highlight?.text || s.content || undefined,
			}));

			// Build graph context text
			let graphContext: string | undefined;
			if (graph && graph.nodes.length > 0) {
				const nodeLabels = graph.nodes
					.slice(0, 20)
					.map((n) => n.label)
					.join(', ');
				graphContext = nodeLabels;
			}

			// Use streaming chatWithPrompt
			let estimatedTokens = 0;
			// const summary = await this.aiServiceManager.chatWithPromptStream(
			// 	PromptId.SearchAiSummary,
			// 	{
			// 		query,
			// 		sources: sourcesArray,
			// 		graphContext,
			// 		webEnabled,
			// 	},
			// 	callbacks || {},
			// 	'summary',
			// );
			const summary = 'deprecated';

			// Fallback token estimation if not provided
			estimatedTokens = Math.ceil((query.length + sourcesArray.reduce((sum, s) => sum + (s.snippet?.length || 0) + s.title.length, 0)) / 4);

			return { summary, estimatedTokens };
		} catch (error) {
			console.warn('[AISearchService] Failed to generate summary:', error);
			// Fallback: use first source's snippet as summary
			const firstSnippet = sources.length > 0
				? (sources[0]?.highlight?.text || sources[0]?.content || 'No summary available')
				: 'No summary available';
			const estimatedTokens = Math.ceil(firstSnippet.length / 4);
			return { summary: firstSnippet, estimatedTokens };
		}
	}

	/**
	 * Extract topics with streaming support using streamChatWithPrompt.
	 * Topics are parsed from JSON response when stream completes.
	 */
	private async extractTopicsWithStreaming(params: {
		query: string;
		sources: SearchResultItem[];
		summary: string;
		graph?: GraphPreview;
		callbacks?: StreamingCallbacks;
	}): Promise<Array<{ label: string; weight: number }>> {
		const { query, sources, summary, graph, callbacks } = params;

		try {
			// Build sources array for prompt
			const sourcesArray = sources
				.slice(0, 5)
				.map((s) => ({
					title: s.title,
					path: s.path,
				}));

			// Build graph context text
			let graphContext: string | undefined;
			if (graph && graph.nodes.length > 0) {
				const nodeLabels = graph.nodes
					.slice(0, 20)
					.map((n) => n.label)
					.join(', ');
				graphContext = nodeLabels;
			}

			// Notify UI that topics extraction is starting
			callbacks?.onStart?.('topics');

			// Use streaming chatWithPrompt
			// const content = await this.aiServiceManager.chatWithPromptStream(
			// 	PromptId.SearchTopicExtractJson,
			// 	{
			// 		query,
			// 		summary,
			// 		sources: sourcesArray,
			// 		graphContext,
			// 	},
			// 	callbacks || {},
			// 	'topics',
			// );
			const content = 'deprecated';

			// Parse final topics from JSON
			const topics = this.parseTopicsFromJson(content);

			// Notify completion with parsed topics in metadata
			// Always call onComplete to notify UI that topics extraction is done
			// Pass topics even if empty, so UI can clear loading state
			if (callbacks?.onComplete) {
				callbacks.onComplete('topics', content, { topics: topics.length > 0 ? topics : [] });
			}

			return topics;
		} catch (error) {
			console.warn('[AISearchService] Failed to extract topics:', error);
			return [];
		}
	}

	/**
	 * Parse topics from JSON content.
	 * Handles markdown code blocks (```json ... ```) by stripping them before parsing.
	 */
	private parseTopicsFromJson(content: string): Array<{ label: string; weight: number }> {
		try {
			// Remove markdown code block markers if present
			let cleanedContent = content.trim();

			// Remove ```json or ``` at the start
			cleanedContent = cleanedContent.replace(/^```json\s*/i, '');
			cleanedContent = cleanedContent.replace(/^```\s*/, '');

			// Remove ``` at the end
			cleanedContent = cleanedContent.replace(/\s*```$/, '');

			// Trim again after removing markers
			cleanedContent = cleanedContent.trim();

			const topics = JSON.parse(cleanedContent) as Array<{ label: string; weight: number }>;
			// Validate and sort by weight
			return topics
				.filter((t) => t.label && typeof t.weight === 'number')
				.sort((a, b) => b.weight - a.weight)
				.slice(0, 10);
		} catch (error) {
			console.warn('[AISearchService] Failed to parse topics from JSON:', error, 'content:', content);
			// If parsing fails, return empty array
			return [];
		}
	}

	/**
	 * Get model configuration for AI search operations.
	 * Uses searchSummaryModel if configured, otherwise falls back to defaultModel.
	 */
	private async getModelConfig(): Promise<{ provider: string; model: string }> {
		// Use searchSummaryModel if configured
		const searchSummaryModel = this.searchSettings.searchSummaryModel;
		if (searchSummaryModel) {
			return {
				provider: searchSummaryModel.provider,
				model: searchSummaryModel.modelId,
			};
		}

		// Fallback to defaultModel
		const aiSettings = this.aiServiceManager.getSettings();
		return {
			provider: aiSettings.defaultModel.provider,
			model: aiSettings.defaultModel.modelId,
		};
	}

	/**
	 * Generate AI analysis from search results with parallel execution where possible.
	 * Supports optional streaming callbacks for progressive updates.
	 */
	async analyze(params: {
		query: string;
		sources: SearchResultItem[];
		webEnabled?: boolean;
		callbacks?: StreamingCallbacks;
	}): Promise<Omit<AiAnalyzeResult, 'sources'>> {
		const { query, sources, webEnabled = false, callbacks } = params;

		try {
			// Parallel execution: graph generation and summary generation can run concurrently
			const [graph, summaryResult] = await Promise.all([
				// 1. Generate graph preview from all sources (independent)
				this.generateGraph(sources).then(graph => {
					// Notify graph completion via streaming callback
					callbacks?.onComplete?.('graph', '', { graph });
					return graph;
				}),
				// 2. Generate summary using LLM with streaming support
				this.generateSummaryWithStreaming({
					query,
					sources,
					webEnabled,
					graph: undefined, // Will enhance summary with graph later if needed
					callbacks,
				}),
			]);

			const { summary, estimatedTokens } = summaryResult;

			// 3. Extract topics using LLM with streaming support
			const topics = await this.extractTopicsWithStreaming({
				query,
				sources,
				summary,
				graph,
				callbacks,
			});

			const result = {
				summary,
				insights: {
					topics: topics.length > 0 ? topics : undefined,
					graph: graph && graph.nodes.length > 0 ? graph : undefined,
				},
				usage: {
					estimatedTokens,
				},
			};

			return result;

		} catch (error) {
			callbacks?.onError?.('other', error);
			throw error;
		}
	}

	/**
	 * Generate graph preview from all search results.
	 * Ensures all source files are included as nodes, then traverses relationships.
	 */
	private async generateGraph(sources: SearchResultItem[]): Promise<GraphPreview | undefined> {
		if (sources.length === 0) {
			return undefined;
		}

		const graphStore = sqliteStoreManager.getGraphStore();
		const knownNodes = new Map<string, { id: string; label: string; type: string }>();
		const allEdges: Array<{ from_node_id: string; to_node_id: string; weight: number }> = [];

		// First, ensure all source files are included as nodes
		// This guarantees that all search results appear in the graph
		for (const source of sources) {
			const sourcePath = source.path;
			// Check if node exists in graph store, if not create a placeholder
			const existingNode = await graphStore.getNode(sourcePath);
			if (existingNode) {
				knownNodes.set(sourcePath, {
					id: sourcePath,
					label: existingNode.label,
					type: existingNode.type,
				});
			} else {
				// Node doesn't exist in graph yet, create placeholder
				knownNodes.set(sourcePath, {
					id: sourcePath,
					label: source.title || sourcePath.split('/').pop() || sourcePath,
					type: 'document',
				});
			}
		}

		// Then traverse each source result to get related nodes and edges
		for (const source of sources) {
			const sourcePath = source.path;

			try {
				// Get preview for this source
				const preview = await graphStore.getPreview({
					currentFilePath: sourcePath,
					maxNodes: AI_SEARCH_GRAPH_MAX_NODES_PER_SOURCE,
					maxHops: AI_SEARCH_GRAPH_MAX_HOPS,
				});

				// Add all nodes from preview (including the source node itself)
				for (const node of preview.nodes) {
					if (!knownNodes.has(node.id)) {
						knownNodes.set(node.id, {
							id: node.id,
							label: node.label,
							type: node.type,
						});
					}
				}

				// Add edges (avoid duplicates)
				for (const edge of preview.edges) {
					const edgeKey = `${edge.from_node_id}->${edge.to_node_id}`;
					if (!allEdges.some((e) => `${e.from_node_id}->${e.to_node_id}` === edgeKey)) {
						allEdges.push({
							from_node_id: edge.from_node_id,
							to_node_id: edge.to_node_id,
							weight: edge.weight ?? 1.0,
						});
					}
				}
			} catch (error) {
				console.warn(`[AISearchService] Failed to get graph preview for ${sourcePath}:`, error);
			}
		}

		if (knownNodes.size === 0) {
			return undefined;
		}

		// Convert to GraphPreview format
		// All nodes are already in knownNodes map, including all source files
		const nodes: GraphPreview['nodes'] = [];
		for (const [id, nodeInfo] of knownNodes) {
			if (nodes.length >= AI_SEARCH_GRAPH_FINAL_MAX_NODES) break;
			let label = nodeInfo.label;
			// Add # prefix for tags
			if (nodeInfo.type === 'tag') {
				label = `#${label}`;
			}
			nodes.push({
				id,
				label,
				type: (nodeInfo.type === 'other' ? 'custom' : nodeInfo.type) as GraphNodeType,
			});
		}

		// Filter edges to only include nodes in the final graph
		const nodeSet = new Set(nodes.map((n) => n.id));
		const edges: GraphPreview['edges'] = allEdges.filter(
			(e) => nodeSet.has(e.from_node_id) && nodeSet.has(e.to_node_id)
		);

		return { nodes, edges };
	}
}

