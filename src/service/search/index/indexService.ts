import type { Chunk } from './chunk/types';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GraphEdgeRepo } from '@/core/storage/sqlite/repositories/GraphEdgeRepo';
import { normalizeTextForFts } from '../support/segmenter';
import type { SearchSettings } from '@/app/settings/types';
import type { Document } from '@/core/document/types';
import { INDEX_STATE_KEYS } from '@/core/constant';
import { DocumentLoaderManager } from './document/DocumentLoaderManager';
import { generateUuidWithoutHyphens } from '@/service/chat/utils';
import { normalizePath } from 'obsidian';
import { AIServiceManager } from '@/service/chat/service-manager';

export type StorageType = 'sqlite' | 'graph';

export interface GetIndexStatusResponse {
	indexBuiltAt: number | null;
	indexedDocs: number | null;
	isReady: boolean;
}

/**
 * Index service for document and graph indexing operations.
 */
export class IndexService {

	private static instance: IndexService | null = null;
	private aiServiceManager: AIServiceManager;

	private constructor() {
		// Private constructor to prevent direct instantiation.
	}

	static getInstance(): IndexService {
		if (!IndexService.instance) {
			IndexService.instance = new IndexService();
		}
		return IndexService.instance;
	}

	/**
	 * Initialize IndexService with AIServiceManager for embedding generation.
	 * This should be called once during plugin initialization in main.ts.
	 * Can also be called when settings are updated to refresh the service instance.
	 */
	init(aiServiceManager: AIServiceManager): void {
		this.aiServiceManager = aiServiceManager;
	}

	/**
	 * Index a core document with chunking strategy applied.
	 * This method handles chunking internally based on settings.
	 * 
	 * @param doc - Core document to index
	 * @param settings - Search settings containing chunking configuration
	 */
	async indexDocument(
		doc: Document,
		settings: SearchSettings,
	): Promise<void> {
		if (!doc) return;

		// Get loader for document type
		const loaderManager = DocumentLoaderManager.getInstance();
		if (!loaderManager.shouldIndexDocument(doc)) {
			console.warn(`Document type ${doc.type} should not be indexed or has no loader`);
			return;
		}
		const loader = loaderManager.getLoaderForDocumentType(doc.type);
		if (!loader) {
			console.warn(`No loader found for document type: ${doc.type}`);
			return;
		}

		// Chunk content using loader's chunkContent method
		const chunks = await loader.chunkContent(doc, settings.chunking);

		// Generate embeddings for chunks if embedding model is configured
		const embeddingModel = settings.chunking.embeddingModel;
		if (embeddingModel) {
			await this.generateAndFillEmbeddings(chunks, embeddingModel);
		}

		// Save all data in a single transaction for atomicity
		const kdb = sqliteStoreManager.getKysely();
		await kdb.transaction().execute(async () => {
			// Save doc meta
			await this.saveDocMeta(doc);

			// Save search data (FTS and embeddings, not chunk data - reduce storage space)
			const embeddingModelName = embeddingModel ? `${embeddingModel.provider}:${embeddingModel.modelId}` : undefined;
			await this.saveSearchData(doc.id, doc.sourceFileInfo.path, doc.metadata.title, chunks, embeddingModelName);

			// Save graph data (all document types have graph)
			await this.upsertGraph(doc);

			// Finally: Update index state (only after graph is complete)
			await this.updateIndexState();
		});
	}

	/**
	 * Delete documents by paths. Removes all related data including chunks, embeddings, statistics, and graph nodes.
	 *
	 * Notes:
	 * - Graph cleanup: removes document node(s) but keeps tag/link nodes to avoid expensive GC.
	 * - All deletions are executed within a single transaction for consistency.
	 */
	async deleteDocuments(
		paths: string[],
		onAfterMutation?: (types: StorageType[]) => void,
	): Promise<void> {
		if (!paths.length) return;

		const docChunkRepo = sqliteStoreManager.getDocChunkRepo();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
		const docStatisticsRepo = sqliteStoreManager.getDocStatisticsRepo();
		const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();
		const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
		const kdb = sqliteStoreManager.getKysely();

		await kdb.transaction().execute(async (trx) => {
			// Get doc_ids from paths
			const metaMap = await docMetaRepo.getByPaths(paths);
			const docIds = Array.from(metaMap.values()).map((m) => m.id);

			docChunkRepo.deleteFtsByDocIds(docIds);
			await docChunkRepo.deleteByDocIds(docIds);
			await embeddingRepo.deleteByDocIds(docIds);
			await docStatisticsRepo.deleteByDocIds(docIds);
			await docMetaRepo.deleteByPaths(paths);

			// Graph cleanup: remove document node(s). Keep tag/link nodes to avoid expensive GC.
			await graphEdgeRepo.deleteByNodeIds(paths);
			await graphNodeRepo.deleteByIds(paths);
		});

		onAfterMutation?.(['sqlite', 'graph']);
	}

