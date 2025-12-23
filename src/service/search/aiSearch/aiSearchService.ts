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

/**
 * AI Search Service for generating summaries, graphs, and topics from search results.
 */
export class AISearchService {
	constructor(
		private readonly aiServiceManager: AIServiceManager,
		private readonly searchSettings: SearchSettings,
	) {}

	/**
	 * Get model configuration for AI search operations.
	 * Uses searchSummaryModel if configured, otherwise falls back to default provider + defaultModelId.
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

		// Fallback to default provider + defaultModelId
		const aiSettings = this.aiServiceManager.getSettings();
		const defaultModelId = aiSettings.defaultModelId;
		
        // todo actually it is not a good config style. as we need to config both provider and model id. we need refactor this.
		// Find provider for the default model
		const models = await this.aiServiceManager.getAllAvailableModels();
		const modelInfo = models.find((m) => m.id === defaultModelId);
		if (!modelInfo) {
			throw new Error(`Default model ${defaultModelId} not found in available models`);
		}
		
		return {
			provider: modelInfo.provider,
			model: modelInfo.id,
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
			// Get model configuration (searchSummaryModel or default provider + defaultModelId)
			const { provider, model } = await this.getModelConfig();
			
			// Build prompt for summary generation
			const sourcesText = sources
				.map((s) => {
					const snippet = s.highlight?.text || s.content || '';
					return `- ${s.title} (${s.path})${snippet ? `\n  ${snippet.trimEnd()}` : ''}`;
				})
				.join('\n');

			// Build graph context text
			let graphText = '';
			if (graph && graph.nodes.length > 0) {
				const nodeLabels = graph.nodes
					.slice(0, 20)
					.map((n) => n.label)
					.join(', ');
				graphText = `\n\nKnowledge Graph (related concepts):\n${nodeLabels}`;
			}

			const webText = webEnabled ? '\nWeb search is enabled (if you have web results, incorporate them).' : '';

			const text = `User question: ${query}

You must answer in Chinese.${webText}

Sources (snippets):
${sourcesText}${graphText}

Task: Provide a concise, high-signal answer. Cite sources by file path when appropriate.`;

			// Calculate estimated tokens (rough estimate: ~4 characters per token)
			const estimatedTokens = Math.ceil((text.length + query.length) / 4);

			const summary = await this.aiServiceManager.getApplicationService().summarize({
				provider,
				model,
				text,
			});

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
			// Get model configuration (searchSummaryModel or default provider + defaultModelId)
			const { provider, model } = await this.getModelConfig();
			
			const multiChat = this.aiServiceManager.getMultiChat();

			// Build prompt for topic extraction
			const sourcesText = sources
				.slice(0, 5)
				.map((s, idx) => `${idx + 1}. ${s.title} (${s.path})`)
				.join('\n');

			// Build graph context text
			let graphText = '';
			if (graph && graph.nodes.length > 0) {
				const nodeLabels = graph.nodes
					.slice(0, 20)
					.map((n) => n.label)
					.join(', ');
				graphText = `\n\nKnowledge Graph (related concepts):\n${nodeLabels}`;
			}

			const prompt = `Extract key topics/themes from the following search query, summary, sources, and knowledge graph.

Query: ${query}

Summary:
${summary}

Sources:
${sourcesText}${graphText}

Please return a JSON array of topics, each with "label" (topic name) and "weight" (relevance score 0-10).
Example format: [{"label": "Machine Learning", "weight": 8}, {"label": "Neural Networks", "weight": 7}]

Return only the JSON array, nothing else.`;

			const response = await multiChat.blockChat({
				provider,
				model,
				messages: [
					{
						role: 'user',
						content: [{ type: 'text', text: prompt }],
					},
				],
			});

			// Parse JSON response
			const content = response.content.trim();
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

