import type { App } from 'obsidian';
import path from 'path';
import { WaSqliteStore } from './wa-sqlite-adapter/WaSqliteStore';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from './ddl';
import { ensureFolderRecursive } from '@/core/utils/vault-utils';
import { DocMetaRepo } from './repositories/DocMetaRepo';
import { DocChunkRepo } from './repositories/DocChunkRepo';
import { EmbeddingRepo } from './repositories/EmbeddingRepo';
import { IndexStateRepo } from './repositories/IndexStateRepo';
import { DocStatisticsRepo } from './repositories/DocStatisticsRepo';
import { GraphNodeRepo } from './repositories/GraphNodeRepo';
import { GraphEdgeRepo } from './repositories/GraphEdgeRepo';
import { GraphStore } from '../graph/GraphStore';
import { ChatProjectRepo } from './repositories/ChatProjectRepo';
import { ChatConversationRepo } from './repositories/ChatConversationRepo';
import { ChatMessageRepo } from './repositories/ChatMessageRepo';
import { ChatMessageResourceRepo } from './repositories/ChatMessageResourceRepo';
import { ChatSummaryRepo } from './repositories/ChatSummaryRepo';
import { ChatStarRepo } from './repositories/ChatStarRepo';
import { SEARCH_DB_FILENAME } from '@/core/constant';

/**
 * Global singleton manager for SQLite database connection.
 * 
 * This provides a centralized way to access the database connection
 * across different parts of the application without passing it through
 * multiple layers.
 */
class SqliteStoreManager {
	private store: WaSqliteStore | null = null;
	private app: App | null = null;
	
	// Repositories
	private docMetaRepo: DocMetaRepo | null = null;
	private docChunkRepo: DocChunkRepo | null = null;
	private embeddingRepo: EmbeddingRepo | null = null;
	private indexStateRepo: IndexStateRepo | null = null;
	private docStatisticsRepo: DocStatisticsRepo | null = null;
	private graphNodeRepo: GraphNodeRepo | null = null;
	private graphEdgeRepo: GraphEdgeRepo | null = null;
	private graphStore: GraphStore | null = null;
	private chatProjectRepo: ChatProjectRepo | null = null;
	private chatConversationRepo: ChatConversationRepo | null = null;
	private chatMessageRepo: ChatMessageRepo | null = null;
	private chatMessageResourceRepo: ChatMessageResourceRepo | null = null;
	private chatSummaryRepo: ChatSummaryRepo | null = null;
	private chatStarRepo: ChatStarRepo | null = null;

	/**
	 * Initialize the database connection.
	 * Should be called once during plugin initialization.
	 * 
	 * @param app - Obsidian app instance
	 * @param storageFolder - Storage folder path (relative to vault root)
	 * @param filename - Database filename (default: SEARCH_DB_FILENAME)
	 */
	async init(params: { app: App; storageFolder?: string; filename?: string }): Promise<void> {
		if (this.store) {
			console.warn('SqliteStoreManager already initialized, closing existing connection');
			this.close();
		}
		
		this.app = params.app;
		
		// Calculate database file path
		const basePath = (this.app.vault.adapter as any)?.basePath ?? '';
		const normalizedStorageFolder = (params.storageFolder ?? '').trim().replace(/^\/+/, '');
		const filename = params.filename ?? SEARCH_DB_FILENAME;
		
		if (normalizedStorageFolder) {
			// Ensure the vault folder exists before opening a file-backed database.
			await ensureFolderRecursive(this.app, normalizedStorageFolder);
		}
		
		const dbFilePath =
			basePath
				? (normalizedStorageFolder ? path.join(basePath, normalizedStorageFolder, filename) : path.join(basePath, filename))
				: null;
		
		if (!dbFilePath) {
			throw new Error('SqliteStoreManager init failed: dbFilePath is missing and vault basePath is unavailable');
		}
		
		this.store = await WaSqliteStore.open({ dbFilePath });
		
		// Initialize all repositories
		const kdb = this.store.kysely;
		const rawDb = this.store.rawDb;
		this.docMetaRepo = new DocMetaRepo(kdb);
		this.docChunkRepo = new DocChunkRepo(kdb, rawDb);
		this.embeddingRepo = new EmbeddingRepo(kdb, rawDb);
		this.indexStateRepo = new IndexStateRepo(kdb);
		this.docStatisticsRepo = new DocStatisticsRepo(kdb);
		this.graphNodeRepo = new GraphNodeRepo(kdb);
		this.graphEdgeRepo = new GraphEdgeRepo(kdb);
		// Initialize GraphStore
		this.graphStore = new GraphStore(this.graphNodeRepo, this.graphEdgeRepo);
		// Initialize chat repositories
		this.chatProjectRepo = new ChatProjectRepo(kdb);
		this.chatConversationRepo = new ChatConversationRepo(kdb);
		this.chatMessageRepo = new ChatMessageRepo(kdb);
		this.chatMessageResourceRepo = new ChatMessageResourceRepo(kdb);
		this.chatSummaryRepo = new ChatSummaryRepo(kdb);
		this.chatStarRepo = new ChatStarRepo(kdb);
	}

