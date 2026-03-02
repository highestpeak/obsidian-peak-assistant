import type { App } from 'obsidian';
import path from 'path';
import { BetterSqliteStore } from './better-sqlite3-adapter/BetterSqliteStore';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from './ddl';
import type { IndexTenant, SqliteStoreType, SqliteDatabase } from './types';
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
import { ChatStarRepo } from './repositories/ChatStarRepo';
import { AIAnalysisRepo } from './repositories/AIAnalysisRepo';
import { UserProfileProcessedHashRepo } from './repositories/UserProfileProcessedHashRepo';
import { VAULT_DB_FILENAME, CHAT_DB_FILENAME } from '@/core/constant';

/**
 * Global singleton manager for SQLite database connection.
 * 
 * This provides a centralized way to access the database connection
 * across different parts of the application without passing it through
 * multiple layers.
 * 
 * Uses better-sqlite3 only (native backend).
 */
export class SqliteStoreManager {
	private static instance: SqliteStoreManager | null = null;

	public static getInstance(): SqliteStoreManager {
		if (!SqliteStoreManager.instance) {
			SqliteStoreManager.instance = new SqliteStoreManager();
		}
		return SqliteStoreManager.instance;
	}

	public static clearInstance(): void {
		if (SqliteStoreManager.instance) {
			SqliteStoreManager.instance.close();
			SqliteStoreManager.instance = null;
		}
	}

	// Database connections
	private searchStore: SqliteDatabase | null = null;
	private metaStore: SqliteDatabase | null = null;
	private app: App | null = null;
	private isVectorSearchAvailable: boolean = false;
	/** Set at start of close() so getters throw and no new work starts; avoids in-flight DB ops after close. */
	private closing = false;

	// Search database repositories (search.sqlite) — vault index tenant
	private docMetaRepo: DocMetaRepo | null = null;
	private docChunkRepo: DocChunkRepo | null = null;
	private embeddingRepo: EmbeddingRepo | null = null;
	private indexStateRepo: IndexStateRepo | null = null;
	private docStatisticsRepo: DocStatisticsRepo | null = null;
	private graphNodeRepo: GraphNodeRepo | null = null;
	private graphEdgeRepo: GraphEdgeRepo | null = null;
	private graphStore: GraphStore | null = null;
	private userProfileProcessedHashRepo: UserProfileProcessedHashRepo | null = null;

	// Meta database index repositories (meta.sqlite) — chat index tenant (ChatFolder)
	private docMetaRepoChat: DocMetaRepo | null = null;
	private docChunkRepoChat: DocChunkRepo | null = null;
	private embeddingRepoChat: EmbeddingRepo | null = null;
	private indexStateRepoChat: IndexStateRepo | null = null;
	private docStatisticsRepoChat: DocStatisticsRepo | null = null;
	private graphNodeRepoChat: GraphNodeRepo | null = null;
	private graphEdgeRepoChat: GraphEdgeRepo | null = null;
	private graphStoreChat: GraphStore | null = null;

	// Meta database repositories (meta.sqlite) — chat/ai tables only
	private chatProjectRepo: ChatProjectRepo | null = null;
	private chatConversationRepo: ChatConversationRepo | null = null;
	private chatMessageRepo: ChatMessageRepo | null = null;
	private chatMessageResourceRepo: ChatMessageResourceRepo | null = null;
	private chatStarRepo: ChatStarRepo | null = null;
	private aiAnalysisRepo: AIAnalysisRepo | null = null;


	/**
	 * Create a database connection with the specified path and settings.
	 */
	private async createDatabaseConnection(
		dbFilePath: string,
		settings?: { sqliteBackend?: 'auto' | 'better-sqlite3' }
	): Promise<SqliteDatabase> {
		await this.selectBackend(settings?.sqliteBackend);
		const result = await BetterSqliteStore.open({ dbFilePath, app: this.app ?? undefined });
		this.isVectorSearchAvailable = result.sqliteVecAvailable;
		return result.store;
	}

