import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';
import type { BriefingItem } from './types';

/**
 * Briefing threshold constants.
 * Centralized per configurability rule (constant.ts fallback tier).
 */
const BRIEFING_DECAY_DAYS = 14;
const BRIEFING_MAX_ITEMS_PER_CATEGORY = 5;

/** Minimum gap between briefings to avoid showing on quick restarts. */
export const BRIEFING_MIN_SESSION_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Find notes edited in the last session that have potential unresolved connections.
 *
 * "Unresolved connections" = recently-modified document nodes where
 * doc_outgoing_cnt < doc_incoming_cnt * 0.5 — they are linked TO by many notes
 * but don't link OUT to related material (knowledge sinks).
 */
export async function getUnresolvedConnectionNotes(
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
			.limit(limit * 3) // Over-fetch to filter by heuristic
			.execute();

		const items: BriefingItem[] = [];
		for (const row of rows) {
			if (items.length >= limit) break;
			const incoming = Number(row.doc_incoming_cnt ?? 0);
			const outgoing = Number(row.doc_outgoing_cnt ?? 0);

			// "Unresolved" heuristic: incoming suggests importance, low outgoing means under-linked
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

/**
 * Find hub summaries that were updated since the user's last session.
 *
 * These represent knowledge clusters that evolved — the user should review
 * what changed in their knowledge landscape.
 */
export async function getChangedHubs(
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

/**
 * Find notes with high PageRank that haven't been opened in 14+ days.
 *
 * These represent "decaying engagement" — important knowledge the user
 * is neglecting. Ordered by pagerank DESC so the most important notes
 * surface first.
 */
export async function getDecayingEngagementNotes(
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
