import type { Kysely } from 'kysely';
import type { Database as DbSchema, IndexedDocumentRecord } from '../ddl';
import { GraphNodeType, isIndexedNoteNodeType } from '@/core/po/graph.po';

/** Indexed vault notes stored on `mobius_node` as `document` or promoted `hub_doc`. */
const INDEXED_NOTE_ROW_TYPES = [GraphNodeType.Document, GraphNodeType.HubDoc] as const;

type DocAttrsJson = {
	docType?: string | null;
	frontmatter_json?: string | null;
	last_processed_at?: number | null;
	path?: string | null;
	/** Long-form summary stored only in JSON (short stays in `summary` column). */
	full_summary?: string | null;
	hub_tier?: string | null;
	summary_generated_at?: number | null;
	/** Optional outline for content-reader / evidence (markdown headings). */
	heading_skeleton?: string | null;
	/** Local Mermaid snippet derived from `semantic_related` neighbors (not SSOT). */
	semantic_overlay_mermaid?: string | null;
	semantic_edge_rule_version?: number | null;
	/** Content hash when LLM tags were last generated (deferred enrichment). */
	llm_tags_source_hash?: string | null;
	/** Content hash when LLM summaries were last generated. */
	llm_summary_source_hash?: string | null;
	llm_tags_generated_at?: number | null;
	llm_summary_generated_at?: number | null;
	llm_pending?: boolean;
	llm_pending_reason?: string | null;
	vector_source_hash?: string | null;
	vector_generated_at?: number | null;
	vector_pending?: boolean;
	vector_pending_reason?: string | null;
	functional_tags_status?: 'pending' | 'failed' | 'success-empty' | 'success';
};

/**
 * Indexed vault documents: `mobius_node` rows with `type` in `document` | `hub_doc`.
 * Exposes {@link IndexedDocumentRecord} to callers.
 */
