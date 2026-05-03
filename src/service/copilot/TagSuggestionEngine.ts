import { PromptId } from '@/service/prompt/PromptId';
import { tagSuggestionsSchema, type TagSuggestions } from './copilot-schemas';
import { decodeIndexedTagsBlob } from '@/core/document/helper/TagService';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GraphNodeType } from '@/core/po/graph.po';
import type { AIServiceManager } from '@/service/chat/service-manager';

/** Weights for combining the three tag suggestion signals. */
const SIGNAL_WEIGHTS = { content: 0.5, graph: 0.3, history: 0.2 };
const MAX_SUGGESTIONS = 7;
const MIN_CONFIDENCE = 0.3;

export interface TagCandidate {
	tag: string;
	confidence: number;
	reason: string;
	category: 'topic' | 'keyword' | 'functional';
	source: 'content' | 'graph' | 'history';
}

export interface RankedTagSuggestion {
	tag: string;
	confidence: number;
	reason: string;
	category: 'topic' | 'keyword' | 'functional';
	sources: Array<'content' | 'graph' | 'history'>;
}

export class TagSuggestionEngine {
	constructor(private readonly aiManager: AIServiceManager) {}

	/**
	 * Main entry: returns merged, ranked tag suggestions for a document.
	 */
	async suggestTags(docPath: string, content: string, title: string): Promise<RankedTagSuggestion[]> {
		const existingTags = await this.getExistingTags(docPath);
		const vaultTopTags = await this.getVaultTopTags(50);

		// Run all three signals in parallel
		const [contentCandidates, graphCandidates, historyCandidates] = await Promise.all([
			this.contentSignal(content, title, existingTags, vaultTopTags),
			this.graphSignal(docPath),
			this.historySignal(docPath),
		]);

		const merged = this.mergeAndRank(contentCandidates, graphCandidates, historyCandidates, existingTags);
		return merged;
	}

	// --- Signal A: LLM content analysis ---

