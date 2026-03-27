/**
 * Stable Mobius tag node ids (deterministic) and shared doc→tag edge upserts for indexing.
 */

import { GraphEdgeType, GraphNodeType } from '@/core/po/graph.po';
import { MobiusEdgeRepo } from '@/core/storage/sqlite/repositories/MobiusEdgeRepo';
import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { IndexTenant } from '@/core/storage/sqlite/types';
import {
	stableContextTagNodeId,
	stableFunctionalTagNodeId,
	stableKeywordTagNodeId,
	stableTopicTagNodeId,
} from '@/core/utils/id-utils';

export {
	stableContextTagNodeId,
	stableFunctionalTagNodeId,
	stableKeywordTagNodeId,
	stableTopicTagNodeId,
} from '@/core/utils/id-utils';

async function upsertOneTagEdge(
	mobiusNodeRepo: MobiusNodeRepo,
	mobiusEdgeRepo: MobiusEdgeRepo,
	docNodeId: string,
	edgeType: GraphEdgeType,
	nodeType: GraphNodeType,
	tagId: string,
	label: string,
	nodeAttributes: Record<string, unknown>,
	edgeAttributes: Record<string, unknown> = {},
): Promise<void> {
	await mobiusNodeRepo.upsert({
		id: tagId,
		type: nodeType,
		label,
		attributes: JSON.stringify(nodeAttributes),
	});
	await mobiusEdgeRepo.upsert({
		id: MobiusEdgeRepo.generateEdgeId(docNodeId, tagId, edgeType),
		from_node_id: docNodeId,
		to_node_id: tagId,
		type: edgeType,
		weight: 1.0,
		attributes: JSON.stringify(edgeAttributes),
	});
}

/** What to upsert: topic/functional id + optional edge qualifier; keyword strings; axis+label for context. */
export type TagEdgeUpsertSpec =
	| { nodeType: typeof GraphNodeType.TopicTag; items: ReadonlyArray<{ id: string; label?: string }> }
	| {
			nodeType: typeof GraphNodeType.FunctionalTag;
			items: ReadonlyArray<{ id: string; label?: string }>;
	  }
	| { nodeType: typeof GraphNodeType.KeywordTag; items: readonly string[] }
	| {
			nodeType: typeof GraphNodeType.ContextTag;
			items: ReadonlyArray<{ axis: 'time' | 'geo' | 'person'; label: string }>;
	  };

/**
 * Upserts tag nodes and doc→tag edges for one dimension. Repos and id/label/attributes come from nodeType + items.
 */
export async function upsertDocumentTagEdges(
	tenant: IndexTenant,
	docNodeId: string,
	spec: TagEdgeUpsertSpec,
): Promise<void> {
	const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
	const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);

	switch (spec.nodeType) {
		case GraphNodeType.TopicTag:
			for (const { id, label } of spec.items) {
				const qualifier = label?.trim();
				await upsertOneTagEdge(
					mobiusNodeRepo,
					mobiusEdgeRepo,
					docNodeId,
					GraphEdgeType.TaggedTopic,
					spec.nodeType,
					stableTopicTagNodeId(id),
					id,
					{ tagName: id },
					qualifier ? { qualifier } : {},
				);
			}
			break;
		case GraphNodeType.FunctionalTag:
			for (const { id, label } of spec.items) {
				const qualifier = label?.trim();
				await upsertOneTagEdge(
					mobiusNodeRepo,
					mobiusEdgeRepo,
					docNodeId,
					GraphEdgeType.TaggedFunctional,
					spec.nodeType,
					stableFunctionalTagNodeId(id),
					id,
					{ functionalTag: id },
					qualifier ? { qualifier } : {},
				);
			}
			break;
		case GraphNodeType.KeywordTag:
			for (const kw of spec.items) {
				await upsertOneTagEdge(
					mobiusNodeRepo,
					mobiusEdgeRepo,
					docNodeId,
					GraphEdgeType.TaggedKeyword,
					spec.nodeType,
					stableKeywordTagNodeId(kw),
					kw,
					{ keywordTag: kw },
					{},
				);
			}
			break;
		case GraphNodeType.ContextTag:
			for (const { axis, label } of spec.items) {
				await upsertOneTagEdge(
					mobiusNodeRepo,
					mobiusEdgeRepo,
					docNodeId,
					GraphEdgeType.TaggedContext,
					spec.nodeType,
					stableContextTagNodeId(axis, label),
					label,
					{ axis, contextTag: label },
					{},
				);
			}
			break;
	}
}
