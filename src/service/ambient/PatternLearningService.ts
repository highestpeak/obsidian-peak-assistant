// T11Y-7e: pattern-learning policy.
//
// Owns the recurring-pair cache duration, the lookback window
// (`PATTERN_LOOKBACK_DAYS`), the minimum-occurrence floor
// (`PATTERN_MIN_OCCURRENCES`), and the strength formula
// (`count * avgScore`). The SQLite adapter
// (`SqliteAmbientPersistenceAdapter`) now exposes a raw
// `findRecurringPairs(window, minCount)` method only; this class is
// the single source of truth for the boost shape.
//
// `getPatternBoost` and `LearnedPattern` continue to live in
// `PatternLearner.ts` since `AmbientSearcher` + `test/ambient-push.test.ts`
// import from there.

import type {
	AmbientPushPatternReadPort,
	RecurringPushPair,
} from '@/core/ports/AmbientPushPatternReadPort';
import type { LearnedPattern } from './PatternLearner';

export const PATTERN_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const PATTERN_LOOKBACK_DAYS = 30;
export const PATTERN_MIN_OCCURRENCES = 2;

export class PatternLearningService {
	private cachedPatterns: LearnedPattern[] = [];
	private lastRefreshTs = 0;

	constructor(
		private readonly read: AmbientPushPatternReadPort,
		private readonly nowFn: () => number = Date.now,
		private readonly cacheDurationMs: number = PATTERN_REFRESH_INTERVAL_MS,
		private readonly lookbackDays: number = PATTERN_LOOKBACK_DAYS,
		private readonly minOccurrences: number = PATTERN_MIN_OCCURRENCES,
	) {}

	async getLearnedPatterns(): Promise<LearnedPattern[]> {
		const now = this.nowFn();
		if (
			now - this.lastRefreshTs < this.cacheDurationMs &&
			this.cachedPatterns.length > 0
		) {
			return this.cachedPatterns;
		}

		try {
			const pairs: RecurringPushPair[] = await this.read.findRecurringPairs(
				this.lookbackDays,
				this.minOccurrences,
			);
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

	invalidateCache(): void {
		this.lastRefreshTs = 0;
	}
}
