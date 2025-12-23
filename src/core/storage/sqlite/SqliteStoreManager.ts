import type { App } from 'obsidian';
import path from 'path';
import { BetterSqliteStore } from './BetterSqliteStore';
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

/**
 * Global singleton manager for SQLite database connection.
 * 
 * This provides a centralized way to access the database connection
 * across different parts of the application without passing it through
 * multiple layers.
 */
class SqliteStoreManager {
	private store: BetterSqliteStore | null = null;
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

	/**
	 * Initialize the database connection.
	 * Should be called once during plugin initialization.
	 * 
	 * @param app - Obsidian app instance
	 * @param storageFolder - Storage folder path (relative to vault root)
	 * @param filename - Database filename (default: 'search.sqlite')
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
		const filename = params.filename ?? 'search.sqlite';
		
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
		
		this.store = BetterSqliteStore.open({ dbFilePath });
		
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
	 * Get the BetterSqliteStore instance.
	 * Throws error if not initialized.
	 */
	getStore(): BetterSqliteStore {
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
	}
}

/**
 * Global singleton instance.
 */
export const sqliteStoreManager = new SqliteStoreManager();

