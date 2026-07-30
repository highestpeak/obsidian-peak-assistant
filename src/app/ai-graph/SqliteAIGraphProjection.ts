import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type {
	AIGraphHistoryRow,
	AIGraphOriginContextRef,
	AIGraphOriginSurface,
	AIGraphProjectionEntry,
	AIGraphProjectionPort,
} from '@/service/ai-graph';

interface ArtifactProjectionRow {
	graph_id: string;
	title: string;
	graph_type: AIGraphHistoryRow['graphType'];
	status: AIGraphHistoryRow['status'];
	version_id: string;
	version_number: number;
	updated_at: number;
	node_count: number;
	relation_count: number;
	source_count: number;
	needs_review_count: number;
	created_from_json: string;
	changed_source_count: number;
}

/**
 * Rebuildable SQLite browse/search projection. All writes are derived from a
 * canonical manifest + immutable head version; this adapter has no semantic
 * mutation API.
 */
export class SqliteAIGraphProjection implements AIGraphProjectionPort {
	async list(): Promise<AIGraphHistoryRow[] | null> {
		const db = sqliteStoreManager.getMetaStore();
		if (!db) return null;
		const rows = db.prepare(`
			SELECT *
			  FROM ai_graph_artifact_projection
			 ORDER BY updated_at DESC
		`).all() as ArtifactProjectionRow[];
		return rows.map((row) => ({
			graphId: row.graph_id,
			title: row.title,
			graphType: row.graph_type,
			status: row.status,
			versionId: row.version_id,
			versionNumber: row.version_number,
			updatedAt: row.updated_at,
			stats: {
				nodeCount: row.node_count,
				relationCount: row.relation_count,
				sourceCount: row.source_count,
				needsReviewCount: row.needs_review_count,
			},
			createdFrom: JSON.parse(row.created_from_json),
			changedSourceCount: row.changed_source_count,
		}));
	}

	async replace(entry: AIGraphProjectionEntry): Promise<void> {
		const db = sqliteStoreManager.getMetaStore();
		if (!db) return;
		this.replaceWithDb(db, entry);
	}

	async replaceAll(entries: readonly AIGraphProjectionEntry[]): Promise<void> {
		const db = sqliteStoreManager.getMetaStore();
		if (!db) return;
		db.exec('BEGIN IMMEDIATE');
		try {
			db.exec(`
				DELETE FROM ai_graph_artifact_projection;
				DELETE FROM ai_graph_version_projection;
				DELETE FROM ai_graph_node_projection;
				DELETE FROM ai_graph_relation_projection;
			`);
			for (const entry of entries) this.replaceWithDb(db, entry);
			db.exec('COMMIT');
		} catch (error) {
			db.exec('ROLLBACK');
			throw error;
		}
	}

	async touchUsage(
		graphId: string,
		originSurface: AIGraphOriginSurface,
		contextRefs: readonly AIGraphOriginContextRef[],
		openedAt: number,
	): Promise<void> {
		const db = sqliteStoreManager.getMetaStore();
		if (!db) return;
		db.prepare(`
			INSERT INTO ai_graph_usage_projection (
				graph_id, origin_surface, context_refs_json, last_opened_at, open_count
			) VALUES (?, ?, ?, ?, 1)
			ON CONFLICT(graph_id) DO UPDATE SET
				last_opened_at = excluded.last_opened_at,
				open_count = ai_graph_usage_projection.open_count + 1
		`).run(graphId, originSurface, JSON.stringify(contextRefs), openedAt);
	}

	private replaceWithDb(
		db: NonNullable<ReturnType<typeof sqliteStoreManager.getMetaStore>>,
		entry: AIGraphProjectionEntry,
	): void {
		const { view, versionNumber } = entry;
		const { manifest, version, sources } = view;
		const changedSourceCount = sources.filter((source) =>
			source.freshness === 'changed' || source.freshness === 'unavailable').length;
		db.prepare(`
			INSERT INTO ai_graph_artifact_projection (
				graph_id, title, graph_type, status, version_id, version_number,
				updated_at, node_count, relation_count, source_count,
				needs_review_count, created_from_json, changed_source_count
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(graph_id) DO UPDATE SET
				title = excluded.title,
				graph_type = excluded.graph_type,
				status = excluded.status,
				version_id = excluded.version_id,
				version_number = excluded.version_number,
				updated_at = excluded.updated_at,
				node_count = excluded.node_count,
				relation_count = excluded.relation_count,
				source_count = excluded.source_count,
				needs_review_count = excluded.needs_review_count,
				created_from_json = excluded.created_from_json,
				changed_source_count = excluded.changed_source_count
		`).run(
			manifest.graphId,
			manifest.title,
			manifest.graphType,
			manifest.status,
			version.versionId,
			versionNumber,
			manifest.updatedAt,
			version.stats.nodeCount,
			version.stats.relationCount,
			version.stats.sourceCount,
			version.stats.needsReviewCount,
			JSON.stringify(manifest.createdFrom),
			changedSourceCount,
		);

		const versionInsert = db.prepare(`
			INSERT OR REPLACE INTO ai_graph_version_projection (
				graph_id, version_id, parent_version_id, created_at,
				change_kind, prompt, stats_json
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		const nodeInsert = db.prepare(`
			INSERT INTO ai_graph_node_projection (
				graph_id, version_id, node_id, kind, label, aliases_json,
				canonical_ref, review_status
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);
		const relationInsert = db.prepare(`
			INSERT INTO ai_graph_relation_projection (
				graph_id, version_id, relation_id, source_node_id,
				target_node_id, family, predicate, directed, review_status
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		for (const projectedVersion of entry.versions ?? [version]) {
			versionInsert.run(
				projectedVersion.graphId,
				projectedVersion.versionId,
				projectedVersion.parentVersionId ?? null,
				projectedVersion.createdAt,
				projectedVersion.changeKind,
				projectedVersion.prompt ?? null,
				JSON.stringify(projectedVersion.stats),
			);
			db.prepare(`
				DELETE FROM ai_graph_node_projection
				 WHERE graph_id = ? AND version_id = ?
			`).run(projectedVersion.graphId, projectedVersion.versionId);
			db.prepare(`
				DELETE FROM ai_graph_relation_projection
				 WHERE graph_id = ? AND version_id = ?
			`).run(projectedVersion.graphId, projectedVersion.versionId);
			for (const node of projectedVersion.nodes) {
				nodeInsert.run(
					projectedVersion.graphId,
					projectedVersion.versionId,
					node.nodeId,
					node.kind,
					node.label,
					JSON.stringify(node.aliases),
					node.canonicalRef ?? null,
					node.reviewStatus,
				);
			}
			for (const relation of projectedVersion.relations) {
				relationInsert.run(
					projectedVersion.graphId,
					projectedVersion.versionId,
					relation.relationId,
					relation.sourceNodeId,
					relation.targetNodeId,
					relation.family,
					relation.predicate,
					relation.directed ? 1 : 0,
					relation.reviewStatus,
				);
			}
		}
	}
}
