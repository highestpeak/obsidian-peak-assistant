import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import {
	DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS,
	FOLDER_HUB_COHESION_SIZE_REF_DOC_COUNT,
	FOLDER_HUB_GRAPH_WEIGHT_COHESION,
	FOLDER_HUB_GRAPH_WEIGHT_ORGANIZATIONAL,
	FOLDER_HUB_GRAPH_WEIGHT_PHYSICAL,
	FOLDER_HUB_GRAPH_WEIGHT_SEMANTIC,
	FOLDER_HUB_MIN_DOCS,
} from '@/core/constant';
import {
	GraphEdgeType,
	GraphNodeType,
	GRAPH_DOCUMENT_LIKE_NODE_TYPES,
	GRAPH_INDEXED_NOTE_NODE_TYPES,
	GRAPH_TAG_NODE_TYPES,
	isIndexedNoteNodeType,
} from '@/core/po/graph.po';
import { normalizeVaultPath } from '@/core/utils/vault-path-utils';
import {
	type FolderIntuition,
	parseFolderIntuitionFromMobiusFolderRow,
} from './folderIntuitionMobius';

export type MobiusNodeRow = DbSchema['mobius_node'];

/** Escapes `%`, `_`, and `\` for SQLite `LIKE ... ESCAPE '\\'`. */

/** Graph node DTO shape; rows live in `mobius_node`. */
export type GraphNode = DbSchema['graph_nodes'];

/** Document statistics DTO; columns stored on `mobius_node` for `type = document`. */
export type DocStatistics = DbSchema['doc_statistics'];

/** Signals for search rerank (degrees + optional PageRank version from `mobius_node` columns). */
export type DocRankingSignal = {
	lastOpenTs: number;
	openCount: number;
	docIncomingCnt: number;
	pagerankVersion?: number;
	hubTier?: 'hub' | 'secondary' | 'none';
	/** `mobius_node.type` for overview vs detail rerank tweaks. */
	mobiusNodeType?: string;
};

/**
 * Document `mobius_node` projection for hub discovery scoring (includes `word_count` weak signal).
 */
export type MobiusNodeHubDiscoveryRow = Pick<
	MobiusNodeRow,
	| 'node_id'
	| 'path'
	| 'label'
	| 'type'
	| 'doc_incoming_cnt'
	| 'doc_outgoing_cnt'
	| 'pagerank'
	| 'semantic_pagerank'
	| 'word_count'
>;

/**
 * Same as {@link MobiusNodeHubDiscoveryRow} plus hub candidate scores computed in SQL (must match `HubCandidateDiscoveryService.scoreDocumentRow`).
 */
export type MobiusNodeHubDiscoveryScoredRow = MobiusNodeHubDiscoveryRow & {
	hub_graph_score: number;
	hub_physical_authority_score: number;
	hub_organizational_score: number;
	hub_semantic_centrality_score: number;
};

/**
 * Folder hub candidate row with scores matching in-app folder hub scoring (materialized columns on `type=folder`).
 */
export type MobiusNodeFolderHubDiscoveryRow = {
	node_id: string;
	path: string;
	label: string;
	tag_doc_count: number | null;
	pagerank: number | null;
	semantic_pagerank: number | null;
	/** Mean intra-folder cohesion; null if not computed yet. */
	folder_cohesion_score: number | null;
	doc_incoming_cnt: number | null;
	doc_outgoing_cnt: number | null;
	other_incoming_cnt: number | null;
	other_outgoing_cnt: number | null;
	hub_graph_score: number;
	hub_physical_authority_score: number;
	hub_organizational_score: number;
	hub_semantic_centrality_score: number;
	/** `folder_cohesion_score` × size reliability (see {@link FOLDER_HUB_COHESION_SIZE_REF_DOC_COUNT}). */
	hub_cohesion_effective_score: number;
};

/** Id + vault path for coverage / member listing helpers. */
export type MobiusNodeIdPathRow = { node_id: string; path: string | null };

/** Aggregated doc vs other edge counts for batch degree refresh. */
type DocDegreeBucket = { doc: number; other: number };

/**
 * `mobius_node` access: full-row CRUD, graph-node DTO, document statistics, and aggregate refresh.
 */
