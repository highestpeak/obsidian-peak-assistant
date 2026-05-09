import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import { MobiusEdgeRepo } from '@/core/storage/sqlite/repositories/MobiusEdgeRepo';
import {
	GRAPH_DOCUMENT_LIKE_NODE_TYPES,
	GRAPH_TAGGED_EDGE_TYPES,
	GraphEdgeType,
	GraphNodeType,
} from '@/core/po/graph.po';
import type { FunctionalTagEntry, TopicTagEntry } from '@/core/document/helper/TagService';
import type { FunctionalTagId } from '@/core/schemas/agents/search-agent-schemas';

function parseFunctionalQualifierFromEdgeAttributes(attributesJson: string): string | undefined {
	try {
		const a = JSON.parse(attributesJson || '{}') as { qualifier?: unknown };
		if (typeof a.qualifier === 'string' && a.qualifier.trim()) return a.qualifier.trim();
	} catch {
		/* ignore */
	}
	return undefined;
}

/**
 * Graph semantics on top of {@link MobiusNodeRepo} / {@link MobiusEdgeRepo}: PO-style helpers, previews, tag stats.
 */
export class GraphRepo {
	constructor(
		private readonly nodeRepo: MobiusNodeRepo,
		private readonly edgeRepo: MobiusEdgeRepo,
	) {}

	async getRelatedFilePaths(params: { currentFilePath: string; maxHops?: number }): Promise<Set<string>> {
		const relatedNodeIds = await this.getRelatedNodeIds(params.currentFilePath, params.maxHops ?? 2);
		const documentIds = await this.nodeRepo.getIdsByIdsAndTypes(
			Array.from(relatedNodeIds),
			[...GRAPH_DOCUMENT_LIKE_NODE_TYPES],
		);
		return new Set(documentIds);
	}

	private async getRelatedNodeIds(startNodeId: string, maxHops: number = 2): Promise<Set<string>> {
		const visited = new Set<string>([startNodeId]);
		let frontier = new Set<string>([startNodeId]);

		for (let hop = 0; hop < maxHops; hop++) {
			const next = new Set<string>();
			const neighborMap = await this.edgeRepo.getNeighborIdsMap(Array.from(frontier));
			for (const [, neighbors] of neighborMap) {
				for (const neighborId of neighbors) {
					if (!visited.has(neighborId)) {
						visited.add(neighborId);
						next.add(neighborId);
					}
				}
			}
			frontier = next;
			if (!frontier.size) break;
		}

		visited.delete(startNodeId);
		return visited;
	}

