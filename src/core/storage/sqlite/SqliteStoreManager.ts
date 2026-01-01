import type { App } from 'obsidian';
import path from 'path';
import { BetterSqliteStore } from './better-sqlite3-adapter/BetterSqliteStore';
import { SqlJsStore } from './sqljs-adapter/SqlJsStore';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from './ddl';
import type { SqliteStoreType, SqliteStore } from './types';
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
import { SEARCH_DB_FILENAME } from '@/core/constant';

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
	private store: SqliteStore | null = null;
	private storeType: SqliteStoreType = 'sql.js';
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
	private chatStarRepo: ChatStarRepo | null = null;


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

		// Select backend using the extracted function
		const userSetting = params.settings?.sqliteBackend;
		let selectedBackend = await this.selectBackend(userSetting);
		this.storeType = selectedBackend;

		// Open database with selected backend
		// If better-sqlite3 fails, automatically fallback to sql.js
		try {
			switch (selectedBackend) {
				case 'better-sqlite3':
					this.store = await BetterSqliteStore.open({ dbFilePath, app: this.app ?? undefined });
					break;
				case 'sql.js':
					this.store = await SqlJsStore.open({ dbFilePath });
					break;
			}
		} catch (error) {
			// If better-sqlite3 fails to open (e.g., native module loading failed),
			// automatically fallback to sql.js
			if (selectedBackend === 'better-sqlite3') {
				console.error('[SqliteStoreManager] Failed to open database with better-sqlite3:', error);
				console.log('[SqliteStoreManager] Automatically falling back to sql.js');
				this.storeType = 'sql.js';
				this.store = await SqlJsStore.open({ dbFilePath });
			} else {
				// Re-throw error for sql.js (should not fail, but if it does, we need to know)
				throw error;
			}
		}

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
	 * Get the store instance.
	 * Throws error if not initialized.
	 */
	getStore(): SqliteStore {
		if (!this.store) {
			throw new Error('SqliteStoreManager not initialized. Call init() first.');
		}
		return this.store;
	}

	/**
	 * Get the current backend type.
	 */
	getStoreType(): SqliteStoreType {
		return this.storeType;
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
	 * Save the database (for sql.js backend).
	 * This is a no-op for other backends.
	 */
	save(): void {
		if (this.store && this.storeType === 'sql.js' && 'save' in this.store) {
			(this.store as SqlJsStore).save();
		}
	}

	close(): void {
		if (this.store) {
			// sql.js needs to save before closing
			if (this.storeType === 'sql.js' && 'save' in this.store) {
				(this.store as SqlJsStore).save();
			}
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
		this.chatStarRepo = null;
	}
}

/**
 * Global singleton instance.
 */
export const sqliteStoreManager = new SqliteStoreManager();
