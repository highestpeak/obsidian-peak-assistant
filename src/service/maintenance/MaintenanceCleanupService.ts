// T11Y-3A: extracts the multi-repo cleanup workflow that previously
// lived as the body of `PeakCommandActions.cleanupUselessData`. The
// command shell is now responsible only for instantiation and Notice
// wiring; the algorithm — discover orphans, clean search index, clean
// vec embeddings, prune orphan chat conversations — lives here so it
// can be unit-tested with hand-rolled stubs.
//
// Design choice (kept simple): the service receives narrow port-shaped
// dependencies via constructor injection and emits progress through a
// `NotifierPort`. There is no two-phase confirmation gate because the
// original behavior was one-shot delete-with-progress (no confirmation
// modal existed); preserving identical behavior is the contract.
//
// Boundary rules (per the modernization plan):
//   - No imports from `obsidian` or `@/app/*`.
//   - No reach for `AppContext.getInstance()` or `sqliteStoreManager`.
//   - All side effects flow through the injected ports.

import type { NotifierPort } from '@/core/ports/NotifierPort';

// ---------------------------------------------------------------------------
// Narrow port shapes — only the methods the cleanup workflow uses.
// ---------------------------------------------------------------------------

export interface MaintenanceVaultPathPort {
	/** Set of every file path currently present in the vault. */
	listVaultFilePaths(): Set<string>;
}

export interface MaintenanceIndexedDocumentReader {
	getAllIndexedPaths(): Promise<Map<string, number>>;
}

export interface MaintenanceSearchIndexPort {
	deleteDocuments(paths: string[]): Promise<void>;
	cleanupOrphanedSearchIndexData(): Promise<{
		metaFts: number;
		fts: number;
		chunks: number;
		embeddings: number;
		graphNodes: number;
	}>;
}

export interface MaintenanceEmbeddingPort {
	cleanupOrphanedVecEmbeddings(): Promise<{ found: number; deleted: number }>;
}

export interface MaintenanceChatConversationReader {
	getAllWithFilePaths(): Promise<Array<{
		conversation_id: string;
		file_rel_path: string;
		archived_rel_path: string | null;
	}>>;
	deleteByConversationIds(conversationIds: string[]): Promise<void>;
}

export interface MaintenanceChatMessageReader {
	listByConversation(conversationId: string): Promise<Array<{ message_id: string }>>;
	deleteByConversationIds(conversationIds: string[]): Promise<void>;
}

export interface MaintenanceChatResourcePort {
	deleteByMessageIds(messageIds: string[]): Promise<void>;
}

export interface MaintenanceChatStarPort {
	deleteByConversationIds(conversationIds: string[]): Promise<void>;
}

export interface MaintenanceCleanupDeps {
	vaultPaths: MaintenanceVaultPathPort;
	indexedDocuments: MaintenanceIndexedDocumentReader;
	searchIndex: MaintenanceSearchIndexPort;
	embeddings: MaintenanceEmbeddingPort;
	conversations: MaintenanceChatConversationReader;
	messages: MaintenanceChatMessageReader;
	resources: MaintenanceChatResourcePort;
	stars: MaintenanceChatStarPort;
}

// ---------------------------------------------------------------------------
// Report shape — covers each step the original implementation announced.
// ---------------------------------------------------------------------------

export interface SearchIndexCleanupReport {
	orphanDocsRemoved: number;
	orphanIndexRowsRemoved: {
		metaFts: number;
		fts: number;
		chunks: number;
		embeddings: number;
		graphNodes: number;
		total: number;
	};
}

export interface VecEmbeddingCleanupReport {
	found: number;
	deleted: number;
}

export interface ChatCleanupReport {
	orphanConversationsRemoved: number;
	messagesRemoved: number;
}

