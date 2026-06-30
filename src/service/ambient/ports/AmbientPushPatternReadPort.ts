// T11Y-7e: read-only port for recurring (source -> pushed) pairs.
//
// The SqliteAmbientPersistenceAdapter implements this port by
// delegating to AmbientPushRepo.getRecurringPairs(...). Cache
// duration, lookback days, minimum occurrences, and the strength
// formula live in `service/ambient/PatternLearningService.ts`, NOT
// here. The adapter only does the SQL.

/** One recurring (source -> pushed) pair, returned by the adapter. */
export interface RecurringPushPair {
	readonly sourceFilePath: string;
	readonly pushedFilePath: string;
	readonly count: number;
	readonly avgScore: number;
}

export interface AmbientPushPatternReadPort {
	/**
	 * Return recurring (source, pushed) pairs where the user
	 * opened/linked the same pair at least `minCount` times within
	 * `withinDays`. The repo applies the SQL `having` clause and
	 * orders by count desc.
	 */
	findRecurringPairs(withinDays: number, minCount: number): Promise<RecurringPushPair[]>;
}