	/**
	 * Get index status including build timestamp and indexed document count.
	 */
	async getIndexStatus(): Promise<GetIndexStatusResponse> {
		const indexStateRepo = sqliteStoreManager.getIndexStateRepo();
		const builtAtRaw = await indexStateRepo.get(INDEX_STATE_KEYS.builtAt);
		const indexedRaw = await indexStateRepo.get(INDEX_STATE_KEYS.indexedDocs);
		const indexBuiltAt = builtAtRaw != null ? Number(builtAtRaw) : null;
		const indexedDocs = indexedRaw != null ? Number(indexedRaw) : null;
		return {
			indexBuiltAt: Number.isFinite(indexBuiltAt as any) ? indexBuiltAt : null,
			indexedDocs: Number.isFinite(indexedDocs as any) ? indexedDocs : null,
			isReady: Boolean(builtAtRaw),
		};
	}

	/**
	 * Generate embeddings for chunks and fill them into chunk objects.
	 * 
	 * @param chunks - Chunks to generate embeddings for
	 * @param embeddingModel - Embedding model configuration (provider and modelId)
	 */
	private async generateAndFillEmbeddings(
		chunks: Chunk[],
		embeddingModel: { provider: string; modelId: string },
	): Promise<void> {
		if (!chunks.length) return;

		try {
			// Generate embeddings using MultiProviderChatService from AIServiceManager
			const multiProviderChatService = this.aiServiceManager.getMultiChat();
			const embeddings = await multiProviderChatService.generateEmbeddings(
				chunks.map(chunk => chunk.content),
				embeddingModel.modelId,
				embeddingModel.provider,
			);

			// Fill embeddings into chunk.embedding fields
			for (let i = 0; i < chunks.length && i < embeddings.length; i++) {
				chunks[i].embedding = embeddings[i];
			}
		} catch (error) {
			console.error(`[IndexService] Failed to generate embeddings:`, error);
			// Continue without embeddings rather than failing the entire indexing
		}
	}

	/**
	 * Save search data (FTS and embeddings) to database.
	 */
	private async saveSearchData(docId: string, path: string, title: string, chunks: Chunk[], embeddingModel?: string): Promise<void> {
		const docChunkRepo = sqliteStoreManager.getDocChunkRepo();
		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
		const now = Date.now();

		// Delete existing FTS and embeddings for this doc
		docChunkRepo.deleteFtsByDocId(docId);
		await embeddingRepo.deleteByDocIds([docId]);

		// Save FTS and embeddings
		for (const chunk of chunks) {
			const chunkId = chunk.chunkId ?? generateUuidWithoutHyphens();
			const chunkIndex = Number(chunk.chunkIndex ?? 0);
			// Save FTS (title and content are both searchable in FTS5)
			const normTitle = normalizeTextForFts(title ?? '');
			const normContent = normalizeTextForFts(chunk.content ?? '');

			docChunkRepo.insertFts({
				chunk_id: chunkId,
				doc_id: docId,
				path: path,
				title: normTitle, // Normalized title for FTS search (searchable in FTS5)
				content: normContent, // Normalized content for FTS search
			});

			// Save embedding
			if (Array.isArray(chunk.embedding) && chunk.embedding.length > 0) {
				await embeddingRepo.upsert({
					id: chunkId,
					doc_id: docId,
					chunk_id: chunkId,
					chunk_index: chunkIndex,
					path: path,
					content_hash: '',
					ctime: now,
					mtime: now,
					embedding: chunk.embedding,
					embedding_model: embeddingModel ?? 'unknown',
					embedding_len: chunk.embedding.length,
				});
			}
		}
	}

