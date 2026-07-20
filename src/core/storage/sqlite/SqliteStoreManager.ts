import type { AppHandle as App } from '@/core/ports/AppHandle';
import path from 'path';
import fs from 'fs';
import { BetterSqliteStore } from './better-sqlite3-adapter/BetterSqliteStore';
import type { Kysely } from 'kysely';
import type { Database as DbSchema } from './ddl';
import type { IndexTenant, SqliteStoreType, SqliteDatabase } from './types';
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
import { ChatAssistantRepo } from './repositories/ChatAssistantRepo';
import { ChatProjectPlanRepo } from './repositories/ChatProjectPlanRepo';
import { ChatTurnReceiptRepo } from './repositories/ChatTurnReceiptRepo';
import { ChatArtifactReceiptRepo } from './repositories/ChatArtifactReceiptRepo';
import { AIAnalysisRepo } from './repositories/AIAnalysisRepo';
import { QueryPatternRepo } from './repositories/QueryPatternRepo';
import { UserProfileProcessedHashRepo } from './repositories/UserProfileProcessedHashRepo';
import { CascadeDebtRepo } from './repositories/CascadeDebtRepo';
import { HubConstituentRepo } from './repositories/HubConstituentRepo';
import { HubCurationPlanRepo } from './repositories/HubCurationPlanRepo';
import { AmbientPushRepo } from './repositories/AmbientPushRepo';
import { TagSuggestionRepo } from './repositories/TagSuggestionRepo';
import { VaultLintRepo } from './repositories/VaultLintRepo';
import { StructuralAnalysisRepo } from './repositories/StructuralAnalysisRepo';
import { VAULT_DB_FILENAME, CHAT_DB_FILENAME } from '@/core/constant';

