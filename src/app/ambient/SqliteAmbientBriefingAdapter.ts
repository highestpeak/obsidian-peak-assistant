// T8: briefing adapter. Owns the three kysely queries against
// `mobius_node` (formerly `service/ambient/briefing-queries.ts`) and
// the `index_state` reads/writes for briefing/session timestamps
// (formerly inlined in `MorningBriefingService`). Each method satisfies
// the `AmbientBriefingPort` contract; the runtime never sees sqlite.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';
import type { AmbientBriefingPort } from '@/service/ambient/ports/AmbientPorts';
import type { BriefingItem } from '@/service/ambient/types';

const INDEX_STATE_KEY_LAST_BRIEFING = 'ambient_last_briefing_ts';
const INDEX_STATE_KEY_LAST_SESSION = 'ambient_last_session_ts';

const BRIEFING_DECAY_DAYS = 14;
const BRIEFING_MAX_ITEMS_PER_CATEGORY = 5;

export class SqliteAmbientBriefingAdapter implements AmbientBriefingPort {
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

	async loadBriefingItems(lastSessionTs: number): Promise<BriefingItem[]> {
		const [unresolved, changedHubs, decaying] = await Promise.all([
			getUnresolvedConnectionNotes(lastSessionTs),
			getChangedHubs(lastSessionTs),
			getDecayingEngagementNotes(),
		]);
		return [...unresolved, ...changedHubs, ...decaying];
	}
}

async function getUnresolvedConnectionNotes(
	lastSessionStartTs: number,
	limit: number = BRIEFING_MAX_ITEMS_PER_CATEGORY,
): Promise<BriefingItem[]> {
	try {
		const db = sqliteStoreManager.getIndexContext('vault');
		const rows = await db
			.selectFrom('mobius_node')
			.select(['node_id', 'path', 'label', 'mtime', 'doc_incoming_cnt', 'doc_outgoing_cnt', 'pagerank'])
			.where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
			.where('mtime', '>=', lastSessionStartTs)
			.where('path', 'is not', null)
			.orderBy('mtime', 'desc')
			.limit(limit * 3)
			.execute();

		const items: BriefingItem[] = [];
		for (const row of rows) {
			if (items.length >= limit) break;
			const incoming = Number(row.doc_incoming_cnt ?? 0);
			const outgoing = Number(row.doc_outgoing_cnt ?? 0);

			if (incoming >= 2 && outgoing < incoming * 0.5) {
				const title = String(row.label ?? row.path ?? '').replace(/\.md$/, '');
				items.push({
					filePath: String(row.path),
					title,
					category: 'unresolved_connections',
					reason: `${incoming} notes link here, but only ${outgoing} outgoing links`,
					score: incoming - outgoing,
					metadata: {
						lastEditedTs: Number(row.mtime ?? 0),
						connectionCount: incoming,
					},
				});
			}
		}
		return items;
	} catch {
		return [];
	}
}

async function getChangedHubs(
	lastVisitTs: number,
	limit: number = BRIEFING_MAX_ITEMS_PER_CATEGORY,
): Promise<BriefingItem[]> {
	try {
		const db = sqliteStoreManager.getIndexContext('vault');
		const rows = await db
			.selectFrom('mobius_node')
			.select(['node_id', 'path', 'label', 'updated_at', 'mtime'])
			.where('type', '=', 'hub_doc')
			.where('updated_at', '>=', lastVisitTs)
			.where('path', 'is not', null)
			.orderBy('updated_at', 'desc')
			.limit(limit)
			.execute();

		return rows.map((row) => ({
			filePath: String(row.path),
			title: String(row.label ?? '').replace(/\.md$/, ''),
			category: 'changed_hubs' as const,
			reason: 'Hub summary updated since your last session',
			score: 1,
			metadata: {
				hubName: String(row.label ?? ''),
			},
		}));
	} catch {
		return [];
	}
}

async function getDecayingEngagementNotes(
	limit: number = BRIEFING_MAX_ITEMS_PER_CATEGORY,
): Promise<BriefingItem[]> {
	try {
		const db = sqliteStoreManager.getIndexContext('vault');
		const cutoff = Date.now() - BRIEFING_DECAY_DAYS * 24 * 60 * 60 * 1000;

		const rows = await db
			.selectFrom('mobius_node')
			.select(['node_id', 'path', 'label', 'pagerank', 'last_open_ts', 'doc_incoming_cnt'])
			.where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
			.where('pagerank', 'is not', null)
			.where('pagerank', '>', 0)
			.where('path', 'is not', null)
			.$call((qb) =>
				qb.where((eb) =>
					eb.or([
						eb('last_open_ts', 'is', null),
						eb('last_open_ts', '<', cutoff),
					]),
				),
			)
			.orderBy('pagerank', 'desc')
			.limit(limit)
			.execute();

		const now = Date.now();
		return rows.map((row) => {
			const lastOpen = Number(row.last_open_ts ?? 0);
			const daysSince = lastOpen > 0
				? Math.floor((now - lastOpen) / (24 * 60 * 60 * 1000))
				: null;
			const title = String(row.label ?? row.path ?? '').replace(/\.md$/, '');

			return {
				filePath: String(row.path),
				title,
				category: 'decaying_engagement' as const,
				reason: daysSince !== null
					? `High importance note, not opened in ${daysSince} days`
					: 'High importance note, never opened via Peak',
				score: Number(row.pagerank ?? 0),
				metadata: {
					daysSinceOpened: daysSince ?? undefined,
				},
			};
		});
	} catch {
		return [];
	}
}
