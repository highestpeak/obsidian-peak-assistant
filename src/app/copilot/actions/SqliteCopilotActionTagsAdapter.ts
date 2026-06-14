// T11B: Concrete tag-suggestion port. Owns:
//   - construction of the TagSuggestionEngine + its data port;
//   - persistence of the suggestion batch into the TagSuggestionRepo.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GraphNodeType } from '@/core/po/graph.po';
import {
	TagSuggestionEngine,
	type TagSuggestionDataPort,
	type RankedTagSuggestion,
} from '@/service/copilot/TagSuggestionEngine';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { CopilotActionTagsPort } from '@/service/copilot/actions/CopilotActionPorts';

/** Compose a {@link TagSuggestionDataPort} from sqliteStoreManager. */
export function createSqliteTagSuggestionDataPort(): TagSuggestionDataPort {
	return {
		async getDocumentTagsJsonByPath(path: string): Promise<string | null> {
			const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
			const doc = await nodeRepo.getByPath(path);
			return doc?.tags_json ?? null;
		},

		async getMobiusNodeIdByPath(path: string): Promise<string | null> {
			const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
			const doc = await nodeRepo.getByPath(path);
			return doc?.node_id ?? null;
		},

		async getNeighborIds(nodeId: string): Promise<string[]> {
			const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
			const map = await edgeRepo.getNeighborIdsMap([nodeId]);
			return map.get(nodeId) ?? [];
		},

		async getMobiusNodeTagsJsonById(nodeId: string): Promise<string | null> {
			const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
			const node = await nodeRepo.getByNodeId(nodeId);
			return node?.tags_json ?? null;
		},

		async listDocumentTagsJsonUnderFolderPrefix(folderPath: string, limit: number): Promise<string[]> {
			const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
			return nodeRepo.listDocumentTagsJsonUnderFolderPrefix(folderPath, limit);
		},

		async getVaultTopTagLabels(limit: number): Promise<string[]> {
			try {
				const db = sqliteStoreManager.getIndexContext('vault');
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
		},
	};
}

export class SqliteCopilotActionTagsAdapter implements CopilotActionTagsPort {
	private readonly engine: TagSuggestionEngine;

	constructor(manager: AIServiceManager) {
		this.engine = new TagSuggestionEngine({
			aiManager: manager,
			data: createSqliteTagSuggestionDataPort(),
		});
	}

	suggestTags(docPath: string, content: string, title: string): Promise<RankedTagSuggestion[]> {
		return this.engine.suggestTags(docPath, content, title);
	}

	async persistSuggestionBatch(input: {
		docPath: string;
		batchId: string;
		suggestions: Array<{
			tag: string;
			category: 'topic' | 'keyword' | 'functional';
			confidence: number;
			sources: Array<'content' | 'graph' | 'history'>;
			reason: string;
			isExisting: boolean;
		}>;
	}): Promise<void> {
		const repo = sqliteStoreManager.getTagSuggestionRepo();
		await repo.insertBatch(input);
	}
}
