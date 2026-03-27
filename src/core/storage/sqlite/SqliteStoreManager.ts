import type { App } from 'obsidian';
import path from 'path';
import { BetterSqliteStore } from './better-sqlite3-adapter/BetterSqliteStore';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from './ddl';
import type { IndexTenant, SqliteStoreType, SqliteDatabase } from './types';
import { ensureFolderRecursive } from '@/core/utils/vault-utils';
import { IndexedDocumentRepo } from './repositories/IndexedDocumentRepo';
import { DocChunkRepo } from './repositories/DocChunkRepo';
import { EmbeddingRepo } from './repositories/EmbeddingRepo';
import { IndexStateRepo } from './repositories/IndexStateRepo';
import { MobiusNodeRepo } from './repositories/MobiusNodeRepo';
import { MobiusEdgeRepo } from './repositories/MobiusEdgeRepo';
import { MobiusOperationRepo } from './repositories/MobiusOperationRepo';
import { GraphRepo } from './repositories/GraphRepo';
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
	private indexedDocumentRepo: IndexedDocumentRepo | null = null;
	private docChunkRepo: DocChunkRepo | null = null;
	private embeddingRepo: EmbeddingRepo | null = null;
	private indexStateRepo: IndexStateRepo | null = null;
	private graphRepo: GraphRepo | null = null;
	private userProfileProcessedHashRepo: UserProfileProcessedHashRepo | null = null;

	// Meta database index repositories (meta.sqlite) — chat index tenant (ChatFolder)
	private indexedDocumentRepoChat: IndexedDocumentRepo | null = null;
	private docChunkRepoChat: DocChunkRepo | null = null;
	private embeddingRepoChat: EmbeddingRepo | null = null;
	private indexStateRepoChat: IndexStateRepo | null = null;
	private graphRepoChat: GraphRepo | null = null;
	private mobiusNodeRepo: MobiusNodeRepo | null = null;
	private mobiusEdgeRepo: MobiusEdgeRepo | null = null;
	private mobiusNodeRepoChat: MobiusNodeRepo | null = null;
	private mobiusEdgeRepoChat: MobiusEdgeRepo | null = null;
	/** User operation log; uses meta.sqlite (same as chat/ai tables). */
	private mobiusOperationRepo: MobiusOperationRepo | null = null;

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
		this.indexedDocumentRepo = new IndexedDocumentRepo(searchKdb);
		this.docChunkRepo = new DocChunkRepo(searchKdb, searchRawDb);
		this.embeddingRepo = new EmbeddingRepo(searchKdb, searchRawDb, this.indexedDocumentRepo);
		// Initialize vec_embeddings table cache (check once on plugin startup)
		this.embeddingRepo.initializeVecEmbeddingsTableCache();
		this.indexStateRepo = new IndexStateRepo(searchKdb);
		this.mobiusNodeRepo = new MobiusNodeRepo(searchKdb);
		this.mobiusEdgeRepo = new MobiusEdgeRepo(searchKdb);
		this.graphRepo = new GraphRepo(this.mobiusNodeRepo, this.mobiusEdgeRepo);
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
		this.indexedDocumentRepoChat = new IndexedDocumentRepo(metaKdb);
		this.docChunkRepoChat = new DocChunkRepo(metaKdb, this.metaStore);
		this.embeddingRepoChat = new EmbeddingRepo(metaKdb, this.metaStore, this.indexedDocumentRepoChat);
		this.embeddingRepoChat.initializeVecEmbeddingsTableCache();
		this.indexStateRepoChat = new IndexStateRepo(metaKdb);
		this.mobiusNodeRepoChat = new MobiusNodeRepo(metaKdb);
		this.mobiusEdgeRepoChat = new MobiusEdgeRepo(metaKdb);
		this.graphRepoChat = new GraphRepo(this.mobiusNodeRepoChat, this.mobiusEdgeRepoChat);
		this.mobiusOperationRepo = new MobiusOperationRepo(metaKdb);
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
	 * Get IndexedDocumentRepo for the given index tenant (default: vault).
	 */
	getIndexedDocumentRepo(tenant: IndexTenant = 'vault'): IndexedDocumentRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.indexedDocumentRepoChat : this.indexedDocumentRepo;
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
	 * Graph semantics (preview, tags, N-hop) for the given index tenant (default: vault).
	 */
	getGraphRepo(tenant: IndexTenant = 'vault'): GraphRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.graphRepoChat : this.graphRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Mobius node repo for the given index tenant (vault = search.sqlite, chat = meta.sqlite index).
	 */
	getMobiusNodeRepo(tenant: IndexTenant = 'vault'): MobiusNodeRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.mobiusNodeRepoChat : this.mobiusNodeRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Mobius edge repo for the given index tenant.
	 */
	getMobiusEdgeRepo(tenant: IndexTenant = 'vault'): MobiusEdgeRepo {
		if (this.closing) throw new Error('SqliteStoreManager not initialized or is closing.');
		const repo = tenant === 'chat' ? this.mobiusEdgeRepoChat : this.mobiusEdgeRepo;
		if (!repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/**
	 * Append-only operation log (meta.sqlite).
	 */
	getMobiusOperationRepo(): MobiusOperationRepo {
		if (this.closing || !this.mobiusOperationRepo) {
			throw new Error('SqliteStoreManager not initialized or is closing.');
		}
		return this.mobiusOperationRepo;
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
		this.indexedDocumentRepo = null;
		this.docChunkRepo = null;
		this.embeddingRepo = null;
		this.indexStateRepo = null;
		this.graphRepo = null;
		this.indexedDocumentRepoChat = null;
		this.docChunkRepoChat = null;
		this.embeddingRepoChat = null;
		this.indexStateRepoChat = null;
		this.graphRepoChat = null;
		this.mobiusNodeRepo = null;
		this.mobiusEdgeRepo = null;
		this.mobiusNodeRepoChat = null;
		this.mobiusEdgeRepoChat = null;
		this.mobiusOperationRepo = null;
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
