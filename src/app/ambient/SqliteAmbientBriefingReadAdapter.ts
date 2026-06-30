// T11Y-2b: SQL-only implementation of AmbientBriefingReadPort.
//
// Each method is a single kysely query — no per-category filtering,
// scoring, decay logic, reason text, or category cap. Those moved to
// `service/ambient/briefing/BriefingItemBuilder.ts`. The adapter only
// applies hard-required SQL predicates (`path is not null`, type
// filter, mtime/updated_at predicate, order, limit).

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';
import type {
	AmbientBriefingReadPort,
	BriefingCandidateRow,
	BriefingDecayingRow,
	BriefingHubRow,
} from '@/core/ports/AmbientBriefingReadPort';

const INDEX_STATE_KEY_LAST_BRIEFING = 'ambient_last_briefing_ts';
const INDEX_STATE_KEY_LAST_SESSION = 'ambient_last_session_ts';

export class SqliteAmbientBriefingReadAdapter implements AmbientBriefingReadPort {
	isReady(): boolean {
		return sqliteStoreManager.isInitialized();
	}

	async getLastBriefingTimestamp(): Promise<number> {
		const repo = sqliteStoreManager.getIndexStateRepo('vault');
		const raw = await repo.get(INDEX_STATE_KEY_LAST_BRIEFING);
		return raw ? Number(raw) : 0;
	}

	async getLastSessionTimestamp(fallback: number): Promise<number> {
		const repo = sqliteStoreManager.getIndexStateRepo('vault');
		const raw = await repo.get(INDEX_STATE_KEY_LAST_SESSION);
		return raw ? Number(raw) : fallback;
	}

	async recordSessionTimestamps(now: number): Promise<void> {
		const repo = sqliteStoreManager.getIndexStateRepo('vault');
		await repo.set(INDEX_STATE_KEY_LAST_BRIEFING, String(now));
		await repo.set(INDEX_STATE_KEY_LAST_SESSION, String(now));
	}

	async listChangedCandidates(
		sinceTs: number,
		limit: number,
	): Promise<BriefingCandidateRow[]> {
		try {
			const db = sqliteStoreManager.getIndexContext('vault');
			const rows = await db
				.selectFrom('mobius_node')
				.select(['path', 'label', 'mtime', 'doc_incoming_cnt', 'doc_outgoing_cnt', 'pagerank'])
				.where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
				.where('mtime', '>=', sinceTs)
				.where('path', 'is not', null)
				.orderBy('mtime', 'desc')
				.limit(limit)
				.execute();

			return rows.map((row) => ({
				path: String(row.path),
				label: String(row.label ?? ''),
				mtime: row.mtime == null ? null : Number(row.mtime),
				docIncomingCnt: row.doc_incoming_cnt == null ? null : Number(row.doc_incoming_cnt),
				docOutgoingCnt: row.doc_outgoing_cnt == null ? null : Number(row.doc_outgoing_cnt),
				pagerank: row.pagerank == null ? null : Number(row.pagerank),
			}));
		} catch {
			return [];
		}
	}

	async listChangedHubs(
		sinceTs: number,
		limit: number,
	): Promise<BriefingHubRow[]> {
		try {
			const db = sqliteStoreManager.getIndexContext('vault');
			const rows = await db
				.selectFrom('mobius_node')
				.select(['path', 'label', 'updated_at'])
				.where('type', '=', 'hub_doc')
				.where('updated_at', '>=', sinceTs)
				.where('path', 'is not', null)
				.orderBy('updated_at', 'desc')
				.limit(limit)
				.execute();

			return rows.map((row) => ({
				path: String(row.path),
				label: String(row.label ?? ''),
				updatedAt: row.updated_at == null ? null : Number(row.updated_at),
			}));
		} catch {
			return [];
		}
	}

	async listDecayingCandidates(
		cutoffTs: number,
		limit: number,
	): Promise<BriefingDecayingRow[]> {
		try {
			const db = sqliteStoreManager.getIndexContext('vault');
			const rows = await db
				.selectFrom('mobius_node')
				.select(['path', 'label', 'pagerank', 'last_open_ts'])
				.where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
				.where('pagerank', 'is not', null)
				.where('pagerank', '>', 0)
				.where('path', 'is not', null)
				.$call((qb) =>
					qb.where((eb) =>
						eb.or([
							eb('last_open_ts', 'is', null),
							eb('last_open_ts', '<', cutoffTs),
						]),
					),
				)
				.orderBy('pagerank', 'desc')
				.limit(limit)
				.execute();

			return rows.map((row) => ({
				path: String(row.path),
				label: String(row.label ?? ''),
				pagerank: Number(row.pagerank ?? 0),
				lastOpenTs: row.last_open_ts == null ? null : Number(row.last_open_ts),
			}));
		} catch {
			return [];
		}
	}
}
