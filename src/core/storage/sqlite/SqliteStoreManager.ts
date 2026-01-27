import type { App } from 'obsidian';
import path from 'path';
import { BetterSqliteStore } from './better-sqlite3-adapter/BetterSqliteStore';
import { SqlJsStore } from './sqljs-adapter/SqlJsStore';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from './ddl';
import type { SqliteStoreType, SqliteDatabase } from './types';
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
import { SEARCH_DB_FILENAME, META_DB_FILENAME } from '@/core/constant';

/**
 * Global singleton manager for SQLite database connection.
 * 
 * This provides a centralized way to access the database connection
 * across different parts of the application without passing it through
 * multiple layers.
 * 
 * Supports multiple backends:
 * - better-sqlite3 (native, fastest, requires manual installation)
 * - sql.js (pure JS, default, cross-platform)
 */
class SqliteStoreManager {
	// Database connections
	private searchStore: SqliteDatabase | null = null;
	private metaStore: SqliteDatabase | null = null;
	private app: App | null = null;
	private isVectorSearchAvailable: boolean = false;

	// Search database repositories (search.sqlite)
	private docMetaRepo: DocMetaRepo | null = null;
	private docChunkRepo: DocChunkRepo | null = null;
	private embeddingRepo: EmbeddingRepo | null = null;
	private indexStateRepo: IndexStateRepo | null = null;
	private docStatisticsRepo: DocStatisticsRepo | null = null;
	private graphNodeRepo: GraphNodeRepo | null = null;
	private graphEdgeRepo: GraphEdgeRepo | null = null;
	private graphStore: GraphStore | null = null;

	// Meta database repositories (meta.sqlite)
	private chatProjectRepo: ChatProjectRepo | null = null;
	private chatConversationRepo: ChatConversationRepo | null = null;
	private chatMessageRepo: ChatMessageRepo | null = null;
	private chatMessageResourceRepo: ChatMessageResourceRepo | null = null;
	private chatStarRepo: ChatStarRepo | null = null;


	/**
	 * Create a database connection with the specified path and settings.
	 * Returns both the database connection and the backend type used.
	 */
	private async createDatabaseConnection(
		dbFilePath: string,
		settings?: { sqliteBackend?: 'auto' | 'better-sqlite3' | 'sql.js' }
	): Promise<SqliteDatabase> {
		const userSetting = settings?.sqliteBackend;
		let selectedBackend = await this.selectBackend(userSetting);

		// Open database with selected backend
		// If better-sqlite3 fails, automatically fallback to sql.js
		try {
			switch (selectedBackend) {
				case 'better-sqlite3': {
					const result = await BetterSqliteStore.open({ dbFilePath, app: this.app ?? undefined });
					this.isVectorSearchAvailable = result.sqliteVecAvailable;
					return result.store;
				}
				case 'sql.js': {
					const result = await SqlJsStore.open({ dbFilePath });
					this.isVectorSearchAvailable = false;
					return result;
				}
			}
		} catch (error) {
			// If better-sqlite3 fails to open (e.g., native module loading failed),
			// automatically fallback to sql.js
			if (selectedBackend === 'better-sqlite3') {
				console.error('[SqliteStoreManager] Failed to open database with better-sqlite3:', error);
				console.log('[SqliteStoreManager] Automatically falling back to sql.js');
				this.isVectorSearchAvailable = false;
				return await SqlJsStore.open({ dbFilePath });
			} else {
				// Re-throw error for sql.js (should not fail, but if it does, we need to know)
				throw error;
			}
		}
	}