	/**
	 * Save document metadata to database.
	 */
	private async saveDocMeta(doc: Document): Promise<void> {
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();

		await docMetaRepo.upsert({
			id: doc.id,
			path: doc.sourceFileInfo.path,
			type: doc.type,
			title: doc.metadata.title ?? doc.id,
			mtime: doc.sourceFileInfo.mtime ?? 0,
			size: doc.sourceFileInfo.size ?? null,
			ctime: doc.sourceFileInfo.ctime ?? null,
			content_hash: doc.contentHash ?? null,
			summary: doc.summary ?? null,
			tags: doc.metadata.tags ? JSON.stringify(doc.metadata.tags) : null,
		});
	}

	/**
	 * Update index state (document count and build timestamp).
	 */
	private async updateIndexState(): Promise<void> {
		const indexStateRepo = sqliteStoreManager.getIndexStateRepo();
		const now = Date.now();

		const indexedCount = await indexStateRepo.get(INDEX_STATE_KEYS.indexedDocs);
		const newCount = Number(indexedCount ?? 0) + 1;
		await indexStateRepo.set(INDEX_STATE_KEYS.indexedDocs, String(newCount));
		await indexStateRepo.set(INDEX_STATE_KEYS.builtAt, String(now));
	}

	/**
	 * Upsert graph relationships for a document.
	 * Uses data directly from Document object (references, tags, categories).
	 */
	private async upsertGraph(doc: Document): Promise<void> {
		const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
		const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();

		// Use normalized path as node ID (graph nodes use path, not doc.id, since we can't guarantee doc.id exists)
		const docNodeId = normalizePath(doc.sourceFileInfo.path);

		// Document node
		await graphNodeRepo.upsert({
			id: docNodeId,
			type: 'document',
			label: doc.metadata.title ?? docNodeId,
			attributes: JSON.stringify({ path: doc.sourceFileInfo.path }),
		});

		// Outgoing references (links from this document to other documents)
		for (const ref of doc.references.outgoing) {
			// Use normalized path as node ID (graph nodes use path, not docId, since we can't guarantee docId exists)
			const targetNodeId = normalizePath(ref.fullPath);

			// Ensure target document node exists (it will be created/updated when that document is indexed)
			await graphNodeRepo.upsert({
				id: targetNodeId,
				type: 'document',
				label: targetNodeId,
				attributes: JSON.stringify({ path: ref.fullPath }),
			});
			await graphEdgeRepo.upsert({
				id: GraphEdgeRepo.generateEdgeId(docNodeId, targetNodeId, 'references'),
				from_node_id: docNodeId,
				to_node_id: targetNodeId,
				type: 'references',
				weight: 1.0,
				attributes: JSON.stringify({}),
			});
		}

		// Tags
		for (const tag of doc.metadata.tags ?? []) {
			const tagId = `tag:${tag}`;
			await graphNodeRepo.upsert({
				id: tagId,
				type: 'tag',
				label: tag,
				attributes: JSON.stringify({ tagName: tag }),
			});
			await graphEdgeRepo.upsert({
				id: GraphEdgeRepo.generateEdgeId(docNodeId, tagId, 'tagged'),
				from_node_id: docNodeId,
				to_node_id: tagId,
				type: 'tagged',
				weight: 1.0,
				attributes: JSON.stringify({}),
			});
		}

		// Categories (if available)
		for (const category of doc.metadata.categories ?? []) {
			const categoryId = `category:${category}`;
			await graphNodeRepo.upsert({
				id: categoryId,
				type: 'category',
				label: category,
				attributes: JSON.stringify({ categoryName: category }),
			});
			await graphEdgeRepo.upsert({
				id: GraphEdgeRepo.generateEdgeId(docNodeId, categoryId, 'categorized'),
				from_node_id: docNodeId,
				to_node_id: categoryId,
				type: 'categorized',
				weight: 1.0,
				attributes: JSON.stringify({}),
			});
		}
	}

}

