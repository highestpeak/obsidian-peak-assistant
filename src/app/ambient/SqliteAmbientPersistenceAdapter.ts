// T8: persistence adapter. Owns `sqliteStoreManager.getAmbientPushRepo()`
// and the in-adapter pattern cache (formerly module-level state in
// `service/ambient/PatternLearner.ts`). Each method satisfies the
// `AmbientPersistencePort` contract; the runtime never imports sqlite.

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type {
	AmbientPersistencePort,
} from '@/service/ambient/ports/AmbientPorts';
import type { AmbientContext, AmbientPushItem, TriggerType, UserAction } from '@/core/types/ambient';
import type { LearnedPattern } from '@/service/ambient/PatternLearner';

const PATTERN_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const PATTERN_LOOKBACK_DAYS = 30;
const PATTERN_MIN_OCCURRENCES = 2;

export class SqliteAmbientPersistenceAdapter implements AmbientPersistencePort {
	private cachedPatterns: LearnedPattern[] = [];
	private lastRefreshTs = 0;

	async logPushes(
		context: AmbientContext,
		items: AmbientPushItem[],
		triggerType: TriggerType,
	): Promise<void> {
		const repo = sqliteStoreManager.getAmbientPushRepo();
		for (const item of items) {
			await repo.logPush({
				timestamp: item.timestamp,
				triggerType,
				sourceFilePath: context.filePath,
				contextParagraph: context.currentParagraph || null,
				pushedFilePath: item.filePath,
				pushedScore: item.score,
				explanationType: item.explanationType,
				explanationText: item.explanation,
			});
		}
	}

	async recordAction(
		sourceFilePath: string,
		pushedFilePath: string,
		action: UserAction,
	): Promise<void> {
		const repo = sqliteStoreManager.getAmbientPushRepo();
		await repo.recordAction({
			sourceFilePath,
			pushedFilePath,
			action,
			actionTs: Date.now(),
		});
	}

	async getLearnedPatterns(): Promise<LearnedPattern[]> {
		const now = Date.now();
		if (now - this.lastRefreshTs < PATTERN_REFRESH_INTERVAL_MS && this.cachedPatterns.length > 0) {
			return this.cachedPatterns;
		}

		try {
			const repo = sqliteStoreManager.getAmbientPushRepo();
			const pairs = await repo.getRecurringPairs(PATTERN_LOOKBACK_DAYS, PATTERN_MIN_OCCURRENCES);
			this.cachedPatterns = pairs.map((p) => ({
				sourceFilePath: p.sourceFilePath,
				pushedFilePath: p.pushedFilePath,
				strength: p.count * p.avgScore,
			}));
			this.lastRefreshTs = now;
		} catch {
			// SQLite not ready — keep stale cache or empty
		}
		return this.cachedPatterns;
	}

	invalidatePatternCache(): void {
		this.lastRefreshTs = 0;
	}
}
