// T8: pure pattern-boost helper.
//
// The previous file owned a module-level in-memory cache and called
// `sqliteStoreManager.getAmbientPushRepo().getRecurringPairs(...)`
// directly. Both moved to
// `src/app/ambient/SqliteAmbientPersistenceAdapter.ts`: the cache lives
// on the adapter instance, and adapter methods satisfy the
// `AmbientPersistencePort.{getLearnedPatterns,invalidatePatternCache}`
// contract. The pure scoring helper below is what `ambientSearch`
// consumes and what `test/ambient-push.test.ts` covers.

/**
 * A learned pattern: when editing source files similar to `sourceFilePath`,
 * the user consistently finds `pushedFilePath` useful.
 */
export interface LearnedPattern {
	sourceFilePath: string;
	pushedFilePath: string;
	strength: number; // count * avgScore — higher = stronger pattern
}

/**
 * Get boost amount for a candidate based on learned patterns.
 * Returns a score boost (0 to 0.4) if the (source, candidate) pair
 * matches a learned pattern.
 *
 * @param sourceFilePath - The file currently being edited
 * @param candidatePath - The candidate push item path
 * @param patterns - Pre-fetched learned patterns
 */
export function getPatternBoost(
	sourceFilePath: string,
	candidatePath: string,
	patterns: LearnedPattern[],
): number {
	const match = patterns.find(
		(p) => p.sourceFilePath === sourceFilePath && p.pushedFilePath === candidatePath,
	);
	if (!match) return 0;

	// Boost capped at 0.4, scaled by pattern strength
	// strength = count * avgScore; typical range 1-10
	return Math.min(0.4, match.strength * 0.05);
}