	/**
	 * Select the appropriate SQLite backend based on user settings and availability.
	 *
	 * Priority order:
	 * 1. User setting (if explicitly set in settings)
	 * 2. Auto-detect better-sqlite3 (if available)
	 * 3. Default to sql.js
	 *
	 * @param userSetting - User's backend preference from settings ('auto' | 'better-sqlite3' | 'sql.js' | undefined)
	 * @returns Selected backend type
	 */
	private async selectBackend(userSetting?: 'auto' | 'better-sqlite3' | 'sql.js'): Promise<SqliteStoreType> {
		// Priority 1: User setting (if explicitly set)
		if (userSetting && userSetting !== 'auto') {
			if (userSetting === 'better-sqlite3') {
				const available = await BetterSqliteStore.checkAvailable(this.app ?? undefined);
				if (available) {
					console.log('[SqliteStoreManager] Using better-sqlite3 (user preference)');
					return 'better-sqlite3';
				} else {
					console.warn('[SqliteStoreManager] better-sqlite3 requested but not available, falling back to sql.js');
					return 'sql.js';
				}
			} else {
				console.log('[SqliteStoreManager] Using sql.js (user preference)');
				return 'sql.js';
			}
		}

		// Priority 2: Auto-detect better-sqlite3 (if available)
		if (userSetting === 'auto' || !userSetting) {
			const available = await BetterSqliteStore.checkAvailable(this.app ?? undefined);
			if (available) {
				console.log('[SqliteStoreManager] Using better-sqlite3 (auto-detected)');
				return 'better-sqlite3';
			}
		}

		// Priority 3: Default to sql.js
		console.log('[SqliteStoreManager] Using sql.js (default, cross-platform)');
		return 'sql.js';
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
	 * Backend selection priority:
	 * 1. User setting (if explicitly set in settings)
	 * 2. Auto-detect better-sqlite3 (if available)
	 * 3. Default to sql.js
	 *
	 * @param app - Obsidian app instance
	 * @param storageFolder - Storage folder path (relative to vault root)
	 * @param filename - Database filename (default: SEARCH_DB_FILENAME)
	 * @param settings - Optional plugin settings (if provided, will use sqliteBackend from settings)
	 */
	async init(params: {
		app: App;
		storageFolder?: string;
		filename?: string;
		settings?: { sqliteBackend?: 'auto' | 'better-sqlite3' | 'sql.js' };
	}): Promise<void> {
		if (this.searchStore || this.metaStore) {
			console.warn('SqliteStoreManager already initialized, closing existing connections');
			this.close();
		}

		this.app = params.app;

		// Create search database connection
		const searchDbPath = await this.buildDatabasePath(params.app, params.storageFolder, SEARCH_DB_FILENAME);
		this.searchStore = await this.createDatabaseConnection(searchDbPath, params.settings);

		// Create meta database connection
		const metaDbPath = await this.buildDatabasePath(params.app, params.storageFolder, META_DB_FILENAME);
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

		// Initialize meta database repositories
		const metaKdb = this.metaStore.kysely<DbSchema>();
		this.chatProjectRepo = new ChatProjectRepo(metaKdb);
		this.chatConversationRepo = new ChatConversationRepo(metaKdb);
		this.chatMessageRepo = new ChatMessageRepo(metaKdb);
		this.chatMessageResourceRepo = new ChatMessageResourceRepo(metaKdb);
		this.chatStarRepo = new ChatStarRepo(metaKdb);
	}

	/**
	 * Get the Kysely instance for database queries.
	 * Returns the search database connection for backward compatibility.
	 * Throws error if not initialized.
	 */
	getSearchContext(): Kysely<DbSchema> {
		if (!this.searchStore) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.searchStore.kysely();
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
		return this.searchStore !== null && this.metaStore !== null;
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
	 * Check if vector similarity search is available.
	 * This requires sqlite-vec extension to be loaded successfully.
	 */
	isVectorSearchEnabled(): boolean {
		return this.isVectorSearchAvailable;
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
	/**
	 * Save both databases (for sql.js backend).
	 * This is a no-op for other backends.
	 */
	save(): void {
		// Save search database
		if (this.searchStore && this.searchStore.databaseType() === 'sql.js' && 'save' in this.searchStore) {
			(this.searchStore as any).save();
		}
		// Save meta database
		if (this.metaStore && this.metaStore.databaseType() === 'sql.js' && 'save' in this.metaStore) {
			(this.metaStore as any).save();
		}
	}

	close(): void {
		// Close search database
		if (this.searchStore) {
			// sql.js needs to save before closing
			if (this.searchStore.databaseType() === 'sql.js' && 'save' in this.searchStore) {
				(this.searchStore as any).save();
			}
			this.searchStore.close();
			this.searchStore = null;
		}

		// Close meta database
		if (this.metaStore) {
			// sql.js needs to save before closing
			if (this.metaStore.databaseType() === 'sql.js' && 'save' in this.metaStore) {
				(this.metaStore as any).save();
			}
			this.metaStore.close();
			this.metaStore = null;
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
		this.chatStarRepo = null;
	}
}

/**
 * Global singleton instance.
 */
// todo change to another way to build instance of SqliteStoreManager like AppContext.getInstance()
export const sqliteStoreManager = new SqliteStoreManager();
