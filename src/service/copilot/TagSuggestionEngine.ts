// T11B (2026-06-14): TagSuggestionEngine takes an injected
// {@link TagSuggestionDataPort} instead of grabbing
// `SqliteStoreManager.getInstance()` from inside its signal methods.
// The app composition layer is the only place that wires concrete
// SQLite repos into the port.

import { PromptId } from '@/service/prompt/PromptId';
import { tagSuggestionsSchema, type TagSuggestions } from './copilot-schemas';
import { decodeIndexedTagsBlob } from '@/core/document/helper/TagService';
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

/**
 * SQLite-backed data lookups the engine needs. App composition wires
 * `sqliteStoreManager.{getMobiusNodeRepo,getMobiusEdgeRepo,getIndexContext}`
 * behind this port.
 */
export interface TagSuggestionDataPort {
	/** `tags_json` blob for the document at the given path, or null. */
	getDocumentTagsJsonByPath(path: string): Promise<string | null>;
	/** Resolve a path to its mobius node id (or null if not indexed). */
	getMobiusNodeIdByPath(path: string): Promise<string | null>;
	/** One-hop graph neighbor ids of a mobius node. */
	getNeighborIds(nodeId: string): Promise<string[]>;
	/** `tags_json` blob for a mobius node id. */
	getMobiusNodeTagsJsonById(nodeId: string): Promise<string | null>;
	/** List `tags_json` blobs for documents whose path starts with the folder prefix. */
	listDocumentTagsJsonUnderFolderPrefix(folderPath: string, limit: number): Promise<string[]>;
	/** Vault-wide top tag labels ordered by document count. */
	getVaultTopTagLabels(limit: number): Promise<string[]>;
}

export interface TagSuggestionEngineDeps {
	aiManager: AIServiceManager;
	data: TagSuggestionDataPort;
}

export class TagSuggestionEngine {
	private readonly aiManager: AIServiceManager;
	private readonly data: TagSuggestionDataPort;

	constructor(deps: TagSuggestionEngineDeps) {
		this.aiManager = deps.aiManager;
		this.data = deps.data;
	}

	async suggestTags(docPath: string, content: string, title: string): Promise<RankedTagSuggestion[]> {
		const existingTags = await this.getExistingTags(docPath);
		const vaultTopTags = await this.data.getVaultTopTagLabels(50);

		const [contentCandidates, graphCandidates, historyCandidates] = await Promise.all([
			this.contentSignal(content, title, existingTags, vaultTopTags),
			this.graphSignal(docPath),
			this.historySignal(docPath),
		]);

		return this.mergeAndRank(contentCandidates, graphCandidates, historyCandidates, existingTags);
	}

	private async contentSignal(
		content: string, title: string, existingTags: string[], vaultTopTags: string[],
	): Promise<TagCandidate[]> {
		try {
			const neighborTags = '';
			const { zodToJsonSchema } = await import('zod-to-json-schema');
			const result = await this.aiManager.queryStructured(
				PromptId.DocSuggestTags,
				{
					content: content.slice(0, 8000),
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

	private async graphSignal(docPath: string): Promise<TagCandidate[]> {
		try {
			const docNodeId = await this.data.getMobiusNodeIdByPath(docPath);
			if (!docNodeId) return [];

			const neighborIds = await this.data.getNeighborIds(docNodeId);
			if (neighborIds.length === 0) return [];

			const tagCounts = new Map<string, { count: number; category: 'topic' | 'keyword' | 'functional' }>();

			for (const nid of neighborIds.slice(0, 20)) {
				const tagsJson = await this.data.getMobiusNodeTagsJsonById(nid);
				if (!tagsJson) continue;
				const blob = decodeIndexedTagsBlob(tagsJson);

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
					confidence: count / totalNeighbors,
					reason: `${count} of ${totalNeighbors} linked notes use this tag`,
					category,
					source: 'graph' as const,
				}))
				.filter(c => c.confidence >= 0.2);
		} catch (e) {
			console.warn('[TagSuggestionEngine] Graph signal failed:', e);
			return [];
		}
	}

	private async historySignal(docPath: string): Promise<TagCandidate[]> {
		try {
			const folderPath = docPath.split('/').slice(0, -1).join('/');
			if (!folderPath) return [];

			const folderTagCounts = new Map<string, { count: number; category: 'topic' | 'keyword' | 'functional' }>();
			let docCount = 0;

			const tagsJsonList = await this.data.listDocumentTagsJsonUnderFolderPrefix(folderPath, 50);
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
				.filter(c => c.confidence >= 0.3);
		} catch (e) {
			console.warn('[TagSuggestionEngine] History signal failed:', e);
			return [];
		}
	}

	private mergeAndRank(
		contentCandidates: TagCandidate[],
		graphCandidates: TagCandidate[],
		historyCandidates: TagCandidate[],
		existingTags: string[],
	): RankedTagSuggestion[] {
		const existingNormalized = new Set(existingTags.map(t => t.toLowerCase().replace(/^#/, '')));

		const tagMap = new Map<string, {
			candidates: TagCandidate[];
			bestCategory: 'topic' | 'keyword' | 'functional';
			bestReason: string;
		}>();

		for (const c of [...contentCandidates, ...graphCandidates, ...historyCandidates]) {
			const key = c.tag.toLowerCase().replace(/^#/, '');
			if (existingNormalized.has(key)) continue;
			if (this.isNoiseTag(key)) continue;

			const existing = tagMap.get(key);
			if (existing) {
				existing.candidates.push(c);
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

		const ranked: RankedTagSuggestion[] = [];
		for (const [tag, { candidates, bestCategory, bestReason }] of tagMap) {
			let score = 0;
			const sources = new Set<'content' | 'graph' | 'history'>();

			for (const c of candidates) {
				const weight = SIGNAL_WEIGHTS[c.source];
				score += weight * c.confidence;
				sources.add(c.source);
			}

			if (sources.size >= 2) score *= 1.2;
			if (sources.size >= 3) score *= 1.3;

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

		ranked.sort((a, b) => b.confidence - a.confidence);
		return ranked.slice(0, MAX_SUGGESTIONS);
	}

	private async getExistingTags(docPath: string): Promise<string[]> {
		try {
			const tagsJson = await this.data.getDocumentTagsJsonByPath(docPath);
			if (!tagsJson) return [];
			const blob = decodeIndexedTagsBlob(tagsJson);
			return [...(blob.topicTags ?? []), ...(blob.keywordTags ?? [])];
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