/** Global singleton manager for SQLite database connections (better-sqlite3). */
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

	// Search database repositories (vault tenant)
	private indexedDocumentRepo: IndexedDocumentRepo | null = null;
	private docChunkRepo: DocChunkRepo | null = null;
	private embeddingRepo: EmbeddingRepo | null = null;
	private indexStateRepo: IndexStateRepo | null = null;
	private graphRepo: GraphRepo | null = null;
	private userProfileProcessedHashRepo: UserProfileProcessedHashRepo | null = null;
	private mobiusNodeRepo: MobiusNodeRepo | null = null;
	private mobiusEdgeRepo: MobiusEdgeRepo | null = null;
	private cascadeDebtRepo: CascadeDebtRepo | null = null;
	private hubConstituentRepo: HubConstituentRepo | null = null;
	private ambientPushRepo: AmbientPushRepo | null = null;
	private vaultLintRepo: VaultLintRepo | null = null;
	private structuralAnalysisRepo: StructuralAnalysisRepo | null = null;

	// Meta database repositories (chat tenant + chat-only tables)
	private indexedDocumentRepoChat: IndexedDocumentRepo | null = null;
	private docChunkRepoChat: DocChunkRepo | null = null;
	private embeddingRepoChat: EmbeddingRepo | null = null;
	private indexStateRepoChat: IndexStateRepo | null = null;
	private graphRepoChat: GraphRepo | null = null;
	private mobiusNodeRepoChat: MobiusNodeRepo | null = null;
	private mobiusEdgeRepoChat: MobiusEdgeRepo | null = null;
	private mobiusOperationRepo: MobiusOperationRepo | null = null;
	private chatProjectRepo: ChatProjectRepo | null = null;
	private chatConversationRepo: ChatConversationRepo | null = null;
	private chatMessageRepo: ChatMessageRepo | null = null;
	private chatMessageResourceRepo: ChatMessageResourceRepo | null = null;
	private chatStarRepo: ChatStarRepo | null = null;
	private chatAssistantRepo: ChatAssistantRepo | null = null;
	private chatProjectPlanRepo: ChatProjectPlanRepo | null = null;
	private chatTurnReceiptRepo: ChatTurnReceiptRepo | null = null;
	private chatArtifactReceiptRepo: ChatArtifactReceiptRepo | null = null;
	private aiAnalysisRepo: AIAnalysisRepo | null = null;
	private queryPatternRepo: QueryPatternRepo | null = null;
	private cascadeDebtRepoChat: CascadeDebtRepo | null = null;
	private tagSuggestionRepo: TagSuggestionRepo | null = null;

	/** Asserts initialized and not closing, returns the repo or throws. */
	private requireRepo<T>(repo: T | null): T {
		if (this.closing || !repo) throw new Error('SqliteStoreManager not initialized or is closing.');
		return repo;
	}

	/** Tenant-aware repo selector. */
	private tenantRepo<T>(tenant: IndexTenant, vault: T | null, chat: T | null): T {
		return this.requireRepo(tenant === 'chat' ? chat : vault);
	}


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
	 * T11Q: app-level reporter for the "SQLite backend unavailable" path. The
	 * app composes this and passes it through `init({ unavailableReporter })`
	 * so core never imports Obsidian `Notice` directly.
	 */
	private unavailableReporter: ((message: string, durationMs: number) => void) | null = null;

	private async selectBackend(userSetting?: 'auto' | 'better-sqlite3'): Promise<void> {
		const available = await BetterSqliteStore.checkAvailable(this.app ?? undefined);
		if (!available) {
			this.unavailableReporter?.(
				'Peak Assistant: SQLite component failed to load. ' +
				'Search and indexing features are unavailable. ' +
				'Please restart Obsidian or reinstall the plugin.',
				15000,
			);
			throw new Error(
				'better-sqlite3 is required but not available. ' +
				`Runtime ABI: ${process.versions.modules}, platform: ${process.platform}-${process.arch}. ` +
				'NativeModuleManager auto-download may have failed — check the console for details.'
			);
		}
		if (userSetting === 'better-sqlite3') {
			console.log('[SqliteStoreManager] Using better-sqlite3 (user preference)');
		} else {
			console.log('[SqliteStoreManager] Using better-sqlite3 (auto-detected)');
		}
	}

	private async buildDatabasePath(
		app: App,
		storageFolder: string | undefined,
		dbFilename: string
	): Promise<string> {
		// Calculate database file paths
		const basePath = (app.vault.adapter as any)?.basePath ?? '';
		const normalizedStorageFolder = (storageFolder ?? '').trim().replace(/^\/+/, '');

		// Calculate the database path
		const dbPath = basePath
			? (normalizedStorageFolder ? path.join(basePath, normalizedStorageFolder, dbFilename) : path.join(basePath, dbFilename))
			: null;

		// Ensure the storage folder exists before opening a file-backed database.
		// T11R Phase 2: use Node fs directly (SqliteStoreManager is desktop-only,
		// always runs with full Node fs access) instead of routing through the
		// vault helpers, which would re-introduce an `obsidian` import in core.
		if (basePath && normalizedStorageFolder) {
			const absFolder = path.join(basePath, normalizedStorageFolder);
			try {
				fs.mkdirSync(absFolder, { recursive: true });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!msg.includes('EEXIST')) throw err;
			}
		}

		if (!dbPath) {
			throw new Error(`SqliteStoreManager init failed: ${dbFilename} database path is missing and vault basePath is unavailable`);
		}

		return dbPath;
	}

	async init(params: {
		app: App;
		storageFolder?: string;
		filename?: string;
		settings?: { sqliteBackend?: 'auto' | 'better-sqlite3' };
		/** T11Q: app passes a reporter so core can surface "backend unavailable" without importing `Notice`. */
		unavailableReporter?: (message: string, durationMs: number) => void;
	}): Promise<void> {
		if (this.searchStore || this.metaStore) {
			console.warn('SqliteStoreManager already initialized, closing existing connections');
			this.close();
		}

		this.app = params.app;
		this.unavailableReporter = params.unavailableReporter ?? null;

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
		this.cascadeDebtRepo = new CascadeDebtRepo(searchKdb);
		this.ambientPushRepo = new AmbientPushRepo(searchKdb);
		this.vaultLintRepo = new VaultLintRepo(searchKdb);

		// Initialize meta database repositories (chat/ai tables)
		const metaKdb = this.metaStore.kysely<DbSchema>();
		this.chatProjectRepo = new ChatProjectRepo(metaKdb);
		this.chatConversationRepo = new ChatConversationRepo(metaKdb);
		this.chatMessageRepo = new ChatMessageRepo(metaKdb);
		this.chatMessageResourceRepo = new ChatMessageResourceRepo(metaKdb);
		this.chatStarRepo = new ChatStarRepo(metaKdb);
		this.chatAssistantRepo = new ChatAssistantRepo(metaKdb);
		this.chatProjectPlanRepo = new ChatProjectPlanRepo(metaKdb);
		this.chatTurnReceiptRepo = new ChatTurnReceiptRepo(metaKdb);
		this.chatArtifactReceiptRepo = new ChatArtifactReceiptRepo(metaKdb);
		this.aiAnalysisRepo = new AIAnalysisRepo(metaKdb);
		this.queryPatternRepo = new QueryPatternRepo(metaKdb);

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
		this.cascadeDebtRepoChat = new CascadeDebtRepo(metaKdb);
	}

	getIndexContext(tenant: IndexTenant = 'vault'): Kysely<DbSchema> {
		const store = tenant === 'chat' ? this.metaStore : this.searchStore;
		if (this.closing || !store) throw new Error('SqliteStoreManager not initialized or is closing.');
		return store.kysely();
	}

	getSearchStore(): SqliteDatabase | null { return this.searchStore; }
	getMetaStore(): SqliteDatabase | null { return this.metaStore; }
	isInitialized(): boolean { return !this.closing && this.searchStore !== null && this.metaStore !== null; }
	isVectorSearchEnabled(): boolean { return this.isVectorSearchAvailable; }

	// Tenant-aware repos (vault = search.sqlite, chat = meta.sqlite)
	getIndexedDocumentRepo(tenant: IndexTenant = 'vault'): IndexedDocumentRepo { return this.tenantRepo(tenant, this.indexedDocumentRepo, this.indexedDocumentRepoChat); }
	getDocChunkRepo(tenant: IndexTenant = 'vault'): DocChunkRepo { return this.tenantRepo(tenant, this.docChunkRepo, this.docChunkRepoChat); }
	getEmbeddingRepo(tenant: IndexTenant = 'vault'): EmbeddingRepo { return this.tenantRepo(tenant, this.embeddingRepo, this.embeddingRepoChat); }
	getIndexStateRepo(tenant: IndexTenant = 'vault'): IndexStateRepo { return this.tenantRepo(tenant, this.indexStateRepo, this.indexStateRepoChat); }
	getGraphRepo(tenant: IndexTenant = 'vault'): GraphRepo { return this.tenantRepo(tenant, this.graphRepo, this.graphRepoChat); }
	getMobiusNodeRepo(tenant: IndexTenant = 'vault'): MobiusNodeRepo { return this.tenantRepo(tenant, this.mobiusNodeRepo, this.mobiusNodeRepoChat); }
	getMobiusEdgeRepo(tenant: IndexTenant = 'vault'): MobiusEdgeRepo { return this.tenantRepo(tenant, this.mobiusEdgeRepo, this.mobiusEdgeRepoChat); }
	getCascadeDebtRepo(tenant: IndexTenant = 'vault'): CascadeDebtRepo { return this.tenantRepo(tenant, this.cascadeDebtRepo, this.cascadeDebtRepoChat); }

	// Single-tenant repos
	getMobiusOperationRepo(): MobiusOperationRepo { return this.requireRepo(this.mobiusOperationRepo); }
	getUserProfileProcessedHashRepo(): UserProfileProcessedHashRepo { return this.requireRepo(this.userProfileProcessedHashRepo); }
	getChatProjectRepo(): ChatProjectRepo { return this.requireRepo(this.chatProjectRepo); }
	getChatConversationRepo(): ChatConversationRepo { return this.requireRepo(this.chatConversationRepo); }
	getChatMessageRepo(): ChatMessageRepo { return this.requireRepo(this.chatMessageRepo); }
	getChatMessageResourceRepo(): ChatMessageResourceRepo { return this.requireRepo(this.chatMessageResourceRepo); }
	getChatStarRepo(): ChatStarRepo { return this.requireRepo(this.chatStarRepo); }
	getChatAssistantRepo(): ChatAssistantRepo { return this.requireRepo(this.chatAssistantRepo); }
	getChatProjectPlanRepo(): ChatProjectPlanRepo { return this.requireRepo(this.chatProjectPlanRepo); }
	getChatTurnReceiptRepo(): ChatTurnReceiptRepo { return this.requireRepo(this.chatTurnReceiptRepo); }
	getChatArtifactReceiptRepo(): ChatArtifactReceiptRepo { return this.requireRepo(this.chatArtifactReceiptRepo); }
	getAIAnalysisRepo(): AIAnalysisRepo { return this.requireRepo(this.aiAnalysisRepo); }
	getQueryPatternRepo(): QueryPatternRepo { return this.requireRepo(this.queryPatternRepo); }
	getAmbientPushRepo(): AmbientPushRepo { return this.requireRepo(this.ambientPushRepo); }
	getVaultLintRepo(): VaultLintRepo { return this.requireRepo(this.vaultLintRepo); }

	getStructuralAnalysisRepo(): StructuralAnalysisRepo {
		if (this.closing) throw new Error('SqliteStoreManager is closing');
		if (!this.structuralAnalysisRepo) {
			this.structuralAnalysisRepo = new StructuralAnalysisRepo(this.getIndexContext('vault'));
		}
		return this.structuralAnalysisRepo;
	}

	getHubConstituentRepo(): HubConstituentRepo {
		if (!this.hubConstituentRepo) {
			this.hubConstituentRepo = new HubConstituentRepo(this.getIndexContext('vault'));
		}
		return this.hubConstituentRepo;
	}

	private hubCurationPlanRepo: HubCurationPlanRepo | null = null;
	getHubCurationPlanRepo(): HubCurationPlanRepo {
		if (!this.hubCurationPlanRepo) {
			this.hubCurationPlanRepo = new HubCurationPlanRepo(this.getIndexContext('vault'));
		}
		return this.hubCurationPlanRepo;
	}

	getTagSuggestionRepo(): TagSuggestionRepo {
		if (this.closing) throw new Error('SqliteStoreManager is closing');
		if (!this.metaStore) throw new Error('chat.sqlite not initialized');
		if (!this.tagSuggestionRepo) {
			this.tagSuggestionRepo = new TagSuggestionRepo(this.metaStore.kysely<DbSchema>());
		}
		return this.tagSuggestionRepo;
	}

	/** No-op for compatibility. better-sqlite3 persists to file automatically. */
	save(): void {}

	close(): void {
		this.closing = true;
		try {
			this.searchStore?.close();
			this.metaStore?.close();
		} catch (e) {
			console.warn('[SqliteStoreManager] Error during close (ignored):', e);
		}
		// Null out all references
		this.searchStore = this.metaStore = null;
		this.app = null;
		this.indexedDocumentRepo = this.docChunkRepo = this.embeddingRepo = this.indexStateRepo = this.graphRepo = null;
		this.mobiusNodeRepo = this.mobiusEdgeRepo = this.cascadeDebtRepo = this.ambientPushRepo = null;
		this.hubConstituentRepo = null;
		this.vaultLintRepo = null;
		this.structuralAnalysisRepo = null;
		this.tagSuggestionRepo = null;
		this.userProfileProcessedHashRepo = null;
		this.indexedDocumentRepoChat = this.docChunkRepoChat = this.embeddingRepoChat = this.indexStateRepoChat = this.graphRepoChat = null;
		this.mobiusNodeRepoChat = this.mobiusEdgeRepoChat = this.mobiusOperationRepo = this.cascadeDebtRepoChat = null;
		this.chatProjectRepo = this.chatConversationRepo = this.chatMessageRepo = null;
		this.chatMessageResourceRepo = this.chatStarRepo = this.aiAnalysisRepo = this.queryPatternRepo = null;
		this.chatAssistantRepo = this.chatProjectPlanRepo = this.chatTurnReceiptRepo = this.chatArtifactReceiptRepo = null;
	}
}

// todo change to another way to build instance of SqliteStoreManager like AppContext.getInstance()
export const sqliteStoreManager = SqliteStoreManager.getInstance();