	/**
	 * Ensures better-sqlite3 is available. Throws if not (no fallback backend).
	 */
	private async selectBackend(userSetting?: 'auto' | 'better-sqlite3'): Promise<void> {
		const available = await BetterSqliteStore.checkAvailable(this.app ?? undefined);
		if (!available) {
			throw new Error(
				'better-sqlite3 is required but not available. ' +
				'Install it in the plugin directory (e.g. npm install better-sqlite3) and rebuild for Electron.'
			);
		}
		if (userSetting === 'better-sqlite3') {
			console.log('[SqliteStoreManager] Using better-sqlite3 (user preference)');
		} else {
			console.log('[SqliteStoreManager] Using better-sqlite3 (auto-detected)');
		}
	}

	/**
	 * Calculate database file path with proper storage folder handling.
	 */
	private async buildDatabasePath(
		app: App,
		storageFolder: string | undefined,
		dbFilename: string
	): Promise<string> {
		// Calculate database file paths
		const basePath = (app.vault.adapter as any)?.basePath ?? '';
		const normalizedStorageFolder = (storageFolder ?? '').trim().replace(/^\/+/, '');

		if (normalizedStorageFolder) {
			// Ensure the vault folder exists before opening a file-backed database.
			await ensureFolderRecursive(app, normalizedStorageFolder);
		}

		// Calculate the database path
		const dbPath = basePath
			? (normalizedStorageFolder ? path.join(basePath, normalizedStorageFolder, dbFilename) : path.join(basePath, dbFilename))
			: null;

		if (!dbPath) {
			throw new Error(`SqliteStoreManager init failed: ${dbFilename} database path is missing and vault basePath is unavailable`);
		}

		return dbPath;
	}

	/**
	 * Initialize the database connection.
	 * Should be called once during plugin initialization.
	 *
	 * Requires better-sqlite3 (no other backend).
	 *
	 * @param app - Obsidian app instance
	 * @param storageFolder - Storage folder path (relative to vault root)
	 * @param filename - Database filename (default: SEARCH_DB_FILENAME)
	 * @param settings - Optional plugin settings (sqliteBackend is ignored; kept for API compatibility)
	 */
	async init(params: {
		app: App;
		storageFolder?: string;
		filename?: string;
		settings?: { sqliteBackend?: 'auto' | 'better-sqlite3' };
	}): Promise<void> {
		if (this.searchStore || this.metaStore) {
			console.warn('SqliteStoreManager already initialized, closing existing connections');
			this.close();
		}

		this.app = params.app;

		// Create search database connection
		const searchDbPath = await this.buildDatabasePath(params.app, params.storageFolder, VAULT_DB_FILENAME);
		this.searchStore = await this.createDatabaseConnection(searchDbPath, params.settings);

		// Create meta database connection
		const metaDbPath = await this.buildDatabasePath(params.app, params.storageFolder, CHAT_DB_FILENAME);
		this.metaStore = await this.createDatabaseConnection(metaDbPath, params.settings);

		// Initialize search database repositories
		const searchKdb = this.searchStore.kysely<DbSchema>();
		const searchRawDb = this.searchStore;
		this.docMetaRepo = new DocMetaRepo(searchKdb);
		this.docChunkRepo = new DocChunkRepo(searchKdb, searchRawDb);
		this.embeddingRepo = new EmbeddingRepo(searchKdb, searchRawDb, this.docMetaRepo);
		// Initialize vec_embeddings table cache (check once on plugin startup)
		this.embeddingRepo.initializeVecEmbeddingsTableCache();
		this.indexStateRepo = new IndexStateRepo(searchKdb);
		this.docStatisticsRepo = new DocStatisticsRepo(searchKdb);
		this.graphNodeRepo = new GraphNodeRepo(searchKdb);
		this.graphEdgeRepo = new GraphEdgeRepo(searchKdb);
		// Initialize GraphStore
		this.graphStore = new GraphStore(this.graphNodeRepo, this.graphEdgeRepo);
		this.userProfileProcessedHashRepo = new UserProfileProcessedHashRepo(searchKdb);

		// Initialize meta database repositories (chat/ai tables)
		const metaKdb = this.metaStore.kysely<DbSchema>();
		this.chatProjectRepo = new ChatProjectRepo(metaKdb);
		this.chatConversationRepo = new ChatConversationRepo(metaKdb);
		this.chatMessageRepo = new ChatMessageRepo(metaKdb);
		this.chatMessageResourceRepo = new ChatMessageResourceRepo(metaKdb);
		this.chatStarRepo = new ChatStarRepo(metaKdb);
		this.aiAnalysisRepo = new AIAnalysisRepo(metaKdb);

		// Chat index tenant (same schema as search, on meta.sqlite)
		this.docMetaRepoChat = new DocMetaRepo(metaKdb);
		this.docChunkRepoChat = new DocChunkRepo(metaKdb, this.metaStore);
		this.embeddingRepoChat = new EmbeddingRepo(metaKdb, this.metaStore, this.docMetaRepoChat);
		this.embeddingRepoChat.initializeVecEmbeddingsTableCache();
		this.indexStateRepoChat = new IndexStateRepo(metaKdb);
		this.docStatisticsRepoChat = new DocStatisticsRepo(metaKdb);
		this.graphNodeRepoChat = new GraphNodeRepo(metaKdb);
		this.graphEdgeRepoChat = new GraphEdgeRepo(metaKdb);
		this.graphStoreChat = new GraphStore(this.graphNodeRepoChat, this.graphEdgeRepoChat);
	}