export interface CleanupReport {
	searchIndex: SearchIndexCleanupReport;
	vecEmbeddings: VecEmbeddingCleanupReport;
	chat: ChatCleanupReport;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MaintenanceCleanupService {
	constructor(private readonly deps: MaintenanceCleanupDeps) {}

	async runCleanup(notify: NotifierPort): Promise<CleanupReport> {
		notify.notify('Starting cleanup of useless data...', 2000);

		const vaultPathSet = this.deps.vaultPaths.listVaultFilePaths();

		const searchIndex = await this.cleanupSearchIndex(vaultPathSet, notify);
		const vecEmbeddings = await this.cleanupVecEmbeddings(notify);
		const chat = await this.cleanupChat(vaultPathSet, notify);

		notify.notify('Cleanup finished.', 3000);
		return { searchIndex, vecEmbeddings, chat };
	}

	private async cleanupSearchIndex(
		vaultPathSet: Set<string>,
		notify: NotifierPort,
	): Promise<SearchIndexCleanupReport> {
		const indexedPaths = await this.deps.indexedDocuments.getAllIndexedPaths();
		const orphanPaths = Array.from(indexedPaths.keys()).filter((p) => !vaultPathSet.has(p));

		if (orphanPaths.length > 0) {
			await this.deps.searchIndex.deleteDocuments(orphanPaths);
			notify.notify(
				`Search index: removed ${orphanPaths.length} orphaned document(s).`,
				4000,
			);
		} else {
			notify.notify('Search index: no orphaned documents found.', 3000);
		}

		const orphanResult = await this.deps.searchIndex.cleanupOrphanedSearchIndexData();
		const orphanTotal =
			orphanResult.metaFts +
			orphanResult.fts +
			orphanResult.chunks +
			orphanResult.embeddings +
			orphanResult.graphNodes;
		if (orphanTotal > 0) {
			notify.notify(
				`Search index: cleaned ${orphanTotal} orphan record(s) (meta FTS, FTS, chunks, embeddings, Mobius document nodes).`,
				4000,
			);
		}

		return {
			orphanDocsRemoved: orphanPaths.length,
			orphanIndexRowsRemoved: { ...orphanResult, total: orphanTotal },
		};
	}

	private async cleanupVecEmbeddings(notify: NotifierPort): Promise<VecEmbeddingCleanupReport> {
		const vecResult = await this.deps.embeddings.cleanupOrphanedVecEmbeddings();
		if (vecResult.found === 0) {
			notify.notify('Vector embeddings: no orphaned records.', 3000);
		} else {
			notify.notify(
				`Vector embeddings: removed ${vecResult.deleted} orphaned record(s).`,
				4000,
			);
		}
		return vecResult;
	}

	private async cleanupChat(
		vaultPathSet: Set<string>,
		notify: NotifierPort,
	): Promise<ChatCleanupReport> {
		const allConvs = await this.deps.conversations.getAllWithFilePaths();
		const orphanConvIds: string[] = [];
		for (const c of allConvs) {
			const effectivePath = c.archived_rel_path ?? c.file_rel_path;
			if (!vaultPathSet.has(effectivePath)) {
				orphanConvIds.push(c.conversation_id);
			}
		}

		let messagesRemoved = 0;
		if (orphanConvIds.length > 0) {
			const messageIds: string[] = [];
			for (const convId of orphanConvIds) {
				const msgs = await this.deps.messages.listByConversation(convId);
				messageIds.push(...msgs.map((m) => m.message_id));
			}
			messagesRemoved = messageIds.length;
			if (messageIds.length > 0) {
				await this.deps.resources.deleteByMessageIds(messageIds);
			}
			await this.deps.stars.deleteByConversationIds(orphanConvIds);
			await this.deps.messages.deleteByConversationIds(orphanConvIds);
			await this.deps.conversations.deleteByConversationIds(orphanConvIds);
			notify.notify(
				`Chat: removed ${orphanConvIds.length} orphaned conversation(s).`,
				4000,
			);
		} else {
			notify.notify('Chat: no orphaned conversations found.', 3000);
		}

		return {
			orphanConversationsRemoved: orphanConvIds.length,
			messagesRemoved,
		};
	}
}