	private async contentSignal(
		content: string, title: string, existingTags: string[], vaultTopTags: string[],
	): Promise<TagCandidate[]> {
		try {
			const neighborTags = ''; // Neighbor info is in Signal B
			const { zodToJsonSchema } = await import('zod-to-json-schema');
			const result = await this.aiManager.queryStructured(
				PromptId.DocSuggestTags,
				{
					content: content.slice(0, 8000), // Limit content length for token efficiency
					title,
					existingTags: JSON.stringify(existingTags),
					vaultTopTags: vaultTopTags.join(', '),
					neighborTags,
				},
				zodToJsonSchema(tagSuggestionsSchema),
			);
			const suggestions = (result as TagSuggestions).suggestions ?? [];
			return suggestions.map(s => ({
				tag: s.tag.replace(/^#/, ''),
				confidence: s.confidence,
				reason: s.reason,
				category: s.category,
				source: 'content' as const,
			}));
		} catch (e) {
			console.warn('[TagSuggestionEngine] Content signal failed:', e);
			return [];
		}
	}

	// --- Signal B: neighbor tag propagation ---

	private async graphSignal(docPath: string): Promise<TagCandidate[]> {
		try {
			const storeManager = SqliteStoreManager.getInstance();
			const nodeRepo = storeManager.getMobiusNodeRepo();
			const edgeRepo = storeManager.getMobiusEdgeRepo();

			const docNode = await nodeRepo.getByPath(docPath);
			if (!docNode) return [];

			// Get 1-hop neighbor IDs
			const neighborMap = await edgeRepo.getNeighborIdsMap([docNode.node_id]);
			const neighborIds = neighborMap.get(docNode.node_id) ?? [];
			if (neighborIds.length === 0) return [];

			// Read neighbor tags
			const tagCounts = new Map<string, { count: number; category: 'topic' | 'keyword' | 'functional' }>();

			for (const nid of neighborIds.slice(0, 20)) { // Cap at 20 neighbors
				const neighbor = await nodeRepo.getByNodeId(nid);
				if (!neighbor?.tags_json) continue;
				const blob = decodeIndexedTagsBlob(neighbor.tags_json);

				for (const t of blob.topicTags ?? []) {
					const key = t.toLowerCase();
					const existing = tagCounts.get(key);
					tagCounts.set(key, { count: (existing?.count ?? 0) + 1, category: existing?.category ?? 'topic' });
				}
				for (const t of blob.keywordTags ?? []) {
					const key = t.toLowerCase();
					const existing = tagCounts.get(key);
					tagCounts.set(key, { count: (existing?.count ?? 0) + 1, category: existing?.category ?? 'keyword' });
				}
			}

			const totalNeighbors = Math.min(neighborIds.length, 20);
			return Array.from(tagCounts.entries())
				.map(([tag, { count, category }]) => ({
					tag,
					confidence: count / totalNeighbors, // Fraction of neighbors that have this tag
					reason: `${count} of ${totalNeighbors} linked notes use this tag`,
					category,
					source: 'graph' as const,
				}))
				.filter(c => c.confidence >= 0.2); // At least 20% of neighbors must share the tag
		} catch (e) {
			console.warn('[TagSuggestionEngine] Graph signal failed:', e);
			return [];
		}
	}

	// --- Signal C: historical folder affinity ---

	private async historySignal(docPath: string): Promise<TagCandidate[]> {
		try {
			const folderPath = docPath.split('/').slice(0, -1).join('/');
			if (!folderPath) return [];

			const storeManager = SqliteStoreManager.getInstance();
			const nodeRepo = storeManager.getMobiusNodeRepo();

			const folderTagCounts = new Map<string, { count: number; category: 'topic' | 'keyword' | 'functional' }>();
			let docCount = 0;

			const tagsJsonList = await nodeRepo.listDocumentTagsJsonUnderFolderPrefix(folderPath, 50);
			if (tagsJsonList.length === 0) return [];

			for (const raw of tagsJsonList) {
				docCount++;
				const blob = decodeIndexedTagsBlob(raw);
				for (const t of blob.topicTags ?? []) {
					const key = t.toLowerCase();
					const existing = folderTagCounts.get(key);
					folderTagCounts.set(key, { count: (existing?.count ?? 0) + 1, category: existing?.category ?? 'topic' });
				}
			}

			if (docCount === 0) return [];

			return Array.from(folderTagCounts.entries())
				.map(([tag, { count, category }]) => ({
					tag,
					confidence: count / docCount,
					reason: `${Math.round(count / docCount * 100)}% of notes in this folder use this tag`,
					category,
					source: 'history' as const,
				}))
				.filter(c => c.confidence >= 0.3); // At least 30% folder coverage
		} catch (e) {
			console.warn('[TagSuggestionEngine] History signal failed:', e);
			return [];
		}
	}

	// --- Merge & Rank ---

	private mergeAndRank(
		contentCandidates: TagCandidate[],
		graphCandidates: TagCandidate[],
		historyCandidates: TagCandidate[],
		existingTags: string[],
	): RankedTagSuggestion[] {
		const existingNormalized = new Set(existingTags.map(t => t.toLowerCase().replace(/^#/, '')));

		// Group all candidates by normalized tag name
		const tagMap = new Map<string, {
			candidates: TagCandidate[];
			bestCategory: 'topic' | 'keyword' | 'functional';
			bestReason: string;
		}>();

		for (const c of [...contentCandidates, ...graphCandidates, ...historyCandidates]) {
			const key = c.tag.toLowerCase().replace(/^#/, '');
			// Skip tags the doc already has
			if (existingNormalized.has(key)) continue;
			// Skip noise tags
			if (this.isNoiseTag(key)) continue;

			const existing = tagMap.get(key);
			if (existing) {
				existing.candidates.push(c);
				// Prefer content signal's category and reason
				if (c.source === 'content') {
					existing.bestCategory = c.category;
					existing.bestReason = c.reason;
				}
			} else {
				tagMap.set(key, {
					candidates: [c],
					bestCategory: c.category,
					bestReason: c.reason,
				});
			}
		}

		// Score each tag using weighted combination
		const ranked: RankedTagSuggestion[] = [];
		for (const [tag, { candidates, bestCategory, bestReason }] of tagMap) {
			let score = 0;
			const sources = new Set<'content' | 'graph' | 'history'>();

			for (const c of candidates) {
				const weight = SIGNAL_WEIGHTS[c.source];
				score += weight * c.confidence;
				sources.add(c.source);
			}

			// Boost tags that appear in multiple signals
			if (sources.size >= 2) score *= 1.2;
			if (sources.size >= 3) score *= 1.3;

			// Clamp to [0, 1]
			score = Math.min(1, Math.max(0, score));

			if (score >= MIN_CONFIDENCE) {
				ranked.push({
					tag,
					confidence: Math.round(score * 100) / 100,
					reason: bestReason,
					category: bestCategory,
					sources: Array.from(sources),
				});
			}
		}

		// Sort by confidence descending, take top-K
		ranked.sort((a, b) => b.confidence - a.confidence);
		return ranked.slice(0, MAX_SUGGESTIONS);
	}

	// --- Helpers ---

	private async getExistingTags(docPath: string): Promise<string[]> {
		try {
			const storeManager = SqliteStoreManager.getInstance();
			const nodeRepo = storeManager.getMobiusNodeRepo();
			const doc = await nodeRepo.getByPath(docPath);
			if (!doc?.tags_json) return [];
			const blob = decodeIndexedTagsBlob(doc.tags_json);
			return [...(blob.topicTags ?? []), ...(blob.keywordTags ?? [])];
		} catch {
			return [];
		}
	}

	private async getVaultTopTags(limit: number): Promise<string[]> {
		try {
			const storeManager = SqliteStoreManager.getInstance();
			const db = storeManager.getIndexContext('vault');
			// Query topic_tag nodes ordered by doc count
			const rows = await db
				.selectFrom('mobius_node')
				.select(['title', 'path'])
				.where('type', '=', GraphNodeType.TopicTag)
				.orderBy('tag_doc_count', 'desc')
				.limit(limit)
				.execute();
			return rows.map(r => r.title ?? r.path).filter((v): v is string => v != null);
		} catch {
			return [];
		}
	}

	private isNoiseTag(tag: string): boolean {
		const noiseSet = new Set([
			'todo', 'todolist', 'todo-list', 'mess', 'messy', 'waiting',
			'pending', 'later', 'done', 'doing', 'inbox', 'index',
			'archive', 'draft', 'wip',
		]);
		return noiseSet.has(tag.toLowerCase());
	}
}