	/**
	 * Get the Kysely instance for database queries.
	 * Returns the search database connection for backward compatibility.
	 * Throws error if not initialized.
	 */
	getSearchContext(): Kysely<DbSchema> {
		return this.getIndexContext('vault');
	}

	/**
	 * Get Kysely for the given index tenant (vault = search.sqlite, chat = meta.sqlite).
	 */
	getIndexContext(tenant: IndexTenant = 'vault'): Kysely<DbSchema> {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const store = tenant === 'chat' ? this.metaStore : this.searchStore;
		if (!store) throw new Error('SqliteStoreManager not initialized or is closing.');
		return store.kysely();
	}

	/**
	 * Get the search database backend type.
	 */
	getSearchStore(): SqliteDatabase | null {
		return this.searchStore;
	}

	/**
	 * Get the meta database backend type.
	 */
	getMetaStore(): SqliteDatabase | null {
		return this.metaStore;
	}

	/**
	 * Check if the stores are initialized.
	 */
	isInitialized(): boolean {
		return !this.closing && this.searchStore !== null && this.metaStore !== null;
	}

	/**
	 * Get DocMetaRepo for the given index tenant (default: vault).
	 */
	getDocMetaRepo(tenant: IndexTenant = 'vault'): DocMetaRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.docMetaRepoChat : this.docMetaRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Get DocChunkRepo for the given index tenant (default: vault).
	 */
	getDocChunkRepo(tenant: IndexTenant = 'vault'): DocChunkRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.docChunkRepoChat : this.docChunkRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Get EmbeddingRepo for the given index tenant (default: vault).
	 */
	getEmbeddingRepo(tenant: IndexTenant = 'vault'): EmbeddingRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.embeddingRepoChat : this.embeddingRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Check if vector similarity search is available.
	 * This requires sqlite-vec extension to be loaded successfully.
	 */
	isVectorSearchEnabled(): boolean {
		return this.isVectorSearchAvailable;
	}

	/**
	 * Get IndexStateRepo for the given index tenant (default: vault).
	 */
	getIndexStateRepo(tenant: IndexTenant = 'vault'): IndexStateRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.indexStateRepoChat : this.indexStateRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Get DocStatisticsRepo for the given index tenant (default: vault).
	 */
	getDocStatisticsRepo(tenant: IndexTenant = 'vault'): DocStatisticsRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.docStatisticsRepoChat : this.docStatisticsRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Get GraphNodeRepo for the given index tenant (default: vault).
	 */
	getGraphNodeRepo(tenant: IndexTenant = 'vault'): GraphNodeRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.graphNodeRepoChat : this.graphNodeRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Get GraphEdgeRepo for the given index tenant (default: vault).
	 */
	getGraphEdgeRepo(tenant: IndexTenant = 'vault'): GraphEdgeRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.graphEdgeRepoChat : this.graphEdgeRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Get GraphStore for the given index tenant (default: vault).
	 */
	getGraphStore(tenant: IndexTenant = 'vault'): GraphStore {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const store = tenant === 'chat' ? this.graphStoreChat : this.graphStore;
		if (!store) throw new Error('SqliteStoreManager not initialized or is closing.');
		return store;
	}

