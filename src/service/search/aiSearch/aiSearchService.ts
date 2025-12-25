import type { AIServiceManager } from '@/service/chat/service-manager';
import type { SearchResultItem, AiAnalyzeResult } from '../types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { GraphPreview } from '@/core/storage/graph/types';
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
	 * Generate AI analysis from search results.
	 */
	async analyze(params: {
		query: string;
		sources: SearchResultItem[];
		webEnabled?: boolean;
	}): Promise<Omit<AiAnalyzeResult, 'sources'>> {
		const { query, sources, webEnabled = false } = params;

		// 1. Generate graph preview from all sources
		const graph = await this.generateGraph(sources);

		// 2. Generate summary using LLM (with graph context)
		const { summary, estimatedTokens } = await this.generateSummary({
			query,
			sources,
			webEnabled,
			graph,
		});

		// 3. Extract topics using LLM (with graph context)
		const topics = await this.extractTopics({ query, sources, summary, graph });

		return {
			summary,
			insights: {
				topics: topics.length > 0 ? topics : undefined,
				graph: graph && graph.nodes.length > 0 ? graph : undefined,
			},
			usage: {
				estimatedTokens,
			},
		};
	}

	/**
	 * Generate graph preview from all search results.
	 * Traverses each result with maxHop=2, maintaining a known nodes set.
	 */
	private async generateGraph(sources: SearchResultItem[]): Promise<GraphPreview | undefined> {
		if (sources.length === 0) {
			return undefined;
		}

		const graphStore = sqliteStoreManager.getGraphStore();
		const knownNodes = new Set<string>();
		const allNodes = new Set<string>();
		const allEdges: Array<{ from_node_id: string; to_node_id: string; weight: number }> = [];

		// Traverse each source result
		for (const source of sources) {
			const sourcePath = source.path;
			
			// Skip if already processed
			if (knownNodes.has(sourcePath)) {
				continue;
			}

			try {
				// Get preview for this source
				const preview = await graphStore.getPreview({
					currentFilePath: sourcePath,
					maxNodes: AI_SEARCH_GRAPH_MAX_NODES_PER_SOURCE,
					maxHops: AI_SEARCH_GRAPH_MAX_HOPS,
				});

				// Add nodes to known set and allNodes
				for (const node of preview.nodes) {
					if (!knownNodes.has(node.id)) {
						knownNodes.add(node.id);
						allNodes.add(node.id);
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

		if (allNodes.size === 0) {
			return undefined;
		}

		// Build final graph (limit to max nodes)
		const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
		const nodeMap = await graphNodeRepo.getByIds(Array.from(allNodes));
		const nodes: GraphPreview['nodes'] = [];
		
		for (const [id, nodeRow] of nodeMap) {
			if (nodes.length >= AI_SEARCH_GRAPH_FINAL_MAX_NODES) break;
			let label = nodeRow.label;
			// Add # prefix for tags
			if (nodeRow.type === 'tag') {
				label = `#${label}`;
			}
			nodes.push({
				id,
				label,
				type: nodeRow.type as any,
			});
		}

		// Filter edges to only include nodes in the final graph
		const nodeSet = new Set(nodes.map((n) => n.id));
		const edges: GraphPreview['edges'] = allEdges.filter(
			(e) => nodeSet.has(e.from_node_id) && nodeSet.has(e.to_node_id)
		);

		return { nodes, edges };
	}

	/**
	 * Generate summary using LLM.
	 */
	private async generateSummary(params: {
		query: string;
		sources: SearchResultItem[];
		webEnabled: boolean;
		graph?: GraphPreview;
	}): Promise<{ summary: string; estimatedTokens: number }> {
		const { query, sources, webEnabled, graph } = params;

		try {
			// Get model configuration (searchSummaryModel or defaultModel)
			const { provider, model } = await this.getModelConfig();
			
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

			// Generate summary using SearchAiSummary prompt
			const summary = await this.aiServiceManager.chatWithPrompt(
				PromptId.SearchAiSummary,
				{
					query,
					sources: sourcesArray,
					graphContext,
					webEnabled,
				},
				provider,
				model
			);

			// Rough token estimation (4 chars per token)
			const estimatedTokens = Math.ceil((query.length + sourcesArray.reduce((sum, s) => sum + (s.snippet?.length || 0) + s.title.length, 0)) / 4);

			return { summary, estimatedTokens };
		} catch (error) {
			console.warn('[AISearchService] Failed to generate summary:', error);
			// Fallback: use first source's snippet as summary
			const firstSnippet = sources.length > 0
				? sources[0]!.highlight?.text || sources[0]!.content || ''
				: '';
			return {
				summary: firstSnippet.slice(0, 200),
				estimatedTokens: 0,
			};
		}
	}

	/**
	 * Extract topics using LLM from query, sources, summary, and graph.
	 */
	private async extractTopics(params: {
		query: string;
		sources: SearchResultItem[];
		summary: string;
		graph?: GraphPreview;
	}): Promise<Array<{ label: string; weight: number }>> {
		const { query, sources, summary, graph } = params;

		try {
			// Get model configuration (searchSummaryModel or defaultModel)
			const { provider, model } = await this.getModelConfig();
			
			const multiChat = this.aiServiceManager.getMultiChat();

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

			// Render prompt and call LLM via AIServiceManager
			const content = await this.aiServiceManager.chatWithPrompt(
				PromptId.SearchTopicExtractJson,
				{
					query,
					summary,
					sources: sourcesArray,
					graphContext,
				},
				provider,
				model
			);

			// Parse JSON response
			// Try to extract JSON array from response
			const jsonMatch = content.match(/\[[\s\S]*\]/);
			if (jsonMatch) {
				const topics = JSON.parse(jsonMatch[0]) as Array<{ label: string; weight: number }>;
				// Validate and sort by weight
				return topics
					.filter((t) => t.label && typeof t.weight === 'number')
					.sort((a, b) => b.weight - a.weight)
					.slice(0, 10);
			}

			// Fallback: try to parse the entire response as JSON
			try {
				const topics = JSON.parse(content) as Array<{ label: string; weight: number }>;
				return topics
					.filter((t) => t.label && typeof t.weight === 'number')
					.sort((a, b) => b.weight - a.weight)
					.slice(0, 10);
			} catch {
				// If parsing fails, return empty array
				return [];
			}
		} catch (error) {
			console.warn('[AISearchService] Failed to extract topics:', error);
			return [];
		}
	}
}

