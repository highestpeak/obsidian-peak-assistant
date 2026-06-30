// T11Y-2b: pure briefing item builder.
//
// Owns the three categories' product policy: the connection-imbalance
// rule, the decay window, per-category caps, score formulas, and the
// human-readable `reason` text. Consumes raw rows from
// `AmbientBriefingReadPort`; the SQLite adapter only owns queries.
//
// Implements `AmbientBriefingPort` (the runtime-facing contract); the
// timestamp methods + `isReady` delegate straight to the port.

import type {
	AmbientBriefingReadPort,
} from '@/core/ports/AmbientBriefingReadPort';
import type { AmbientBriefingPort } from '@/core/ports/AmbientPorts';
import type { BriefingItem } from '@/core/types/ambient';

export const BRIEFING_DECAY_DAYS = 14;
export const BRIEFING_MAX_ITEMS_PER_CATEGORY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export class BriefingItemBuilder implements AmbientBriefingPort {
	constructor(
		private readonly read: AmbientBriefingReadPort,
		private readonly nowFn: () => number = Date.now,
	) {}

	isReady(): boolean {
		return this.read.isReady();
	}

	getLastBriefingTimestamp(): Promise<number> {
		return this.read.getLastBriefingTimestamp();
	}

	getLastSessionTimestamp(fallback: number): Promise<number> {
		return this.read.getLastSessionTimestamp(fallback);
	}

	recordSessionTimestamps(now: number): Promise<void> {
		return this.read.recordSessionTimestamps(now);
	}

	async loadBriefingItems(lastSessionTs: number): Promise<BriefingItem[]> {
		const cutoff = this.nowFn() - BRIEFING_DECAY_DAYS * DAY_MS;
		const [unresolved, changedHubs, decaying] = await Promise.all([
			this.buildUnresolvedConnections(lastSessionTs),
			this.buildChangedHubs(lastSessionTs),
			this.buildDecayingEngagement(cutoff),
		]);
		return [...unresolved, ...changedHubs, ...decaying];
	}

	private async buildUnresolvedConnections(
		lastSessionStartTs: number,
		limit: number = BRIEFING_MAX_ITEMS_PER_CATEGORY,
	): Promise<BriefingItem[]> {
		// Pull `limit * 3` so the imbalance filter has headroom (same
		// over-fetch heuristic as the pre-refactor adapter).
		const rows = await this.read.listChangedCandidates(lastSessionStartTs, limit * 3);

		const items: BriefingItem[] = [];
		for (const row of rows) {
			if (items.length >= limit) break;
			const incoming = row.docIncomingCnt ?? 0;
			const outgoing = row.docOutgoingCnt ?? 0;

			if (incoming >= 2 && outgoing < incoming * 0.5) {
				const title = String(row.label || row.path).replace(/\.md$/, '');
				items.push({
					filePath: row.path,
					title,
					category: 'unresolved_connections',
					reason: `${incoming} notes link here, but only ${outgoing} outgoing links`,
					score: incoming - outgoing,
					metadata: {
						lastEditedTs: row.mtime ?? 0,
						connectionCount: incoming,
					},
				});
			}
		}
		return items;
	}

	private async buildChangedHubs(
		lastVisitTs: number,
		limit: number = BRIEFING_MAX_ITEMS_PER_CATEGORY,
	): Promise<BriefingItem[]> {
		const rows = await this.read.listChangedHubs(lastVisitTs, limit);
		return rows.map((row) => ({
			filePath: row.path,
			title: row.label.replace(/\.md$/, ''),
			category: 'changed_hubs' as const,
			reason: 'Hub summary updated since your last session',
			score: 1,
			metadata: {
				hubName: row.label,
			},
		}));
	}

	private async buildDecayingEngagement(
		cutoffTs: number,
		limit: number = BRIEFING_MAX_ITEMS_PER_CATEGORY,
	): Promise<BriefingItem[]> {
		const rows = await this.read.listDecayingCandidates(cutoffTs, limit);
		const now = this.nowFn();

		return rows.map((row) => {
			const lastOpen = row.lastOpenTs ?? 0;
			const daysSince = lastOpen > 0
				? Math.floor((now - lastOpen) / DAY_MS)
				: null;
			const title = String(row.label || row.path).replace(/\.md$/, '');

			return {
				filePath: row.path,
				title,
				category: 'decaying_engagement' as const,
				reason: daysSince !== null
					? `High importance note, not opened in ${daysSince} days`
					: 'High importance note, never opened via Peak',
				score: row.pagerank,
				metadata: {
					daysSinceOpened: daysSince ?? undefined,
				},
			};
		});
	}
}
