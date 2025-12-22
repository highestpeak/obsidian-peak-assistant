/**
 * @deprecated This file is deprecated and will be removed in a future commit.
 * Worker-based search has been replaced by main-thread SQLite search (USKE architecture).
 * See: src/core/storage/README.md
 */

import { OramaSearchIndex } from '../orama/OramaSearchIndex';
import { SqliteStore } from '../sqlite/SqliteMetadataStore';
import { DocMetaRepo } from '../sqlite/repositories/DocMetaRepo';
import { RecentOpenRepo } from '../sqlite/repositories/RecentOpenRepo';
import { IndexStateRepo } from '../sqlite/repositories/IndexStateRepo';
import { GraphNodeRepo } from '../sqlite/repositories/GraphNodeRepo';
import { GraphEdgeRepo } from '../sqlite/repositories/GraphEdgeRepo';
import { GraphStore } from '@/core/storage/graph/GraphStore';
import { SearchEngine } from '../SearchEngine';

/**
 * Worker context that owns worker-side singletons and lifecycle state.
 */
export class WorkerContext {
	// state
	private vaultId: string | null = null;
	private indexReady: boolean = false;
	private indexedDocs: number = 0;

	// databases
	private orama: OramaSearchIndex | null = null;
	private sqlite: Promise<SqliteStore> | null = null;

	// repositories
	private docMeta: DocMetaRepo | null = null;
	private recentOpen: RecentOpenRepo | null = null;
	private indexState: IndexStateRepo | null = null;
	private graphNodeRepo: GraphNodeRepo | null = null;
	private graphEdgeRepo: GraphEdgeRepo | null = null;
	private graphStore: GraphStore | null = null;

	// search engine
	private engine: SearchEngine | null = null;

	// init

	async initDatabase(params?: { storageBytes?: { sqlite?: ArrayBuffer | null; orama?: string | null } }): Promise<void> {
		const orama = await this.getOrama(params?.storageBytes?.orama);
		await this.getSqlite(params?.storageBytes?.sqlite);
		await this.getGraphStore(); // Graph is now persisted in SQLite
	}

	async initRepos(): Promise<void> {
		if (this.docMeta && this.recentOpen && this.indexState && this.graphNodeRepo && this.graphEdgeRepo && this.graphStore) return;
		const sqlite = await this.getSqlite();
		this.docMeta = new DocMetaRepo(sqlite.queryBuilder);
		this.recentOpen = new RecentOpenRepo(sqlite.queryBuilder);
		this.indexState = new IndexStateRepo(sqlite.queryBuilder);
		this.graphNodeRepo = new GraphNodeRepo(sqlite.queryBuilder);
		this.graphEdgeRepo = new GraphEdgeRepo(sqlite.queryBuilder);
		this.graphStore = new GraphStore(this.graphNodeRepo, this.graphEdgeRepo);
	}

	// state

	setVaultId(vaultId: string | null): void {
		this.vaultId = vaultId;
	}

	markIndexed(count: number): void {
		this.indexedDocs += count;
		if (count > 0) this.indexReady = true;
	}

	getIndexReady(): boolean {
		return this.indexReady;
	}

	getIndexedDocs(): number {
		return this.indexedDocs;
	}

	// repositories

	getDocMetaRepo(): DocMetaRepo {
		if (!this.docMeta) {
			throw new Error('DocMetaRepo not initialized. Call initRepos() first.');
		}
		return this.docMeta;
	}

	getRecentOpenRepo(): RecentOpenRepo {
		if (!this.recentOpen) {
			throw new Error('RecentOpenRepo not initialized. Call initRepos() first.');
		}
		return this.recentOpen;
	}

	getIndexStateRepo(): IndexStateRepo {
		if (!this.indexState) {
			throw new Error('IndexStateRepo not initialized. Call initRepos() first.');
		}
		return this.indexState;
	}

	// databases

	async getSearchEngine(): Promise<SearchEngine> {
		if (this.engine) return this.engine;
		try {
			const orama = await this.getOrama();
			const graphStore = await this.getGraphStore();
			const recentOpenRepo = this.getRecentOpenRepo();
			this.engine = new SearchEngine(orama, recentOpenRepo, graphStore);
			return this.engine;
		} catch (e) {
			throw new Error(`Failed to create SearchEngine: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async getSqlite(bytes?: ArrayBuffer | null): Promise<SqliteStore> {
		if (this.sqlite) return this.sqlite;
		try {
			this.sqlite = SqliteStore.getInstance({ sqliteBytes: bytes ?? null });
			return this.sqlite;
		} catch (e) {
			throw new Error(`Failed to create SqliteMetadataStore: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async getOrama(json?: string | null): Promise<OramaSearchIndex> {
		if (this.orama) return this.orama;
		try {
			this.orama = await OramaSearchIndex.getInstance({ oramaJson: json ?? null });
			return this.orama;
		} catch (e) {
			throw new Error(`Failed to create OramaSearchIndex: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async getGraphStore(): Promise<GraphStore> {
		await this.initRepos();
		if (!this.graphStore) {
			throw new Error('GraphStore not initialized. Call initRepos() first.');
		}
		return this.graphStore;
	}

	/**
	 * Reset all indexing-related state and storage.
	 *
	 * Notes:
	 * - This clears sqlite tables used for search signals/meta and resets in-memory indexes.
	 * - The main thread is responsible for persisting new empty storage bytes after this.
	 */
	async resetIndex(params?: { clearRecent?: boolean }): Promise<void> {
		const sqlite = await this.getSqlite();
		// Clear sqlite tables (best-effort; schema is tiny so full delete is ok).
		sqlite.queryBuilder.deleteFrom('doc_meta').execute();
		sqlite.queryBuilder.deleteFrom('index_state').execute();
		sqlite.queryBuilder.deleteFrom('graph_nodes').execute();
		sqlite.queryBuilder.deleteFrom('graph_edges').execute();
		if (params?.clearRecent !== false) {
			sqlite.queryBuilder.deleteFrom('recent_open').execute();
		}

		// Reset in-memory state/indexes.
		this.indexReady = false;
		this.indexedDocs = 0;
		this.engine = null;
		this.orama = null;
		this.graphStore = null;
		this.graphNodeRepo = null;
		this.graphEdgeRepo = null;
	}
}