	/**
	 * Get the Kysely instance for database queries.
	 * Throws error if not initialized.
	 */
	getKysely(): Kysely<DbSchema> {
		if (!this.store) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.store.kysely;
	}

	/**
	 * Get the WaSqliteStore instance.
	 * Throws error if not initialized.
	 */
	getStore(): WaSqliteStore {
		if (!this.store) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.store;
	}

	/**
	 * Check if the store is initialized.
	 */
	isInitialized(): boolean {
		return this.store !== null;
	}

	/**
	 * Get DocMetaRepo instance.
	 */
	getDocMetaRepo(): DocMetaRepo {
		if (!this.docMetaRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.docMetaRepo;
	}

	/**
	 * Get DocChunkRepo instance.
	 */
	getDocChunkRepo(): DocChunkRepo {
		if (!this.docChunkRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.docChunkRepo;
	}

	/**
	 * Get EmbeddingRepo instance.
	 */
	getEmbeddingRepo(): EmbeddingRepo {
		if (!this.embeddingRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.embeddingRepo;
	}

	/**
	 * Get IndexStateRepo instance.
	 */
	getIndexStateRepo(): IndexStateRepo {
		if (!this.indexStateRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.indexStateRepo;
	}

	/**
	 * Get DocStatisticsRepo instance.
	 */
	getDocStatisticsRepo(): DocStatisticsRepo {
		if (!this.docStatisticsRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.docStatisticsRepo;
	}

	/**
	 * Get GraphNodeRepo instance.
	 */
	getGraphNodeRepo(): GraphNodeRepo {
		if (!this.graphNodeRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.graphNodeRepo;
	}

	/**
	 * Get GraphEdgeRepo instance.
	 */
	getGraphEdgeRepo(): GraphEdgeRepo {
		if (!this.graphEdgeRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.graphEdgeRepo;
	}

	/**
	 * Get GraphStore instance.
	 */
	getGraphStore(): GraphStore {
		if (!this.graphStore) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.graphStore;
	}

	/**
	 * Get ChatProjectRepo instance.
	 */
	getChatProjectRepo(): ChatProjectRepo {
		if (!this.chatProjectRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.chatProjectRepo;
	}

	/**
	 * Get ChatConversationRepo instance.
	 */
	getChatConversationRepo(): ChatConversationRepo {
		if (!this.chatConversationRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.chatConversationRepo;
	}

	/**
	 * Get ChatMessageRepo instance.
	 */
	getChatMessageRepo(): ChatMessageRepo {
		if (!this.chatMessageRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.chatMessageRepo;
	}

	/**
	 * Get ChatMessageResourceRepo instance.
	 */
	getChatMessageResourceRepo(): ChatMessageResourceRepo {
		if (!this.chatMessageResourceRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.chatMessageResourceRepo;
	}

	/**
	 * Get ChatSummaryRepo instance.
	 */
	getChatSummaryRepo(): ChatSummaryRepo {
		if (!this.chatSummaryRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.chatSummaryRepo;
	}

	/**
	 * Get ChatStarRepo instance.
	 */
	getChatStarRepo(): ChatStarRepo {
		if (!this.chatStarRepo) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.chatStarRepo;
	}

	/**
	 * Close the database connection.
	 */
	close(): void {
		if (this.store) {
			this.store.close();
			this.store = null;
		}
		this.app = null;
		// Clear repositories
		this.docMetaRepo = null;
		this.docChunkRepo = null;
		this.embeddingRepo = null;
		this.indexStateRepo = null;
		this.docStatisticsRepo = null;
		this.graphNodeRepo = null;
		this.graphEdgeRepo = null;
		this.graphStore = null;
		this.chatProjectRepo = null;
		this.chatConversationRepo = null;
		this.chatMessageRepo = null;
		this.chatMessageResourceRepo = null;
		this.chatSummaryRepo = null;
		this.chatStarRepo = null;
	}
}

/**
 * Global singleton instance.
 */
export const sqliteStoreManager = new SqliteStoreManager();