	/**
	 * Get UserProfileProcessedHashRepo instance (search DB).
	 */
	getUserProfileProcessedHashRepo(): UserProfileProcessedHashRepo {
		if (this.closing || !this.userProfileProcessedHashRepo) {
			throw new Error('SqliteStoreManager not initialized or is closing.');
		}
		return this.userProfileProcessedHashRepo;
	}

	/**
	 * Get ChatProjectRepo instance.
	 */
	getChatProjectRepo(): ChatProjectRepo {
		if (this.closing || !this.chatProjectRepo) {
			throw new Error('SqliteStoreManager not initialized or is closing.');
		}
		return this.chatProjectRepo;
	}

	/**
	 * Get ChatConversationRepo instance.
	 */
	getChatConversationRepo(): ChatConversationRepo {
		if (this.closing || !this.chatConversationRepo) {
			throw new Error('SqliteStoreManager not initialized or is closing.');
		}
		return this.chatConversationRepo;
	}

	/**
	 * Get ChatMessageRepo instance.
	 */
	getChatMessageRepo(): ChatMessageRepo {
		if (this.closing || !this.chatMessageRepo) {
			throw new Error('SqliteStoreManager not initialized or is closing.');
		}
		return this.chatMessageRepo;
	}

	/**
	 * Get ChatMessageResourceRepo instance.
	 */
	getChatMessageResourceRepo(): ChatMessageResourceRepo {
		if (this.closing || !this.chatMessageResourceRepo) {
			throw new Error('SqliteStoreManager not initialized or is closing.');
		}
		return this.chatMessageResourceRepo;
	}

	/**
	 * Get ChatStarRepo instance.
	 */
	getChatStarRepo(): ChatStarRepo {
		if (this.closing || !this.chatStarRepo) {
			throw new Error('SqliteStoreManager not initialized or is closing.');
		}
		return this.chatStarRepo;
	}

	/**
	 * Get AIAnalysisRepo instance (meta.sqlite).
	 */
	getAIAnalysisRepo(): AIAnalysisRepo {
		if (this.closing || !this.aiAnalysisRepo) {
			throw new Error('SqliteStoreManager not initialized or is closing.');
		}
		return this.aiAnalysisRepo;
	}

	/**
	 * No-op for compatibility. better-sqlite3 persists to file automatically.
	 */
	save(): void {}

	close(): void {
		this.closing = true;
		try {
			if (this.searchStore) {
				this.searchStore.close();
				this.searchStore = null;
			}
			if (this.metaStore) {
				this.metaStore.close();
				this.metaStore = null;
			}
		} catch (e) {
			console.warn('[SqliteStoreManager] Error during close (ignored):', e);
		}
		this.app = null;
		this.docMetaRepo = null;
		this.docChunkRepo = null;
		this.embeddingRepo = null;
		this.indexStateRepo = null;
		this.docStatisticsRepo = null;
		this.graphNodeRepo = null;
		this.graphEdgeRepo = null;
		this.graphStore = null;
		this.docMetaRepoChat = null;
		this.docChunkRepoChat = null;
		this.embeddingRepoChat = null;
		this.indexStateRepoChat = null;
		this.docStatisticsRepoChat = null;
		this.graphNodeRepoChat = null;
		this.graphEdgeRepoChat = null;
		this.graphStoreChat = null;
		this.chatProjectRepo = null;
		this.chatConversationRepo = null;
		this.chatMessageRepo = null;
		this.chatMessageResourceRepo = null;
		this.chatStarRepo = null;
		this.aiAnalysisRepo = null;
		this.userProfileProcessedHashRepo = null;
	}
}

/**
 * Global singleton instance.
 */
// todo change to another way to build instance of SqliteStoreManager like AppContext.getInstance()
export const sqliteStoreManager = SqliteStoreManager.getInstance();