	/**
	 * Per-doc tag bundles and global-ish counts. Uses `mobius_edge.type` (tagged_topic / functional / keyword / context).
	 */
	async getTagsByDocIds(docIds: string[] | undefined): Promise<{
		idMapToTags: Map<
			string,
			{
				topicTags: string[];
				topicTagEntries: TopicTagEntry[];
				functionalTagEntries: FunctionalTagEntry[];
				keywordTags: string[];
				timeTags: string[];
				geoTags: string[];
				personTags: string[];
			}
		>;
		topicTagCounts: Map<string, number>;
		functionalTagCounts: Map<string, number>;
		keywordTagCounts: Map<string, number>;
		timeTagCounts: Map<string, number>;
		geoTagCounts: Map<string, number>;
		personTagCounts: Map<string, number>;
	}> {
		const emptyMaps = () => ({
			idMapToTags: new Map(),
			topicTagCounts: new Map<string, number>(),
			functionalTagCounts: new Map<string, number>(),
			keywordTagCounts: new Map<string, number>(),
			timeTagCounts: new Map<string, number>(),
			geoTagCounts: new Map<string, number>(),
			personTagCounts: new Map<string, number>(),
		});

		if (docIds === undefined) {
			const edgeCounts = await this.edgeRepo.getTagCategoryEdgeCountsByToNode();
			if (!edgeCounts.length) {
				return emptyMaps();
			}
			const toNodeIds = [...new Set(edgeCounts.map((e) => e.to_node_id))];
			const nodeMap = await this.nodeRepo.getByIds(toNodeIds);
			const topicTagCounts = new Map<string, number>();
			const functionalTagCounts = new Map<string, number>();
			const keywordTagCounts = new Map<string, number>();
			const timeTagCounts = new Map<string, number>();
			const geoTagCounts = new Map<string, number>();
			const personTagCounts = new Map<string, number>();
			for (const { to_node_id, count } of edgeCounts) {
				const node = nodeMap.get(to_node_id);
				if (!node) continue;
				if (node.type === GraphNodeType.TopicTag) {
					topicTagCounts.set(node.label, (topicTagCounts.get(node.label) ?? 0) + count);
				} else if (node.type === GraphNodeType.FunctionalTag) {
					functionalTagCounts.set(node.label, (functionalTagCounts.get(node.label) ?? 0) + count);
				} else if (node.type === GraphNodeType.KeywordTag) {
					keywordTagCounts.set(node.label, (keywordTagCounts.get(node.label) ?? 0) + count);
				} else if (node.type === GraphNodeType.ContextTag) {
					const ax = contextAxisFromGraphNode(node);
					if (ax === 'time') {
						timeTagCounts.set(node.label, (timeTagCounts.get(node.label) ?? 0) + count);
					} else if (ax === 'geo') {
						geoTagCounts.set(node.label, (geoTagCounts.get(node.label) ?? 0) + count);
					} else if (ax === 'person') {
						personTagCounts.set(node.label, (personTagCounts.get(node.label) ?? 0) + count);
					}
				}
			}
			return {
				idMapToTags: new Map(),
				topicTagCounts,
				functionalTagCounts,
				keywordTagCounts,
				timeTagCounts,
				geoTagCounts,
				personTagCounts,
			};
		}

		const taggedEdges = await this.edgeRepo.getByFromNodesAndTypes(docIds, [...GRAPH_TAGGED_EDGE_TYPES]);
		const nodeById = await this.nodeRepo.getByIds(taggedEdges.map((edge) => edge.to_node_id));

		const topicTagCounts = new Map<string, number>();
		const functionalTagCounts = new Map<string, number>();
		const keywordTagCounts = new Map<string, number>();
		const timeTagCounts = new Map<string, number>();
		const geoTagCounts = new Map<string, number>();
		const personTagCounts = new Map<string, number>();
		for (const edge of taggedEdges) {
			const node = nodeById.get(edge.to_node_id);
			if (!node) continue;
			if (edge.type === GraphEdgeType.TaggedTopic) {
				topicTagCounts.set(node.label, (topicTagCounts.get(node.label) ?? 0) + 1);
			} else if (edge.type === GraphEdgeType.TaggedFunctional) {
				functionalTagCounts.set(node.label, (functionalTagCounts.get(node.label) ?? 0) + 1);
			} else if (edge.type === GraphEdgeType.TaggedKeyword) {
				keywordTagCounts.set(node.label, (keywordTagCounts.get(node.label) ?? 0) + 1);
			} else if (edge.type === GraphEdgeType.TaggedContext) {
				const ax = contextAxisFromGraphNode(node);
				if (ax === 'time') {
					timeTagCounts.set(node.label, (timeTagCounts.get(node.label) ?? 0) + 1);
				} else if (ax === 'geo') {
					geoTagCounts.set(node.label, (geoTagCounts.get(node.label) ?? 0) + 1);
				} else if (ax === 'person') {
					personTagCounts.set(node.label, (personTagCounts.get(node.label) ?? 0) + 1);
				}
			}
		}

		const map = new Map<
			string,
			{
				topicTags: string[];
				topicTagEntries: TopicTagEntry[];
				functionalTagEntries: FunctionalTagEntry[];
				keywordTags: string[];
				timeTags: string[];
				geoTags: string[];
				personTags: string[];
			}
		>();
		for (const edge of taggedEdges) {
			const n = nodeById.get(edge.to_node_id);
			if (!n) continue;
			if (!map.has(edge.from_node_id)) {
				map.set(edge.from_node_id, {
					topicTags: [],
					topicTagEntries: [],
					functionalTagEntries: [],
					keywordTags: [],
					timeTags: [],
					geoTags: [],
					personTags: [],
				});
			}
			const row = map.get(edge.from_node_id)!;
			if (edge.type === GraphEdgeType.TaggedTopic) {
				const qualifier = parseFunctionalQualifierFromEdgeAttributes(edge.attributes);
				const entry: TopicTagEntry = qualifier ? { id: n.label, label: qualifier } : { id: n.label };
				row.topicTagEntries.push(entry);
				row.topicTags.push(n.label);
			} else if (edge.type === GraphEdgeType.TaggedFunctional) {
				const qualifier = parseFunctionalQualifierFromEdgeAttributes(edge.attributes);
				row.functionalTagEntries.push(
					qualifier
						? { id: n.label as FunctionalTagId, label: qualifier }
						: { id: n.label as FunctionalTagId },
				);
			} else if (edge.type === GraphEdgeType.TaggedKeyword) {
				row.keywordTags.push(n.label);
			} else if (edge.type === GraphEdgeType.TaggedContext) {
				const ax = contextAxisFromGraphNode(n);
				if (ax === 'time') row.timeTags.push(n.label);
				else if (ax === 'geo') row.geoTags.push(n.label);
				else if (ax === 'person') row.personTags.push(n.label);
			}
		}
		return {
			idMapToTags: map,
			topicTagCounts,
			functionalTagCounts,
			keywordTagCounts,
			timeTagCounts,
			geoTagCounts,
			personTagCounts,
		};
	}
}

/** Resolve time/geo/person axis for a context tag node (attributes or label prefix). */
function contextAxisFromGraphNode(node: {
	type: string;
	label: string;
	attributes: string | null;
}): 'time' | 'geo' | 'person' | null {
	if (node.type !== GraphNodeType.ContextTag) return null;
	try {
		const a = JSON.parse(node.attributes || '{}') as { axis?: string };
		if (a.axis === 'time' || a.axis === 'geo' || a.axis === 'person') return a.axis;
	} catch {
		/* ignore */
	}
	if (node.label.startsWith('Time')) return 'time';
	if (node.label.startsWith('Geo')) return 'geo';
	if (node.label.startsWith('Person')) return 'person';
	return null;
}
