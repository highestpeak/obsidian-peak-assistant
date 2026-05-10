import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * A learned pattern: when editing source files similar to `sourceFilePath`,
 * the user consistently finds `pushedFilePath` useful.
 */
export interface LearnedPattern {
	sourceFilePath: string;
	pushedFilePath: string;
	strength: number; // count * avgScore — higher = stronger pattern
}

/** In-memory cache of learned patterns, refreshed periodically. */
let cachedPatterns: LearnedPattern[] = [];
let lastRefreshTs = 0;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // Refresh every 10 minutes

/**
 * Get learned patterns, refreshing from SQLite if stale.
 * Patterns are cached in memory to avoid per-search SQLite queries.
 */
export async function getLearnedPatterns(): Promise<LearnedPattern[]> {
	const now = Date.now();
	if (now - lastRefreshTs < REFRESH_INTERVAL_MS && cachedPatterns.length > 0) {
		return cachedPatterns;
	}

	try {
		const repo = sqliteStoreManager.getAmbientPushRepo();
		const pairs = await repo.getRecurringPairs(30, 2); // Last 30 days, min 2 occurrences

		cachedPatterns = pairs.map((p) => ({
			sourceFilePath: p.sourceFilePath,
			pushedFilePath: p.pushedFilePath,
			strength: p.count * p.avgScore,
		}));
		lastRefreshTs = now;
	} catch {
		// SQLite not ready — return stale cache or empty
	}

	return cachedPatterns;
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

/**
 * Force refresh of learned patterns (e.g., after a batch of user actions).
 */
export function invalidatePatternCache(): void {
	lastRefreshTs = 0;
}