export class MobiusNodeRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * One **SQL page** of `node_id` values (not a full-table load).
	 * Query shape: `WHERE type IN (…) AND node_id > cursor ORDER BY node_id LIMIT pageSize`.
	 * Callers implement pagination by passing `afterNodeId = last id from the previous page` until this returns `[]`.
	 */
	async listNodeIdsByTypesKeyset(types: readonly string[], afterNodeId: string | null, limit: number): Promise<string[]> {
		const typeList = [...types];
		let q = this.db
			.selectFrom('mobius_node')
			.select('node_id')
			.where('type', 'in', typeList)
			.orderBy('node_id')
			.limit(limit);
		if (afterNodeId != null && afterNodeId !== '') {
			q = q.where('node_id', '>', afterNodeId);
		}
		const rows = await q.execute();
		return rows.map((r) => r.node_id);
	}

	/**
	 * Iterates all `mobius_node` rows matching `types` using keyset pagination (`listNodeIdsByTypesKeyset` in a loop).
	 * @param betweenPages Optional hook after each page (e.g. yield to the event loop).
	 */
	async forEachNodeIdsByTypesKeyset(
		types: readonly string[],
		pageSize: number,
		onPage: (ids: string[], pageIndex: number) => Promise<void>,
		betweenPages?: () => Promise<void>,
	): Promise<void> {
		let afterNodeId: string | null = null;
		let pageIndex = 0;
		for (;;) {
			const ids = await this.listNodeIdsByTypesKeyset(types, afterNodeId, pageSize);
			if (!ids.length) break;
			await onPage(ids, pageIndex++);
			afterNodeId = ids[ids.length - 1]!;
			await betweenPages?.();
		}
	}

	/** All `document` / `hub_doc` node ids (vault PageRank vertex set). */
	async listAllDocLikeNodeIds(): Promise<string[]> {
		const rows = await this.db
			.selectFrom('mobius_node')
			.select('node_id')
			.where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
			.execute();
		return rows.map((r) => r.node_id);
	}

	/**
	 * Vertex ids for semantic PageRank (same doc-like set as reference PageRank).
	 */
	async listDocLikeSemanticPageRankVertices(): Promise<string[]> {
		return this.listAllDocLikeNodeIds();
	}

	/**
	 * Document-like rows with cached `doc_outgoing_cnt` (wiki references to doc-like targets).
	 * Call after degree refresh so counts match the `references` subgraph used by streaming PageRank.
	 */
	async listDocLikePageRankVertices(): Promise<
		Array<{ node_id: string; doc_outgoing_cnt: number }>
	> {
		const rows = await this.db
			.selectFrom('mobius_node')
			.select(['node_id', 'doc_outgoing_cnt'])
			.where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
			.execute();
		return rows.map((r) => ({
			node_id: r.node_id,
			doc_outgoing_cnt: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0))),
		}));
	}

	/**
	 * Merges keys into `attributes_json` for an indexed note row without dropping existing fields.
	 */
	async mergeJsonAttributesForIndexedNoteNode(
		nodeId: string,
		merge: Record<string, unknown>,
		now: number = Date.now(),
	): Promise<void> {
		const row = await this.db
			.selectFrom('mobius_node')
			.select('attributes_json')
			.where('node_id', '=', nodeId)
			.where('type', 'in', [...GRAPH_INDEXED_NOTE_NODE_TYPES])
			.executeTakeFirst();
		if (!row) return;
		let prev: Record<string, unknown> = {};
		try {
			prev = JSON.parse(row.attributes_json || '{}') as Record<string, unknown>;
		} catch {
			prev = {};
		}
		const next = { ...prev, ...merge };
		await this.db
			.updateTable('mobius_node')
			.set({
				attributes_json: JSON.stringify(next),
				updated_at: now,
			})
			.where('node_id', '=', nodeId)
			.where('type', 'in', [...GRAPH_INDEXED_NOTE_NODE_TYPES])
			.execute();
	}

	/**
	 * Clears cached semantic Mermaid overlay (and bumps rule version) on all document-like nodes
	 * before a full vector-based `semantic_related` rebuild.
	 */
	async clearSemanticOverlayFieldsForIndexedNotes(now: number, ruleVersion: number): Promise<void> {
		const ids = await this.listAllDocLikeNodeIds();
		let i = 0;
		for (const id of ids) {
			await this.mergeJsonAttributesForIndexedNoteNode(
				id,
				{
					semantic_overlay_mermaid: null,
					semantic_edge_rule_version: ruleVersion,
				},
				now,
			);
			i++;
			if (i % 200 === 0) {
				await new Promise((r) => setTimeout(r, 0));
			}
		}
	}

	/** Logical {@link DbSchema.graph_nodes} row from a `mobius_node` record. */
	private graphNodeFromMobius(row: MobiusNodeRow): GraphNode {
		return {
			id: row.node_id,
			type: row.type,
			label: row.label,
			attributes: row.attributes_json,
			created_at: row.created_at,
			updated_at: row.updated_at,
		};
	}

	/** Logical {@link DbSchema.doc_statistics} from a document `mobius_node` row. */
	private docStatisticsFromMobius(row: MobiusNodeRow): DocStatistics | null {
		if (!isIndexedNoteNodeType(row.type)) return null;
		return {
			doc_id: row.node_id,
			word_count: row.word_count,
			char_count: row.char_count,
			language: row.language,
			richness_score: row.richness_score,
			last_open_ts: row.last_open_ts,
			open_count: row.open_count,
			updated_at: row.updated_at,
		};
	}

	/** Full `mobius_node` insert row from graph-upsert input (tag, category, placeholder doc, …). */
	private mobiusRowFromGraphUpsert(node: {
		id: string;
		type: string;
		label: string;
		attributes: string;
		created_at: number;
		updated_at: number;
	}): MobiusNodeRow {
		let path: string | null = null;
		try {
			const a = JSON.parse(node.attributes) as { path?: string };
			if (typeof a?.path === 'string') path = a.path;
		} catch {
			path = null;
		}
		return {
			node_id: node.id,
			type: node.type,
			label: node.label,
			created_at: node.created_at,
			infer_created_at: null,
			updated_at: node.updated_at,
			last_open_ts: null,
			open_count: null,
			path:
				isIndexedNoteNodeType(node.type) ||
				node.type === GraphNodeType.Folder ||
				node.type === GraphNodeType.Resource
					? path
					: null,
			title: null,
			size: null,
			mtime: null,
			ctime: null,
			content_hash: null,
			summary: null,
			tags_json: null,
			word_count: null,
			char_count: null,
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
			hub_stale_since: null,
			semantic_edges_version: 0,
			attributes_json: node.attributes || '{}',
		};
	}

	async existsByNodeId(nodeId: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('mobius_node')
			.select('node_id')
			.where('node_id', '=', nodeId)
			.executeTakeFirst();
		return row !== undefined;
	}

	/** Alias for {@link existsByNodeId} (graph-node id). */
	async existsById(id: string): Promise<boolean> {
		return this.existsByNodeId(id);
	}

	async getByNodeId(nodeId: string): Promise<MobiusNodeRow | null> {
		const row = await this.db
			.selectFrom('mobius_node')
			.selectAll()
			.where('node_id', '=', nodeId)
			.executeTakeFirst();
		return row ?? null;
	}

	/** Document row by vault path (unique when set). */
	/** Prefer indexed document row when multiple nodes could share display paths. */
	async getByPath(path: string): Promise<MobiusNodeRow | null> {
		const row = await this.db
			.selectFrom('mobius_node')
			.selectAll()
			.where('path', '=', path)
			.where('type', 'in', [...GRAPH_INDEXED_NOTE_NODE_TYPES])
			.executeTakeFirst();
		return row ?? null;
	}

	// --- Graph node DTO (`graph_nodes` shape on `mobius_node`) ---

	async insert(graphNode: {
		id: string;
		type: string;
		label: string;
		attributes: string;
		created_at: number;
		updated_at: number;
	}): Promise<void> {
		const row = this.mobiusRowFromGraphUpsert(graphNode);
		await this.db.insertInto('mobius_node').values(row).execute();
	}

	async updateById(
		id: string,
		updates: Partial<Pick<DbSchema['graph_nodes'], 'type' | 'label' | 'attributes' | 'updated_at'>>,
	): Promise<void> {
		const patch: Record<string, unknown> = {};
		if (updates.type !== undefined) patch.type = updates.type;
		if (updates.label !== undefined) patch.label = updates.label;
		if (updates.attributes !== undefined) patch.attributes_json = updates.attributes;
		if (updates.updated_at !== undefined) patch.updated_at = updates.updated_at;
		if (!Object.keys(patch).length) return;
		await this.db.updateTable('mobius_node').set(patch as any).where('node_id', '=', id).execute();
	}

	/**
	 * Upsert a graph node; document rows merge `attributes_json` so indexed-document columns are preserved.
	 */
	async upsert(graphNode: {
		id: string;
		type: string;
		label: string;
		attributes: string;
		created_at?: number;
		updated_at?: number;
	}): Promise<void> {
		const now = Date.now();
		const exists = await this.existsById(graphNode.id);

		if (exists && isIndexedNoteNodeType(graphNode.type)) {
			const existing = await this.db
				.selectFrom('mobius_node')
				.selectAll()
				.where('node_id', '=', graphNode.id)
				.executeTakeFirst();
			if (existing) {
				let prevAttrs: Record<string, unknown> = {};
				try {
					prevAttrs = JSON.parse(existing.attributes_json || '{}') as Record<string, unknown>;
				} catch {
					prevAttrs = {};
				}
				let incomingAttrs: Record<string, unknown> = {};
				try {
					incomingAttrs = JSON.parse(graphNode.attributes) as Record<string, unknown>;
				} catch {
					incomingAttrs = { raw: graphNode.attributes };
				}
				const merged = { ...prevAttrs, ...incomingAttrs };
				let path = existing.path;
				if (typeof incomingAttrs.path === 'string') path = incomingAttrs.path;
				await this.db
					.updateTable('mobius_node')
					.set({
						label: graphNode.label,
						attributes_json: JSON.stringify(merged),
						path: path ?? existing.path,
						updated_at: graphNode.updated_at ?? now,
					})
					.where('node_id', '=', graphNode.id)
					.execute();
				return;
			}
		}

		if (exists) {
			if (graphNode.type === GraphNodeType.Folder) {
				let folderPath: string | null = null;
				try {
					const a = JSON.parse(graphNode.attributes) as { path?: string };
					if (typeof a?.path === 'string') folderPath = a.path;
				} catch {
					folderPath = null;
				}
				await this.db
					.updateTable('mobius_node')
					.set({
						type: graphNode.type,
						label: graphNode.label,
						attributes_json: graphNode.attributes,
						path: folderPath,
						updated_at: graphNode.updated_at ?? now,
					})
					.where('node_id', '=', graphNode.id)
					.execute();
				return;
			}
			if (graphNode.type === GraphNodeType.Resource) {
				let resourcePath: string | null = null;
				try {
					const a = JSON.parse(graphNode.attributes) as { path?: string };
					if (typeof a?.path === 'string') resourcePath = a.path;
				} catch {
					resourcePath = null;
				}
				await this.db
					.updateTable('mobius_node')
					.set({
						type: graphNode.type,
						label: graphNode.label,
						attributes_json: graphNode.attributes,
						path: resourcePath,
						updated_at: graphNode.updated_at ?? now,
					})
					.where('node_id', '=', graphNode.id)
					.execute();
				return;
			}
			await this.updateById(graphNode.id, {
				type: graphNode.type,
				label: graphNode.label,
				attributes: graphNode.attributes,
				updated_at: graphNode.updated_at ?? now,
			});
		} else {
			await this.insert({
				id: graphNode.id,
				type: graphNode.type,
				label: graphNode.label,
				attributes: graphNode.attributes,
				created_at: graphNode.created_at ?? now,
				updated_at: graphNode.updated_at ?? now,
			});
		}
	}

	async getById(id: string): Promise<DbSchema['graph_nodes'] | null> {
		const row = await this.db.selectFrom('mobius_node').selectAll().where('node_id', '=', id).executeTakeFirst();
		return row ? this.graphNodeFromMobius(row) : null;
	}

	async getByIds(ids: string[]): Promise<Map<string, GraphNode>> {
		if (!ids.length) return new Map();
		const rows = await this.db.selectFrom('mobius_node').selectAll().where('node_id', 'in', ids).execute();
		const result = new Map<string, GraphNode>();
		for (const row of rows) {
			result.set(row.node_id, this.graphNodeFromMobius(row));
		}
		return result;
	}

	async getByType(type: string): Promise<DbSchema['graph_nodes'][]> {
		const rows = await this.db.selectFrom('mobius_node').selectAll().where('type', '=', type).execute();
		return rows.map((r) => this.graphNodeFromMobius(r));
	}

	async getByTypeAndLabels(type: string, labels: string[]): Promise<DbSchema['graph_nodes'][]> {
		if (!labels.length) return [];
		const rows = await this.db
			.selectFrom('mobius_node')
			.selectAll()
			.where('type', '=', type)
			.where('label', 'in', labels)
			.execute();
		return rows.map((r) => this.graphNodeFromMobius(r));
	}

	async getIdsByIdsAndTypes(ids: string[], types: string[]): Promise<string[]> {
		if (!ids.length || !types.length) return [];
		const rows = await this.db
			.selectFrom('mobius_node')
			.select(['node_id'])
			.where('node_id', 'in', ids)
			.where('type', 'in', types)
			.execute();
		return rows.map((row) => row.node_id);
	}

	async deleteById(id: string): Promise<void> {
		await this.db.deleteFrom('mobius_node').where('node_id', '=', id).execute();
	}

	async deleteByIds(ids: string[]): Promise<void> {
		if (!ids.length) return;
		await this.deleteByNodeIds(ids);
	}

	/**
	 * Increment open_count and set last_open_ts for indexed note rows (`document` / `hub_doc`).
	 */
	async recordOpen(docId: string, ts: number): Promise<void> {
		await this.db
			.updateTable('mobius_node')
			.set({
				last_open_ts: ts,
				open_count: sql<number>`coalesce(open_count, 0) + 1`,
				updated_at: ts,
			})
			.where('node_id', '=', docId)
			.where('type', 'in', [...GRAPH_INDEXED_NOTE_NODE_TYPES])
			.execute();
	}

	async deleteByNodeIds(nodeIds: string[]): Promise<void> {
		if (!nodeIds.length) return;
		await this.db.deleteFrom('mobius_node').where('node_id', 'in', nodeIds).execute();
	}

	async deleteAll(): Promise<void> {
		await this.db.deleteFrom('mobius_node').execute();
	}

	// --- Document statistics (DTO `doc_statistics` on document `mobius_node` rows) ---

	private docStatisticsRowQuery() {
		return this.db.selectFrom('mobius_node').where('type', 'in', [...GRAPH_INDEXED_NOTE_NODE_TYPES]);
	}

	async getRecent(topK: number): Promise<Array<{ docId: string; lastOpenTs: number; openCount: number }>> {
		const limit = Math.max(1, topK || 20);
		const rows = await this.docStatisticsRowQuery()
			.select(['node_id', 'last_open_ts', 'open_count'])
			.where('last_open_ts', 'is not', null)
			.orderBy('last_open_ts', 'desc')
			.limit(limit)
			.execute();
		return rows.map((row) => ({
			docId: String(row.node_id),
			lastOpenTs: Number(row.last_open_ts ?? 0),
			openCount: Number(row.open_count ?? 0),
		}));
	}

	async getSignalsForDocIds(docIds: string[]): Promise<Map<string, DocRankingSignal>> {
		if (!docIds.length) return new Map();
		const rows = await this.docStatisticsRowQuery()
			.select([
				'node_id',
				'type',
				'last_open_ts',
				'open_count',
				'doc_incoming_cnt',
				'pagerank_version',
			])
			.where('node_id', 'in', docIds)
			.execute();
		const out = new Map<string, DocRankingSignal>();
		for (const row of rows) {
			const pv = row.pagerank_version;
			out.set(String(row.node_id), {
				lastOpenTs: Number(row.last_open_ts ?? 0),
				openCount: Number(row.open_count ?? 0),
				docIncomingCnt: Number(row.doc_incoming_cnt ?? 0),
				mobiusNodeType: String(row.type ?? ''),
				pagerankVersion: typeof pv === 'number' ? pv : undefined,
			});
		}
		return out;
	}

	/** Persists PageRank or semantic PageRank scalars on document-like rows. */
	async setPageRankForDocLikeNode(
		nodeId: string,
		fields: Partial<Pick<MobiusNodeRow, 'pagerank' | 'pagerank_updated_at' | 'pagerank_version' | 'semantic_pagerank' | 'semantic_pagerank_updated_at' | 'semantic_pagerank_version'>>,
		now: number = Date.now(),
	): Promise<void> {
		await this.db
			.updateTable('mobius_node')
			.set({ ...fields, updated_at: now })
			.where('node_id', '=', nodeId)
			.where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
			.execute();
	}

	async getByDocId(docId: string): Promise<DbSchema['doc_statistics'] | null> {
		const row = await this.docStatisticsRowQuery().selectAll().where('node_id', '=', docId).executeTakeFirst();
		return row ? this.docStatisticsFromMobius(row) : null;
	}

	async getByDocIds(docIds: string[]): Promise<Map<string, DbSchema['doc_statistics']>> {
		if (!docIds.length) return new Map();
		const rows = await this.docStatisticsRowQuery().selectAll().where('node_id', 'in', docIds).execute();
		const result = new Map<string, DbSchema['doc_statistics']>();
		for (const row of rows) {
			const s = this.docStatisticsFromMobius(row);
			if (s) result.set(s.doc_id, s);
		}
		return result;
	}

	async deleteDocumentStatisticsByDocId(docId: string): Promise<void> {
		await this.db
			.updateTable('mobius_node')
			.set({
				word_count: null,
				char_count: null,
				language: null,
				richness_score: null,
				last_open_ts: null,
				open_count: null,
				updated_at: Date.now(),
			})
			.where('node_id', '=', docId)
			.where('type', 'in', [...GRAPH_INDEXED_NOTE_NODE_TYPES])
			.execute();
	}

	async deleteDocumentStatisticsByDocIds(docIds: string[]): Promise<void> {
		if (!docIds.length) return;
		for (const id of docIds) await this.deleteDocumentStatisticsByDocId(id);
	}

	/** Clears statistic columns on all document rows (does not delete nodes). */
	async clearAllDocumentStatistics(): Promise<void> {
		await this.db
			.updateTable('mobius_node')
			.set({
				word_count: null, char_count: null, language: null,
				richness_score: null, last_open_ts: null, open_count: null,
				updated_at: Date.now(),
			})
			.where('type', 'in', [...GRAPH_INDEXED_NOTE_NODE_TYPES])
			.execute();
	}

	async countAllDocumentStatisticsRows(): Promise<number> {
		const r = await this.docStatisticsRowQuery()
			.select(({ fn }) => fn.countAll().as('c'))
			.executeTakeFirst();
		return Number(r?.c ?? 0);
	}

	private async getTopDocStat<K extends string>(
		col: K & keyof MobiusNodeRow,
		docIds: string[] | undefined,
		limit: number,
	): Promise<Array<{ doc_id: string } & Record<K, number>>> {
		if (docIds !== undefined && docIds.length === 0) return [];
		let q = this.docStatisticsRowQuery()
			.select(['node_id', col])
			.where(col, 'is not', null)
			.orderBy(col, 'desc')
			.limit(limit);
		if (docIds !== undefined) q = q.where('node_id', 'in', docIds);
		const rows = await q.execute();
		return rows.map((r) => ({ doc_id: r.node_id, [col]: Number((r as any)[col]) } as any));
	}

	async getTopRecentEditedByDocIds(docIds: string[] | undefined, limit: number) {
		return this.getTopDocStat('updated_at', docIds, limit);
	}
	async getTopWordCountByDocIds(docIds: string[] | undefined, limit: number) {
		return this.getTopDocStat('word_count', docIds, limit);
	}
	async getTopCharCountByDocIds(docIds: string[] | undefined, limit: number) {
		return this.getTopDocStat('char_count', docIds, limit);
	}
	async getTopRichnessByDocIds(docIds: string[] | undefined, limit: number) {
		return this.getTopDocStat('richness_score', docIds, limit);
	}

	async getLanguageStatsByDocIds(
		docIds: string[] | undefined,
	): Promise<Array<{ language: string; count: number }>> {
		if (docIds !== undefined && docIds.length === 0) return [];
		let q = this.docStatisticsRowQuery()
			.select(({ fn }) => ['language', fn.count<number>('node_id').as('count')])
			.where('language', 'is not', null)
			.groupBy('language');
		if (docIds !== undefined) q = q.where('node_id', 'in', docIds);
		const rows = await q.execute();
		return rows as Array<{ language: string; count: number }>;
	}

	/**
	 * Refresh degree columns for tag nodes touched by these tag node ids (cheaper than full recompute).
	 */
	async refreshTagDocCountsForTagNodeIds(tagNodeIds: string[], now: number = Date.now()): Promise<void> {
		for (const id of tagNodeIds) {
			await sql`
				UPDATE mobius_node SET
					tag_doc_count = (
						SELECT COUNT(DISTINCT e.from_node_id)
						FROM mobius_edge e
						WHERE e.to_node_id = ${id} AND (
							e.type = ${GraphEdgeType.TaggedTopic}
							OR e.type = ${GraphEdgeType.TaggedFunctional}
							OR e.type = ${GraphEdgeType.TaggedKeyword}
						)
					),
					updated_at = ${now}
				WHERE type IN (${GraphNodeType.TopicTag}, ${GraphNodeType.FunctionalTag}, ${GraphNodeType.KeywordTag}) AND node_id = ${id}
			`.execute(this.db);
		}
	}

	/**
	 * Sets outgoing degree counts from indexer (matches edges written for this document).
	 */
	async setDocumentOutgoingDegreeCounts(
		nodeId: string,
		docOutgoingCnt: number,
		otherOutgoingCnt: number,
		now: number = Date.now(),
	): Promise<void> {
		await this.db
			.updateTable('mobius_node')
			.set({
				doc_outgoing_cnt: docOutgoingCnt,
				other_outgoing_cnt: otherOutgoingCnt,
				updated_at: now,
			})
			.where('node_id', '=', nodeId)
			.where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
			.execute();
	}

	/**
	 * Per-target counts for incoming edges (`to_node_id` in batch): doc-reference bucket vs other.
	 * Only {@link GraphEdgeType.References} counts toward `doc`; {@link GraphEdgeType.ReferencesResource} is other.
	 */
	private async computeIncomingDocDegreeCountsBatch(nodeIds: string[]): Promise<Map<string, DocDegreeBucket>> {
		const out = new Map<string, DocDegreeBucket>();
		for (const id of nodeIds) out.set(id, { doc: 0, other: 0 });
		if (!nodeIds.length) return out;

		const ref = GraphEdgeType.References;
		const rows = await this.db
			.selectFrom('mobius_edge')
			.select([
				'to_node_id',
				sql<number>`sum(case when type = ${ref} then 1 else 0 end)`.as('doc_cnt'),
				sql<number>`sum(case when type = ${ref} then 0 else 1 end)`.as('other_cnt'),
			])
			.where('to_node_id', 'in', nodeIds)
			.groupBy('to_node_id')
			.execute();

		for (const row of rows) {
			const b = out.get(row.to_node_id);
			if (!b) continue;
			b.doc = Number(row.doc_cnt);
			b.other = Number(row.other_cnt);
		}
		return out;
	}

	/**
	 * Per-source counts for outgoing edges (`from_node_id` in batch): doc-reference bucket vs other.
	 * Same invariant as {@link computeIncomingDocDegreeCountsBatch}.
	 */
	private async computeOutgoingDocDegreeCountsBatch(nodeIds: string[]): Promise<Map<string, DocDegreeBucket>> {
		const out = new Map<string, DocDegreeBucket>();
		for (const id of nodeIds) out.set(id, { doc: 0, other: 0 });
		if (!nodeIds.length) return out;

		const ref = GraphEdgeType.References;
		const rows = await this.db
			.selectFrom('mobius_edge')
			.select([
				'from_node_id',
				sql<number>`sum(case when type = ${ref} then 1 else 0 end)`.as('doc_cnt'),
				sql<number>`sum(case when type = ${ref} then 0 else 1 end)`.as('other_cnt'),
			])
			.where('from_node_id', 'in', nodeIds)
			.groupBy('from_node_id')
			.execute();

		for (const row of rows) {
			const b = out.get(row.from_node_id);
			if (!b) continue;
			b.doc = Number(row.doc_cnt);
			b.other = Number(row.other_cnt);
		}
		return out;
	}

	/**
	 * Recomputes incoming degree columns from `mobius_edge` for document/hub nodes (after neighbors add/remove edges).
	 */
	async refreshDocumentIncomingDegreesForNodeIds(nodeIds: string[], now: number = Date.now()): Promise<void> {
		if (!nodeIds.length) return;
		const d = GraphNodeType.Document;
		const h = GraphNodeType.HubDoc;
		const incoming = await this.computeIncomingDocDegreeCountsBatch(nodeIds);
		for (const id of nodeIds) {
			const b = incoming.get(id)!;
			await this.db
				.updateTable('mobius_node')
				.set({
					doc_incoming_cnt: b.doc,
					other_incoming_cnt: b.other,
					updated_at: now,
				})
				.where('node_id', '=', id)
				.where('type', 'in', [d, h])
				.execute();
		}
	}

	/**
	 * Full recompute of all four degree columns from edges (repair / batch refresh; prefer {@link setDocumentOutgoingDegreeCounts} + {@link refreshDocumentIncomingDegreesForNodeIds} on index).
	 */
	async refreshDocumentDegreesForNodeIds(nodeIds: string[], now: number = Date.now()): Promise<void> {
		if (!nodeIds.length) return;
		const d = GraphNodeType.Document;
		const h = GraphNodeType.HubDoc;
		const [incoming, outgoing] = await Promise.all([
			this.computeIncomingDocDegreeCountsBatch(nodeIds),
			this.computeOutgoingDocDegreeCountsBatch(nodeIds),
		]);
		for (const id of nodeIds) {
			const inc = incoming.get(id)!;
			const out = outgoing.get(id)!;
			await this.db
				.updateTable('mobius_node')
				.set({
					doc_outgoing_cnt: out.doc,
					doc_incoming_cnt: inc.doc,
					other_outgoing_cnt: out.other,
					other_incoming_cnt: inc.other,
					updated_at: now,
				})
				.where('node_id', '=', id)
				.where('type', 'in', [d, h])
				.execute();
		}
	}

	// --- Hub discovery & local hub graph (read-only helpers) ---

	/**
	 * Clears materialized hub stats on folder nodes (`tag_doc_count`, `pagerank`, `semantic_pagerank`, boundary degree columns).
	 */
	async clearFolderHubMaterializedStatsColumns(now: number = Date.now()): Promise<void> {
		await this.db
			.updateTable('mobius_node')
			.set({
				tag_doc_count: null,
				pagerank: null,
				semantic_pagerank: null,
				folder_cohesion_score: null,
				doc_incoming_cnt: null,
				doc_outgoing_cnt: null,
				other_incoming_cnt: null,
				other_outgoing_cnt: null,
				updated_at: now,
			})
			.where('type', '=', GraphNodeType.Folder)
			.execute();
	}

	/**
	 * One keyset page of document rows used to rebuild folder hub aggregates (after PageRank is persisted).
	 * Excludes paths under `hubSummaryFolder` (same predicate as {@link listTopDocumentNodesForHubDiscovery}).
	 */
	async listDocumentRowsForFolderHubStatsKeyset(
		afterNodeId: string | null,
		limit: number,
		hubSummaryFolder: string,
	): Promise<
		Array<{
			node_id: string;
			path: string;
			label: string | null;
			tags_json: string | null;
			pagerank: number | null;
			semantic_pagerank: number | null;
			doc_incoming_cnt: number | null;
			doc_outgoing_cnt: number | null;
		}>
	> {
		const lim = Math.max(1, limit);
		const hub = hubSummaryFolder.trim();
		const likeUnderHub = hub ? `${hub}/%` : '';

		let q = this.db
			.selectFrom('mobius_node')
			.select([
				'node_id',
				'path',
				'label',
				'tags_json',
				'pagerank',
				'semantic_pagerank',
				'doc_incoming_cnt',
				'doc_outgoing_cnt',
			])
			.where('type', '=', GraphNodeType.Document)
			.where('path', 'is not', null)
			.orderBy('node_id')
			.limit(lim);
		if (hub) {
			q = q.where((eb) => eb.and([eb('path', '!=', hub), eb('path', 'not like', likeUnderHub)]));
		}
		if (afterNodeId != null && afterNodeId !== '') {
			q = q.where('node_id', '>', afterNodeId);
		}
		const rows = await q.execute();
		return rows.map((r) => ({
			node_id: r.node_id,
			path: r.path!,
			label: r.label,
			tags_json: r.tags_json,
			pagerank: r.pagerank,
			semantic_pagerank: r.semantic_pagerank,
			doc_incoming_cnt: r.doc_incoming_cnt,
			doc_outgoing_cnt: r.doc_outgoing_cnt,
		}));
	}

	/**
	 * Persists one folder node's materialized hub stats (reused columns; see hub docs).
	 */
	async updateFolderNodeHubMaterializedStats(
		nodeId: string,
		stats: {
			tagDocCount: number;
			avgPagerank: number;
			avgSemanticPagerank: number;
			/** Null when fewer than two sample docs or cohesion not computed. */
			folderCohesionScore: number | null;
			docIncoming: number;
			docOutgoing: number;
			otherIncoming: number;
			otherOutgoing: number;
		},
		now: number = Date.now(),
	): Promise<void> {
		await this.db
			.updateTable('mobius_node')
			.set({
				tag_doc_count: stats.tagDocCount,
				pagerank: stats.avgPagerank,
				semantic_pagerank: stats.avgSemanticPagerank,
				folder_cohesion_score: stats.folderCohesionScore,
				doc_incoming_cnt: stats.docIncoming,
				doc_outgoing_cnt: stats.docOutgoing,
				other_incoming_cnt: stats.otherIncoming,
				other_outgoing_cnt: stats.otherOutgoing,
				updated_at: now,
			})
			.where('node_id', '=', nodeId)
			.where('type', '=', GraphNodeType.Folder)
			.execute();
	}

	/**
	 * Top folder nodes for conversational search Orient: ordered by PageRank, then doc count under folder.
	 * Intuition text lives in `attributes_json` (see {@link parseFolderIntuitionFromMobiusFolderRow}).
	 */
	async listTopFoldersForSearchOrient(limit: number = 30): Promise<FolderIntuition[]> {
		const lim = Math.max(1, Math.floor(limit));
		const rows = await this.db
			.selectFrom('mobius_node')
			.select([
				'path',
				'summary',
				'attributes_json',
				'tag_doc_count',
				'folder_cohesion_score',
				'pagerank',
				'updated_at',
			])
			.where('type', '=', GraphNodeType.Folder)
			.where('path', 'is not', null)
			.orderBy(sql`coalesce(pagerank, 0) desc`)
			.orderBy(sql`coalesce(tag_doc_count, 0) desc`)
			.limit(lim)
			.execute();

		const out: FolderIntuition[] = [];
		for (const r of rows) {
			const m = parseFolderIntuitionFromMobiusFolderRow({
				path: r.path,
				summary: r.summary,
				attributes_json: r.attributes_json,
				tag_doc_count: r.tag_doc_count,
				folder_cohesion_score: r.folder_cohesion_score,
				pagerank: r.pagerank,
				updated_at: r.updated_at,
			});
			if (m) out.push(m);
		}
		return out;
	}

	/**
	 * Loads `tags_json` for documents under a folder path (exact folder or nested files), capped for purity stats.
	 */
	async listDocumentTagsJsonUnderFolderPrefix(folderPath: string, limit: number): Promise<string[]> {
		const p = normalizeVaultPath(folderPath);
		if (!p) return [];
		const lim = Math.max(1, limit);
		const prefix = p.endsWith('/') ? p : `${p}/`;
		const rows = await this.db
			.selectFrom('mobius_node')
			.select('tags_json')
			.where('type', '=', GraphNodeType.Document)
			.where((eb) => eb.or([eb('path', '=', p), eb('path', 'like', `${prefix}%`)]))
			.limit(lim)
			.execute();
		return rows.map((r) => String(r.tags_json ?? ''));
	}

	/** Direct child folder vault paths under `parentPath` (one extra path segment). */
	async listDirectChildFolderPaths(parentPath: string): Promise<string[]> {
		const p = normalizeVaultPath(parentPath);
		if (!p) return [];
		const prefix = `${p}/`;
		const rows = await this.db
			.selectFrom('mobius_node')
			.select('path')
			.where('type', '=', GraphNodeType.Folder)
			.where('path', 'like', `${prefix}%`)
			.execute();
		const parentSlashCount = (p.match(/\//g) ?? []).length;
		const out: string[] = [];
		for (const r of rows) {
			const path = r.path ? normalizeVaultPath(r.path) : '';
			if (!path.startsWith(prefix)) continue;
			const slashCount = (path.match(/\//g) ?? []).length;
			if (slashCount === parentSlashCount + 1) out.push(path);
		}
		return out;
	}

	/**
	 * Folder hub discovery rows for specific paths.
	 * Use for promoting direct children; may include rows below {@link FOLDER_HUB_MIN_DOCS} when `relaxMinDocs` is true.
	 */
	async listFolderHubDiscoveryRowsByPaths(
		paths: string[],
		hubSummaryFolder: string,
		options?: { relaxMinDocs?: boolean },
	): Promise<MobiusNodeFolderHubDiscoveryRow[]> {
		const uniq = [...new Set(paths.map((x) => normalizeVaultPath(String(x))).filter(Boolean))];
		if (!uniq.length) return [];
		const hub = hubSummaryFolder.trim();
		const likeUnderHub = hub ? `${hub}/%` : '';
		const relax = options?.relaxMinDocs === true;

		const hubPhysical = sql<number>`min(1.0, coalesce(pagerank, 0.0) * 2.2)`;
		const totalIn = sql<number>`coalesce(doc_incoming_cnt, 0) + coalesce(other_incoming_cnt, 0)`;
		const totalOut = sql<number>`coalesce(doc_outgoing_cnt, 0) + coalesce(other_outgoing_cnt, 0)`;
		const hubOrg = sql<number>`min(1.0, ln(1.0 + coalesce(tag_doc_count, 0)) * 0.18 + ln(1.0 + ${totalIn}) * 0.06 + ln(1.0 + ${totalOut}) * 0.06)`;
		const hubSem = sql<number>`min(1.0, coalesce(semantic_pagerank, 0.0) * 1.0)`;
		const lnRef = Math.log(1 + FOLDER_HUB_COHESION_SIZE_REF_DOC_COUNT);
		const hubCohEff = sql<number>`coalesce(folder_cohesion_score, 0.0) * min(1.0, ln(1.0 + coalesce(tag_doc_count, 0)) / ${lnRef})`;
		const wPhys = FOLDER_HUB_GRAPH_WEIGHT_PHYSICAL;
		const wOrg = FOLDER_HUB_GRAPH_WEIGHT_ORGANIZATIONAL;
		const wSem = FOLDER_HUB_GRAPH_WEIGHT_SEMANTIC;
		const wCoh = FOLDER_HUB_GRAPH_WEIGHT_COHESION;
		const hubGraph = sql<number>`min(1.0, (${hubPhysical} * ${wPhys}) + (${hubOrg} * ${wOrg}) + (${hubSem} * ${wSem}) + (${hubCohEff} * ${wCoh}))`;

		let q = this.db
			.selectFrom('mobius_node')
			.select([
				'node_id',
				'path',
				'label',
				'tag_doc_count',
				'pagerank',
				'semantic_pagerank',
				'folder_cohesion_score',
				'doc_incoming_cnt',
				'doc_outgoing_cnt',
				'other_incoming_cnt',
				'other_outgoing_cnt',
				hubPhysical.as('hub_physical_authority_score'),
				hubOrg.as('hub_organizational_score'),
				hubSem.as('hub_semantic_centrality_score'),
				hubCohEff.as('hub_cohesion_effective_score'),
				hubGraph.as('hub_graph_score'),
			])
			.where('type', '=', GraphNodeType.Folder)
			.where('path', 'is not', null)
			.where('path', 'in', uniq);
		if (!relax) {
			q = q.where('tag_doc_count', '>=', FOLDER_HUB_MIN_DOCS);
		}
		if (hub) {
			q = q.where((eb) => eb.and([eb('path', '!=', hub), eb('path', 'not like', likeUnderHub)]));
		}
		const rows = await q.execute();
		return rows as MobiusNodeFolderHubDiscoveryRow[];
	}

	/**
	 * Top `document` rows by hub graph score, excluding paths under `hubSummaryFolder` (Hub-Summaries subtree).
	 * Scoring matches in-app `HubCandidateDiscoveryService.scoreDocumentRow`; computed in SQL to avoid full-table loads.
	 *
	 * Let `pr = coalesce(pagerank,0)`, `wc = coalesce(word_count,0)`, `inc = coalesce(doc_incoming_cnt,0)`,
	 * `out = coalesce(doc_outgoing_cnt,0)`, `spr = coalesce(semantic_pagerank,0)` (all in SQL).
	 *
	 * - `longDocWeak = min(0.08, (wc / 50000) * 0.08)`
	 * - `hub_physical_authority_score = min(1, pr * 2.5 + longDocWeak)`
	 * - `hub_organizational_score = min(1, inc * w_in + out * w_out)` ({@link DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS})
	 * - `hub_semantic_centrality_score = min(1, spr * 1.2)`
	 * - `hub_graph_score = min(1, hub_physical_authority_score * 0.35 + hub_organizational_score * 0.25 + hub_semantic_centrality_score * 0.35)`
	 *
	 * Rows are ordered by `hub_graph_score` descending, then limited to `limit`.
	 */
	async listTopDocumentNodesForHubDiscovery(
		limit: number,
		hubSummaryFolder: string,
	): Promise<MobiusNodeHubDiscoveryScoredRow[]> {
		const lim = Math.max(1, limit);
		const hub = hubSummaryFolder.trim();
		const likeUnderHub = hub ? `${hub}/%` : '';

		const wIn = DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS.incoming;
		const wOut = DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS.outgoing;
		const hubPhysical = sql<number>`min(1.0, (coalesce(pagerank, 0) * 2.5) + min(0.08, (coalesce(word_count, 0) / 50000.0) * 0.08))`;
		const hubOrg = sql<number>`min(1.0, (coalesce(doc_incoming_cnt, 0) * ${wIn}) + (coalesce(doc_outgoing_cnt, 0) * ${wOut}))`;
		const hubSem = sql<number>`min(1.0, coalesce(semantic_pagerank, 0) * 1.2)`;
		const hubGraph = sql<number>`min(1.0, (${hubPhysical} * 0.35) + (${hubOrg} * 0.25) + (${hubSem} * 0.35))`;

		let q = this.db
			.selectFrom('mobius_node')
			.select([
				'node_id',
				'path',
				'label',
				'type',
				'doc_incoming_cnt',
				'doc_outgoing_cnt',
				'pagerank',
				'semantic_pagerank',
				'word_count',
				hubPhysical.as('hub_physical_authority_score'),
				hubOrg.as('hub_organizational_score'),
				hubSem.as('hub_semantic_centrality_score'),
				hubGraph.as('hub_graph_score'),
			])
			.where('type', '=', GraphNodeType.Document)
			.where('path', 'is not', null);

		if (hub) {
			q = q.where((eb) =>
				eb.and([eb('path', '!=', hub), eb('path', 'not like', likeUnderHub)]),
			);
		}

		const rows = await q.orderBy('hub_graph_score', 'desc').limit(lim).execute();
		return rows as MobiusNodeHubDiscoveryScoredRow[];
	}

	/**
	 * Batch-load doc link degrees for `type=folder` mobius rows by vault path (one round-trip).
	 * Keys in the returned map use {@link normalizeVaultPath}.
	 */
	async listFolderDocDegreesByVaultPaths(
		paths: string[],
	): Promise<Map<string, { incoming: number; outgoing: number }>> {
		const uniq = [...new Set(paths.map((p) => normalizeVaultPath(String(p ?? ''))).filter(Boolean))];
		if (uniq.length === 0) return new Map();
		const rows = await this.db
			.selectFrom('mobius_node')
			.select(['path', 'doc_incoming_cnt', 'doc_outgoing_cnt'])
			.where('type', '=', GraphNodeType.Folder)
			.where('path', 'in', uniq)
			.execute();
		const m = new Map<string, { incoming: number; outgoing: number }>();
		for (const r of rows) {
			const p = normalizeVaultPath(String(r.path ?? ''));
			if (!p) continue;
			m.set(p, {
				incoming: Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0))),
				outgoing: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0))),
			});
		}
		return m;
	}

	/**
	 * Sums `doc_outgoing_cnt` for document nodes (matches folder-row `docOutgoing` semantics, doc links only).
	 */
	async sumDocumentOutgoingByNodeIds(nodeIds: string[]): Promise<number> {
		const uniq = [...new Set(nodeIds.filter(Boolean))];
		if (uniq.length === 0) return 0;
		const rows = await this.db
			.selectFrom('mobius_node')
			.select(['doc_outgoing_cnt'])
			.where('node_id', 'in', uniq)
			.where('type', '=', GraphNodeType.Document)
			.execute();
		let s = 0;
		for (const r of rows) {
			s += Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0)));
		}
		return s;
	}

}