export class IndexedDocumentRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	private parseDocAttrs(json: string): DocAttrsJson {
		try {
			return JSON.parse(json || '{}') as DocAttrsJson;
		} catch {
			return {};
		}
	}

	/** Merge indexed-document fields into `attributes_json` (ddl-backed document attrs). */
	private buildDocumentAttributesJson(params: {
		existingJson?: string;
		docType?: string | null;
		frontmatter_json?: string | null;
		last_processed_at?: number | null;
		path?: string | null;
		full_summary?: string | null;
		hub_tier?: string | null;
		summary_generated_at?: number | null;
		heading_skeleton?: string | null;
		llm_tags_source_hash?: string | null;
		llm_summary_source_hash?: string | null;
		llm_tags_generated_at?: number | null;
		llm_summary_generated_at?: number | null;
		llm_pending?: boolean;
		llm_pending_reason?: string | null;
		vector_source_hash?: string | null;
		vector_generated_at?: number | null;
		vector_pending?: boolean;
		vector_pending_reason?: string | null;
		functional_tags_status?: 'pending' | 'failed' | 'success-empty' | 'success';
	}): string {
		const prev = this.parseDocAttrs(params.existingJson ?? '{}');
		const next: DocAttrsJson = {
			...prev,
			docType: params.docType !== undefined ? params.docType : prev.docType,
			frontmatter_json:
				params.frontmatter_json !== undefined ? params.frontmatter_json : prev.frontmatter_json,
			last_processed_at:
				params.last_processed_at !== undefined ? params.last_processed_at : prev.last_processed_at,
			path: params.path !== undefined ? params.path : prev.path,
			full_summary: params.full_summary !== undefined ? params.full_summary : prev.full_summary,
			hub_tier: params.hub_tier !== undefined ? params.hub_tier : prev.hub_tier,
			summary_generated_at:
				params.summary_generated_at !== undefined ? params.summary_generated_at : prev.summary_generated_at,
			heading_skeleton:
				params.heading_skeleton !== undefined ? params.heading_skeleton : prev.heading_skeleton,
			llm_tags_source_hash:
				params.llm_tags_source_hash !== undefined ? params.llm_tags_source_hash : prev.llm_tags_source_hash,
			llm_summary_source_hash:
				params.llm_summary_source_hash !== undefined
					? params.llm_summary_source_hash
					: prev.llm_summary_source_hash,
			llm_tags_generated_at:
				params.llm_tags_generated_at !== undefined
					? params.llm_tags_generated_at
					: prev.llm_tags_generated_at,
			llm_summary_generated_at:
				params.llm_summary_generated_at !== undefined
					? params.llm_summary_generated_at
					: prev.llm_summary_generated_at,
			llm_pending: params.llm_pending !== undefined ? params.llm_pending : prev.llm_pending,
			llm_pending_reason:
				params.llm_pending_reason !== undefined ? params.llm_pending_reason : prev.llm_pending_reason,
			vector_source_hash:
				params.vector_source_hash !== undefined ? params.vector_source_hash : prev.vector_source_hash,
			vector_generated_at:
				params.vector_generated_at !== undefined ? params.vector_generated_at : prev.vector_generated_at,
			vector_pending: params.vector_pending !== undefined ? params.vector_pending : prev.vector_pending,
			vector_pending_reason:
				params.vector_pending_reason !== undefined
					? params.vector_pending_reason
					: prev.vector_pending_reason,
			functional_tags_status:
				params.functional_tags_status !== undefined
					? params.functional_tags_status
					: prev.functional_tags_status,
		};
		return JSON.stringify(next);
	}

	/**
	 * Merges index-time extras (tiered summaries) into the document row without dropping other attrs.
	 */
	async mergeIndexedSummaryFields(
		docId: string,
		patch: {
			summary?: string | null;
			full_summary?: string | null;
			hub_tier?: string | null;
			summary_generated_at?: number | null;
			heading_skeleton?: string | null;
		},
	): Promise<void> {
		const row = await this.db
			.selectFrom('mobius_node')
			.selectAll()
			.where('node_id', '=', docId)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.executeTakeFirst();
		if (!row) return;

		const attrs = this.buildDocumentAttributesJson({
			existingJson: row.attributes_json,
			full_summary: patch.full_summary,
			hub_tier: patch.hub_tier,
			summary_generated_at: patch.summary_generated_at,
			heading_skeleton: patch.heading_skeleton,
		});

		await this.db
			.updateTable('mobius_node')
			.set({
				summary: patch.summary !== undefined ? patch.summary : row.summary,
				attributes_json: attrs,
				updated_at: Date.now(),
			})
			.where('node_id', '=', docId)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.execute();
	}

	/** Build {@link IndexedDocumentRecord} from a document `mobius_node` row. */
	private rowToIndexedDocument(row: DbSchema['mobius_node']): IndexedDocumentRecord | null {
		if (!isIndexedNoteNodeType(row.type) || !row.path) return null;
		const extra = this.parseDocAttrs(row.attributes_json);
		return {
			id: row.node_id,
			path: row.path,
			type: extra.docType ?? null,
			title: row.title,
			size: row.size,
			mtime: row.mtime,
			ctime: row.ctime,
			infer_created_at: row.infer_created_at,
			content_hash: row.content_hash,
			summary: row.summary,
			full_summary: extra.full_summary ?? null,
			tags: row.tags_json,
			last_processed_at: extra.last_processed_at ?? null,
			frontmatter_json: extra.frontmatter_json ?? null,
		};
	}

	private docNodeQuery() {
		return this.db.selectFrom('mobius_node').where('type', 'in', [...INDEXED_NOTE_ROW_TYPES]);
	}

	async existsByPath(path: string): Promise<boolean> {
		const row = await this.docNodeQuery().select('node_id').where('path', '=', path).executeTakeFirst();
		return row !== undefined;
	}

	async insert(doc: IndexedDocumentRecord & { mobiusGraphNodeType?: GraphNodeType }): Promise<void> {
		const now = Date.now();
		const rowUpdatedAt = doc.row_updated_at ?? now;
		const attrs = this.buildDocumentAttributesJson({
			docType: doc.type,
			frontmatter_json: doc.frontmatter_json ?? null,
			last_processed_at: doc.last_processed_at,
			path: doc.path,
			full_summary: doc.full_summary ?? null,
		});
		const graphType =
			doc.mobiusGraphNodeType === GraphNodeType.HubDoc ? GraphNodeType.HubDoc : GraphNodeType.Document;
		await this.db
			.insertInto('mobius_node')
			.values({
				node_id: doc.id,
				type: graphType,
				label: doc.title ?? doc.path,
				created_at: now,
				infer_created_at: doc.infer_created_at ?? null,
				updated_at: rowUpdatedAt,
				last_open_ts: doc.last_open_ts ?? null,
				open_count: null,
				path: doc.path,
				title: doc.title,
				size: doc.size,
				mtime: doc.mtime,
				ctime: doc.ctime,
				content_hash: doc.content_hash,
				summary: doc.summary,
				tags_json: doc.tags,
				word_count: doc.word_count ?? null,
				char_count: doc.char_count ?? null,
				language: null,
				richness_score: null,
				doc_incoming_cnt: null,
				doc_outgoing_cnt: null,
				other_incoming_cnt: null,
				other_outgoing_cnt: null,
				tag_doc_count: null,
				pagerank: null,
				pagerank_updated_at: null,
				pagerank_version: null,
				semantic_pagerank: null,
				semantic_pagerank_updated_at: null,
				semantic_pagerank_version: null,
				folder_cohesion_score: null,
				attributes_json: attrs,
			})
			.execute();
	}

	async updateById(
		id: string,
		updates: Partial<Omit<IndexedDocumentRecord, 'id' | 'path' | 'created_at'>>,
	): Promise<void> {
		const row = await this.db
			.selectFrom('mobius_node')
			.selectAll()
			.where('node_id', '=', id)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.executeTakeFirst();
		if (!row) return;

		const nextAttrs = this.buildDocumentAttributesJson({
			existingJson: row.attributes_json,
			docType: updates.type,
			frontmatter_json: updates.frontmatter_json,
			last_processed_at: updates.last_processed_at,
			full_summary: updates.full_summary,
		});

		const nextUpdatedAt =
			updates.row_updated_at !== undefined
				? (updates.row_updated_at ?? Date.now())
				: Date.now();

		await this.db
			.updateTable('mobius_node')
			.set({
				title: updates.title !== undefined ? updates.title : row.title,
				size: updates.size !== undefined ? updates.size : row.size,
				mtime: updates.mtime !== undefined ? updates.mtime : row.mtime,
				ctime: updates.ctime !== undefined ? updates.ctime : row.ctime,
				content_hash: updates.content_hash !== undefined ? updates.content_hash : row.content_hash,
				summary: updates.summary !== undefined ? updates.summary : row.summary,
				tags_json: updates.tags !== undefined ? updates.tags : row.tags_json,
				label: updates.title !== undefined ? (updates.title ?? row.path ?? row.label) : row.label,
				attributes_json: nextAttrs,
				updated_at: nextUpdatedAt,
				word_count: updates.word_count !== undefined ? updates.word_count : row.word_count,
				char_count: updates.char_count !== undefined ? updates.char_count : row.char_count,
				last_open_ts: updates.last_open_ts !== undefined ? updates.last_open_ts : row.last_open_ts,
				infer_created_at:
					updates.infer_created_at !== undefined ? updates.infer_created_at : row.infer_created_at,
			})
			.where('node_id', '=', id)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.execute();
	}

	async updatePathById(id: string, newPath: string): Promise<void> {
		const row = await this.db
			.selectFrom('mobius_node')
			.selectAll()
			.where('node_id', '=', id)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.executeTakeFirst();
		if (!row) return;
		const attrs = this.buildDocumentAttributesJson({
			existingJson: row.attributes_json,
			path: newPath,
		});
		const title = row.title;
		await this.db
			.updateTable('mobius_node')
			.set({
				path: newPath,
				attributes_json: attrs,
				label: title ?? newPath,
				updated_at: Date.now(),
			})
			.where('node_id', '=', id)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.execute();
	}

	async updateByPath(
		path: string,
		updates: Partial<Omit<IndexedDocumentRecord, 'id' | 'path' | 'created_at'>>,
	): Promise<void> {
		const row = await this.docNodeQuery().select('node_id').where('path', '=', path).executeTakeFirst();
		if (!row) return;
		await this.updateById(row.node_id, updates);
	}

	async upsert(doc: Partial<IndexedDocumentRecord> & { path: string; mobiusGraphNodeType?: GraphNodeType }): Promise<void> {
		if (!doc.id) {
			throw new Error(`doc.id is required for IndexedDocumentRepo.upsert. Path: ${doc.path}`);
		}

		const exists = await this.existsByPath(doc.path);

		if (exists) {
			await this.updateById(doc.id, {
				type: doc.type ?? null,
				title: doc.title ?? null,
				size: doc.size ?? null,
				mtime: doc.mtime ?? null,
				ctime: doc.ctime ?? null,
				content_hash: doc.content_hash ?? null,
				// Preserve LLM/indexed summary when the loader did not produce one (e.g. genCacheContent index path).
				summary: doc.summary !== undefined && doc.summary !== null ? doc.summary : undefined,
				full_summary: doc.full_summary !== undefined ? doc.full_summary : undefined,
				tags: doc.tags !== undefined ? doc.tags : undefined,
				last_processed_at: doc.last_processed_at ?? null,
				frontmatter_json: doc.frontmatter_json ?? null,
				word_count: doc.word_count,
				char_count: doc.char_count,
				last_open_ts: doc.last_open_ts,
				row_updated_at: doc.row_updated_at,
				...(doc.infer_created_at !== undefined ? { infer_created_at: doc.infer_created_at } : {}),
			});
			const patch: Record<string, unknown> = {
				path: doc.path,
				updated_at: doc.row_updated_at ?? Date.now(),
			};
			if (doc.mobiusGraphNodeType === GraphNodeType.HubDoc || doc.mobiusGraphNodeType === GraphNodeType.Document) {
				patch.type = doc.mobiusGraphNodeType;
			}
			await this.db
				.updateTable('mobius_node')
				.set(patch as any)
				.where('node_id', '=', doc.id)
				.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
				.execute();
		} else {
			await this.insert({
				id: doc.id,
				path: doc.path,
				type: doc.type ?? null,
				title: doc.title ?? null,
				size: doc.size ?? null,
				mtime: doc.mtime ?? null,
				ctime: doc.ctime ?? null,
				content_hash: doc.content_hash ?? null,
				summary: doc.summary ?? null,
				full_summary: doc.full_summary ?? null,
				tags: doc.tags ?? null,
				last_processed_at: doc.last_processed_at ?? null,
				frontmatter_json: doc.frontmatter_json ?? null,
				word_count: doc.word_count,
				char_count: doc.char_count,
				last_open_ts: doc.last_open_ts,
				row_updated_at: doc.row_updated_at,
				infer_created_at: doc.infer_created_at,
				mobiusGraphNodeType: doc.mobiusGraphNodeType,
			});
		}
	}

	async deleteByPaths(paths: string[]): Promise<void> {
		if (!paths.length) return;
		await this.db
			.deleteFrom('mobius_node')
			.where('path', 'in', paths)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.execute();
	}

	async deleteAll(): Promise<void> {
		await this.db.deleteFrom('mobius_node').where('type', 'in', [...INDEXED_NOTE_ROW_TYPES]).execute();
	}

	async getAllIndexedPaths(): Promise<Map<string, number>> {
		const rows = await this.docNodeQuery().select(['path', 'mtime']).execute();
		const result = new Map<string, number>();
		for (const row of rows) {
			if (!row.path) continue;
			result.set(row.path, row.mtime ?? 0);
		}
		return result;
	}

	async getIndexedPathsBatch(offset: number, limit: number): Promise<Array<{ path: string; mtime: number }>> {
		const rows = await this.docNodeQuery()
			.select(['path', 'mtime'])
			.offset(offset)
			.limit(limit)
			.execute();
		return rows
			.filter((row): row is { path: string; mtime: number | null } => row.path != null)
			.map((row) => ({
				path: row.path,
				mtime: row.mtime ?? 0,
			}));
	}

	async batchCheckIndexed(paths: string[]): Promise<Map<string, { mtime: number; content_hash: string | null }>> {
		if (!paths.length) return new Map();
		const rows = await this.docNodeQuery()
			.select(['path', 'mtime', 'content_hash'])
			.where('path', 'in', paths)
			.execute();
		const result = new Map<string, { mtime: number; content_hash: string | null }>();
		for (const row of rows) {
			if (!row.path) continue;
			result.set(row.path, {
				mtime: row.mtime ?? 0,
				content_hash: row.content_hash ?? null,
			});
		}
		return result;
	}

	async getByPath(path: string): Promise<IndexedDocumentRecord | null> {
		const row = await this.docNodeQuery().selectAll().where('path', '=', path).executeTakeFirst();
		return row ? this.rowToIndexedDocument(row) : null;
	}

	async getByPaths(paths: string[]): Promise<Map<string, IndexedDocumentRecord>> {
		if (!paths.length) return new Map();
		const rows = await this.docNodeQuery().selectAll().where('path', 'in', paths).execute();
		const result = new Map<string, IndexedDocumentRecord>();
		for (const row of rows) {
			const dm = this.rowToIndexedDocument(row);
			if (dm) result.set(dm.path, dm);
		}
		return result;
	}

	async getIdsByPaths(paths: string[]): Promise<{ id: string; path: string }[]> {
		if (!paths.length) return [];
		const rows = await this.docNodeQuery()
			.select(['node_id', 'path'])
			.where('path', 'in', paths)
			.execute();
		return rows
			.filter((row): row is { node_id: string; path: string } => row.path != null)
			.map((row) => ({ id: row.node_id, path: row.path }));
	}

	async getIdsByFolderPath(folderPath: string): Promise<{ id: string; path: string }[]> {
		if (folderPath === '') return [];
		const rows = await this.docNodeQuery()
			.select(['node_id', 'path'])
			.where((eb) =>
				eb.or([eb('path', 'like', `${folderPath}/%`), eb('path', '=', folderPath)]),
			)
			.execute();
		return rows
			.filter((row): row is { node_id: string; path: string } => row.path != null)
			.map((row) => ({ id: row.node_id, path: row.path }));
	}

	async countByFolderPath(folderPath: string): Promise<number> {
		if (folderPath === '') return 0;
		const row = await this.docNodeQuery()
			.select(({ fn }) => fn.count<number>('node_id').as('cnt'))
			.where((eb) =>
				eb.or([eb('path', 'like', `${folderPath}/%`), eb('path', '=', folderPath)]),
			)
			.executeTakeFirst();
		return Number(row?.cnt ?? 0);
	}

	async getIdsByPathPrefixes(prefixes: string[]): Promise<{ id: string; path: string }[]> {
		if (!prefixes.length) return [];
		const rows = await this.docNodeQuery()
			.select(['node_id', 'path'])
			.where((eb) =>
				eb.or(
					prefixes.map((p) => {
						const folderLike = p.endsWith('/') ? p : p + '/';
						const exact = folderLike.slice(0, -1);
						return eb.or([eb('path', 'like', `${folderLike}%`), eb('path', '=', exact)]);
					}),
				),
			)
			.execute();
		return rows
			.filter((row): row is { node_id: string; path: string } => row.path != null)
			.map((row) => ({ id: row.node_id, path: row.path }));
	}

	async getByIds(ids: string[]): Promise<IndexedDocumentRecord[]> {
		if (!ids.length) return [];
		const rows = await this.db
			.selectFrom('mobius_node')
			.selectAll()
			.where('node_id', 'in', ids)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.execute();
		return rows.map((r) => this.rowToIndexedDocument(r)).filter((m): m is IndexedDocumentRecord => m != null);
	}

	async getByContentHash(contentHash: string): Promise<IndexedDocumentRecord[]> {
		const rows = await this.docNodeQuery().selectAll().where('content_hash', '=', contentHash).execute();
		return rows.map((r) => this.rowToIndexedDocument(r)).filter((m): m is IndexedDocumentRecord => m != null);
	}

	async batchGetByContentHashes(contentHashes: string[]): Promise<Set<string>> {
		if (!contentHashes.length) return new Set();
		const rows = await this.docNodeQuery()
			.select(['content_hash'])
			.where('content_hash', 'in', contentHashes)
			.where('content_hash', 'is not', null)
			.execute();
		return new Set(rows.map((row) => row.content_hash!).filter(Boolean));
	}

	/**
	 * Merge LLM deferred-enrichment fields into `attributes_json` without touching other columns.
	 */
	async mergeDocumentLlmState(
		docId: string,
		patch: {
			llm_tags_source_hash?: string | null;
			llm_summary_source_hash?: string | null;
			llm_tags_generated_at?: number | null;
			llm_summary_generated_at?: number | null;
			llm_pending?: boolean;
			llm_pending_reason?: string | null;
			functional_tags_status?: 'pending' | 'failed' | 'success-empty' | 'success';
		},
	): Promise<void> {
		const row = await this.db
			.selectFrom('mobius_node')
			.selectAll()
			.where('node_id', '=', docId)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.executeTakeFirst();
		if (!row) return;

		const attrs = this.buildDocumentAttributesJson({
			existingJson: row.attributes_json,
			llm_tags_source_hash: patch.llm_tags_source_hash,
			llm_summary_source_hash: patch.llm_summary_source_hash,
			llm_tags_generated_at: patch.llm_tags_generated_at,
			llm_summary_generated_at: patch.llm_summary_generated_at,
			llm_pending: patch.llm_pending,
			llm_pending_reason: patch.llm_pending_reason,
			functional_tags_status: patch.functional_tags_status,
		});

		await this.db
			.updateTable('mobius_node')
			.set({
				attributes_json: attrs,
				updated_at: Date.now(),
			})
			.where('node_id', '=', docId)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.execute();
	}

	/**
	 * Merge vector deferred-enrichment fields into `attributes_json` without touching other columns.
	 */
	async mergeDocumentVectorState(
		docId: string,
		patch: {
			vector_source_hash?: string | null;
			vector_generated_at?: number | null;
			vector_pending?: boolean;
			vector_pending_reason?: string | null;
		},
	): Promise<void> {
		const row = await this.db
			.selectFrom('mobius_node')
			.selectAll()
			.where('node_id', '=', docId)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.executeTakeFirst();
		if (!row) return;

		const attrs = this.buildDocumentAttributesJson({
			existingJson: row.attributes_json,
			vector_source_hash: patch.vector_source_hash,
			vector_generated_at: patch.vector_generated_at,
			vector_pending: patch.vector_pending,
			vector_pending_reason: patch.vector_pending_reason,
		});

		await this.db
			.updateTable('mobius_node')
			.set({
				attributes_json: attrs,
				updated_at: Date.now(),
			})
			.where('node_id', '=', docId)
			.where('type', 'in', [...INDEXED_NOTE_ROW_TYPES])
			.execute();
	}

	/** Paths whose `attributes_json` marks `llm_pending=true`. */
	async listPathsWithPendingLlm(): Promise<string[]> {
		const rows = await this.docNodeQuery()
			.select(['path', 'attributes_json'])
			.execute();
		const out: string[] = [];
		for (const r of rows) {
			if (!r.path || !r.attributes_json) continue;
			const attrs = this.parseDocAttrs(r.attributes_json);
			if (attrs.llm_pending === true) out.push(r.path);
		}
		return out;
	}

	/** Paths whose `attributes_json` marks `vector_pending=true`. */
	async listPathsWithPendingVector(): Promise<string[]> {
		const rows = await this.docNodeQuery()
			.select(['path', 'attributes_json'])
			.execute();
		const out: string[] = [];
		for (const r of rows) {
			if (!r.path || !r.attributes_json) continue;
			const attrs = this.parseDocAttrs(r.attributes_json);
			if (attrs.vector_pending === true) out.push(r.path);
		}
		return out;
	}
}
