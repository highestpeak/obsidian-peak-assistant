import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { AppContext } from '@/app/context/AppContext';
import {
	getUnresolvedConnectionNotes,
	getChangedHubs,
	getDecayingEngagementNotes,
	BRIEFING_MIN_SESSION_GAP_MS,
} from './briefing-queries';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import type { BriefingItem } from './types';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from './types';

const INDEX_STATE_KEY_LAST_BRIEFING = 'ambient_last_briefing_ts';
const INDEX_STATE_KEY_LAST_SESSION = 'ambient_last_session_ts';

/**
 * Orchestrator for the Morning Briefing feature.
 *
 * On startup (after SQLite is ready), it:
 * 1. Checks if enough time elapsed since last briefing (min 4h gap)
 * 2. Gathers briefing items from three sources in parallel
 * 3. Stores items in the briefing Zustand store
 * 4. Shows the briefing modal (caller opens the actual modal)
 * 5. Records timestamps for next session
 */
export class MorningBriefingService {
	private static instance: MorningBriefingService | null = null;

	static getInstance(): MorningBriefingService {
		if (!MorningBriefingService.instance) {
			MorningBriefingService.instance = new MorningBriefingService();
		}
		return MorningBriefingService.instance;
	}

	/**
	 * Called after SQLite init completes. Decides whether to show a briefing.
	 * Returns true if a briefing was generated and stored (caller should open modal).
	 */
	async tryShow(): Promise<boolean> {
		try {
			// Check settings
			const settings = AppContext.getSettings().ambientPush ?? DEFAULT_AMBIENT_PUSH_SETTINGS;
			if (!settings.enabled || !settings.enableMorningBriefing) return false;

			if (!sqliteStoreManager.isInitialized()) return false;

			const indexStateRepo = sqliteStoreManager.getIndexStateRepo('vault');

			// Check time since last briefing
			const lastBriefingRaw = await indexStateRepo.get(INDEX_STATE_KEY_LAST_BRIEFING);
			const lastBriefingTs = lastBriefingRaw ? Number(lastBriefingRaw) : 0;
			const now = Date.now();

			if (now - lastBriefingTs < BRIEFING_MIN_SESSION_GAP_MS) {
				return false; // Too soon since last briefing
			}

			// Determine last session timestamp (for "what changed since last visit")
			const lastSessionRaw = await indexStateRepo.get(INDEX_STATE_KEY_LAST_SESSION);
			const lastSessionTs = lastSessionRaw ? Number(lastSessionRaw) : now - 24 * 60 * 60 * 1000;

			// Gather items from all three sources in parallel
			const [unresolved, changedHubs, decaying] = await Promise.all([
				getUnresolvedConnectionNotes(lastSessionTs),
				getChangedHubs(lastSessionTs),
				getDecayingEngagementNotes(),
			]);

			const allItems: BriefingItem[] = [...unresolved, ...changedHubs, ...decaying];

			// Record timestamps regardless of whether there are items
			await this.recordSessionTimestamps(indexStateRepo, now);

			if (allItems.length === 0) {
				return false;
			}

			// Sort by score descending
			allItems.sort((a, b) => b.score - a.score);

			// Store and mark visible
			const store = useMorningBriefingStore.getState();
			store.setItems(allItems);
			store.show();

			return true;
		} catch (err) {
			console.debug('[MorningBriefingService] Failed to generate briefing (non-critical):', err);
			return false;
		}
	}

	private async recordSessionTimestamps(
		indexStateRepo: { set: (key: string, value: string) => Promise<void> },
		now: number,
	): Promise<void> {
		await indexStateRepo.set(INDEX_STATE_KEY_LAST_BRIEFING, String(now));
		await indexStateRepo.set(INDEX_STATE_KEY_LAST_SESSION, String(now));
	}

	dispose(): void {
		MorningBriefingService.instance = null;
	}
}
