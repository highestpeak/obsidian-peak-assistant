import type { IndexableDocument } from '@/service/search/_deprecated/worker/types-rpc';
import type { GetIndexStatusResponse, StorageType } from '@/service/search/_deprecated/worker/types-rpc';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { DocMetaRepo } from '@/core/storage/sqlite/repositories/DocMetaRepo';
import { GraphEdgeRepo } from '@/core/storage/sqlite/repositories/GraphEdgeRepo';
import { IndexStateRepo } from '@/core/storage/sqlite/repositories/IndexStateRepo';
import { normalizeTextForFts } from '../support/segmenter';
import { extractTags, extractWikiLinks } from '@/core/utils/markdown-utils';

const INDEX_STATE_KEYS = {
	builtAt: 'index_built_at',
	indexedDocs: 'indexed_docs',
} as const;

/**
 * Index service for document and graph indexing operations.
 */
export class IndexService {
	
	private static instance: IndexService | null = null;

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
	 * Index a batch of documents. Main thread reads vault content and writes SQLite.
	 * todo only index one document one time
	 *
	 * Notes:
	 * - Caller should feed already-chunked docs if chunking is enabled.
	 * - This method groups documents by path, indexes them, updates graph relationships,
	 *   and yields between path-groups to reduce UI stalls.
	 * - Graph relationships are updated for markdown documents.
	 */
	async indexDocument(
		doc: IndexableDocument,
		onAfterMutation?: (types: StorageType[]) => void,
	): Promise<void> {
		if (!doc) return;

		// Group by original path to keep doc-level metadata consistent.
		const byPath = new Map<string, IndexableDocument[]>();
		const arr = byPath.get(doc.path) ?? [];
		arr.push(doc);
		byPath.set(doc.path, arr);

		// Batch by path; each path becomes one small transaction.
		for (const [docPath, group] of byPath.entries()) {
			await this.indexDocumentGroup(group);

			// Update graph for markdown docs (best-effort).
			const firstType = (group[0]?.type ?? 'markdown') as string;
			if (firstType === 'markdown') {
				await this.upsertGraphForMarkdown({
					docId: docPath,
					content: group.map((g) => g.content ?? '').join('\n\n'),
				});
			}

			// Yield to UI thread.
			await new Promise((r) => window.setTimeout(r, 0));
		}

		onAfterMutation?.(['sqlite', 'graph']);
	}

	/**
	 * Index a single group of documents (chunks) for one document path.
	 * This method is called internally by indexDocuments after grouping.
	 */
	private async indexDocumentGroup(docs: IndexableDocument[]): Promise<void> {
		const now = Date.now();
		const kdb = sqliteStoreManager.getKysely();
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
		const docChunkRepo = sqliteStoreManager.getDocChunkRepo();
		const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
		const indexStateRepo = sqliteStoreManager.getIndexStateRepo();

		// Process all chunks in a single transaction
		await kdb.transaction().execute(async () => {
			// All docs in this group have the same path
			const first = docs[0]!;
			const docId = first.path; // Use path as doc_id for now (can be changed later)
			// Upsert doc_meta first to get doc_id
			await docMetaRepo.upsert({
				id: docId,
				path: first.path,
				type: first.type ?? 'markdown',
				title: first.title ?? first.path,
				mtime: first.mtime ?? 0,
			});

			// Clear existing rows for this doc (re-index semantics).
			await kdb.deleteFrom('doc_chunk').where('doc_id', '=', docId).execute();
			docChunkRepo.deleteFtsByDocId(docId);
			await kdb.deleteFrom('embedding').where('doc_id', '=', docId).execute();

			// Insert chunks + fts rows.
			for (const d of docs) {
				const chunkId = d.chunkId ?? `${d.path}:chunk:${Number(d.chunkIndex ?? 0)}`;
				const chunkIndex = Number(d.chunkIndex ?? 0);
				const title = d.title ?? d.path;
				const mtime = Number(d.mtime ?? 0);
				const raw = d.content ?? '';
				const norm = normalizeTextForFts(raw);

				await docChunkRepo.upsertChunk({
					chunk_id: chunkId,
					doc_id: docId,
					chunk_index: chunkIndex,
					title,
					mtime,
					content_raw: raw,
					content_fts_norm: norm,
				});

				docChunkRepo.insertFts({
					chunk_id: chunkId,
					doc_id: docId,
					path: d.path, // Keep path for display
					title,
					content: norm,
				});

				if (Array.isArray(d.embedding) && d.embedding.length > 0) {
					await embeddingRepo.upsert({
						id: chunkId,
						doc_id: docId,
						chunk_id: chunkId,
						chunk_index: chunkIndex,
						content_hash: '',
						ctime: now,
						mtime: now,
						embedding: d.embedding, // number[] will be converted to BLOB in EmbeddingRepo
						embedding_model: 'unknown',
						embedding_len: d.embedding.length,
					});
				}
			}

			// Index state bookkeeping (best-effort).
			const indexedCount = await indexStateRepo.get(INDEX_STATE_KEYS.indexedDocs);
			const newCount = Number(indexedCount ?? 0) + 1;
			await indexStateRepo.set(INDEX_STATE_KEYS.indexedDocs, String(newCount));
		});

		// Update built-at timestamp after doc group is indexed.
		await indexStateRepo.set(INDEX_STATE_KEYS.builtAt, String(now));
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
	 * Get all indexed document paths with their modification times.
	 */
	async getIndexedPaths(): Promise<Array<{ path: string; mtime: number }>> {
		const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
		const map = await docMetaRepo.getAllIndexedPaths();
		return Array.from(map.entries()).map(([path, mtime]) => ({ path, mtime }));
	}

	/**
	 * Index graph relationships for a markdown document.
	 */
	private async upsertGraphForMarkdown(params: { docId: string; content: string }): Promise<void> {
		const { docId, content } = params;
		const graphNodeRepo = sqliteStoreManager.getGraphNodeRepo();
		const graphEdgeRepo = sqliteStoreManager.getGraphEdgeRepo();

		// Document node
		await graphNodeRepo.upsert({
			id: docId,
			type: 'document',
			label: docId,
			attributes: JSON.stringify({ path: docId }),
		});

		// Wiki links
		const links = extractWikiLinks(content);
		for (const link of links) {
			const linkId = `link:${link}`;
			await graphNodeRepo.upsert({
				id: linkId,
				type: 'link',
				label: link,
				attributes: JSON.stringify({ linkName: link }),
			});
			await graphEdgeRepo.upsert({
				id: GraphEdgeRepo.generateEdgeId(docId, linkId, 'references'),
				from_node_id: docId,
				to_node_id: linkId,
				type: 'references',
				weight: 1.0,
				attributes: JSON.stringify({}),
			});
		}

		// Tags
		const tags = extractTags(content);
		for (const tag of tags) {
			const tagId = `tag:${tag}`;
			await graphNodeRepo.upsert({
				id: tagId,
				type: 'tag',
				label: tag,
				attributes: JSON.stringify({ tagName: tag }),
			});
			await graphEdgeRepo.upsert({
				id: GraphEdgeRepo.generateEdgeId(docId, tagId, 'tagged'),
				from_node_id: docId,
				to_node_id: tagId,
				type: 'tagged',
				weight: 1.0,
				attributes: JSON.stringify({}),
			});
		}
	}
}

