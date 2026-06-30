// T11B: Concrete tag-suggestion port. Owns:
//   - construction of the TagSuggestionEngine + its data port;
//   - persistence of the suggestion batch into the TagSuggestionRepo.
//
// T11B-R (2026-06-14): every SQLite call is wrapped so the action
// catalog stays usable on mobile and during the SQLite-deferred window.
// Missing data returns empty lists; persistence becomes a no-op rather
// than throwing inside the action.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GraphNodeType } from '@/core/types/graph';
import {
	TagSuggestionEngine,
	type TagSuggestionDataPort,
	type RankedTagSuggestion,
} from '@/service/copilot/TagSuggestionEngine';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { CopilotActionTagsPort } from '@/core/ports/CopilotActionPorts';

async function safe<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		console.warn(`[SqliteCopilotActionTagsAdapter] ${label} failed (sqlite likely not ready):`, e);
		return fallback;
	}
}

/** Compose a {@link TagSuggestionDataPort} from sqliteStoreManager. */
export function createSqliteTagSuggestionDataPort(): TagSuggestionDataPort {
	return {
		getDocumentTagsJsonByPath(path) {
			return safe('getDocumentTagsJsonByPath', null, async () => {
				const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
				const doc = await nodeRepo.getByPath(path);
				return doc?.tags_json ?? null;
			});
		},

		getMobiusNodeIdByPath(path) {
			return safe('getMobiusNodeIdByPath', null, async () => {
				const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
				const doc = await nodeRepo.getByPath(path);
				return doc?.node_id ?? null;
			});
		},

		getNeighborIds(nodeId) {
			return safe('getNeighborIds', [] as string[], async () => {
				const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
				const map = await edgeRepo.getNeighborIdsMap([nodeId]);
				return map.get(nodeId) ?? [];
			});
		},

		getMobiusNodeTagsJsonById(nodeId) {
			return safe('getMobiusNodeTagsJsonById', null, async () => {
				const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
				const node = await nodeRepo.getByNodeId(nodeId);
				return node?.tags_json ?? null;
			});
		},

		listDocumentTagsJsonUnderFolderPrefix(folderPath, limit) {
			return safe('listDocumentTagsJsonUnderFolderPrefix', [] as string[], async () => {
				const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
				return nodeRepo.listDocumentTagsJsonUnderFolderPrefix(folderPath, limit);
			});
		},

		getVaultTopTagLabels(limit) {
			return safe('getVaultTopTagLabels', [] as string[], async () => {
				const db = sqliteStoreManager.getIndexContext('vault');
				const rows = await db
					.selectFrom('mobius_node')
					.select(['title', 'path'])
					.where('type', '=', GraphNodeType.TopicTag)
					.orderBy('tag_doc_count', 'desc')
					.limit(limit)
					.execute();
				return rows.map(r => r.title ?? r.path).filter((v): v is string => v != null);
			});
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
		// T11B-R: persistence is best-effort. If sqlite isn't ready the
		// suggestions still surface to the user; we simply lose the
		// feedback-tracking batch row for this call.
		try {
			const repo = sqliteStoreManager.getTagSuggestionRepo();
			await repo.insertBatch(input);
		} catch (e) {
			console.warn('[SqliteCopilotActionTagsAdapter] persistSuggestionBatch failed (sqlite likely not ready):', e);
		}
	}
}
