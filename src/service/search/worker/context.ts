import { OramaSearchIndex } from '@/service/storage/orama/OramaSearchIndex';
import { SqliteStore } from '@/service/storage/sqlite/SqliteMetadataStore';
import { DocMetaRepo } from '@/service/storage/sqlite/repositories/DocMetaRepo';
import { RecentOpenRepo } from '@/service/storage/sqlite/repositories/RecentOpenRepo';
import { IndexStateRepo } from '@/service/storage/sqlite/repositories/IndexStateRepo';
import { SearchGraphIndex } from '@/service/storage/graph/SearchGraphIndex';
import { SearchEngine } from '@/service/search/search/SearchEngine';

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
	private graph: SearchGraphIndex | null = null;

	// repositories
	private docMeta: DocMetaRepo | null = null;
	private recentOpen: RecentOpenRepo | null = null;
	private indexState: IndexStateRepo | null = null;

	// search engine
	private engine: SearchEngine | null = null;

	// init

	async initDatabase(params?: { storageBytes?: { sqlite?: ArrayBuffer | null; orama?: string | null; graph?: string | null } }): Promise<void> {
		const orama = await this.getOrama(params?.storageBytes?.orama);
		const graph = this.getGraph(params?.storageBytes?.graph);
		await this.getSqlite(params?.storageBytes?.sqlite);
	}

	async initRepos(): Promise<void> {
		if (this.docMeta && this.recentOpen && this.indexState) return;
		const sqlite = await this.getSqlite();
		this.docMeta = new DocMetaRepo(sqlite.queryBuilder);
		this.recentOpen = new RecentOpenRepo(sqlite.queryBuilder);
		this.indexState = new IndexStateRepo(sqlite.queryBuilder);
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
			const graph = this.getGraph();
			const recentOpenRepo = this.getRecentOpenRepo();
			this.engine = new SearchEngine(orama, recentOpenRepo, graph);
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

	getGraph(json?: string | null): SearchGraphIndex {
		if (this.graph) return this.graph;
		try {
			this.graph = SearchGraphIndex.getInstance({ graphJson: json ?? null });
			return this.graph;
		} catch (e) {
			throw new Error(`Failed to create SearchGraphIndex: ${e instanceof Error ? e.message : String(e)}`);
		}
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
		if (params?.clearRecent !== false) {
			sqlite.queryBuilder.deleteFrom('recent_open').execute();
		}

		// Reset in-memory state/indexes.
		this.indexReady = false;
		this.indexedDocs = 0;
		this.engine = null;
		this.orama = null;
		this.graph = null;
	}
}


