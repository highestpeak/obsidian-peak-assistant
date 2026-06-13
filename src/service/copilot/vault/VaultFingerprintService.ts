/**
 * VaultFingerprintService — pure fingerprint types + diff helpers.
 *
 * Pre-T9 this file also computed the fingerprint by reaching
 * `sqliteStoreManager.getIndexContext('vault')` directly and cached
 * the result in a module-level `_cached` global. T9 moves the
 * fingerprint computation + cache into
 * `SqliteVaultReviewDigestAdapter` (where it lives behind the
 * `VaultReviewDigestDataPort`). This file now owns only types and the
 * pure delta / freshness helpers that the picker readiness card uses.
 *
 * See docs/superpowers/specs/2026-05-20-vault-auto-review-design.md §10.
 */

export interface VaultFingerprint {
	/** Hash of sorted `${path}:${contentHash}` lines. Identical iff vault content is identical. */
	fingerprint: string;
	fileCount: number;
	totalWordCount: number;
	lastMaxMtime: number;
	computedAt: number;
}

export interface VaultFingerprintDelta {
	identical: boolean;
	filesChanged: number;
	wordDeltaPct: number;
	currentFileCount: number;
	previousFileCount: number;
}

/**
 * Compare the current fingerprint to a previous snapshot (from a stored
 * vault review). Returns whether they are identical plus the delta size so
 * the UI can pick the right state card.
 */
export function diffVaultFingerprint(
	current: Pick<VaultFingerprint, 'fingerprint' | 'fileCount' | 'totalWordCount'>,
	previous: Pick<VaultFingerprint, 'fingerprint' | 'fileCount' | 'totalWordCount'> | null,
): VaultFingerprintDelta {
	if (!previous) {
		return {
			identical: false,
			filesChanged: current.fileCount,
			wordDeltaPct: 100,
			currentFileCount: current.fileCount,
			previousFileCount: 0,
		};
	}
	const identical = current.fingerprint === previous.fingerprint;
	const filesChanged = Math.abs(current.fileCount - previous.fileCount);
	const wordDeltaPct =
		previous.totalWordCount === 0
			? 100
			: Math.abs(current.totalWordCount - previous.totalWordCount) / previous.totalWordCount * 100;
	return {
		identical,
		filesChanged,
		wordDeltaPct,
		currentFileCount: current.fileCount,
		previousFileCount: previous.fileCount,
	};
}

/**
 * UX state mapping per design §10.2.
 * The "30-day staleness" override (state E) is applied by the caller because
 * it requires knowledge of the previous review's `completedAt`.
 */
export type VaultReviewFreshness = 'A-no-prior' | 'B-unchanged' | 'C-minor' | 'D-major';

export function freshnessFromDelta(delta: VaultFingerprintDelta, hasPriorReview: boolean): VaultReviewFreshness {
	if (!hasPriorReview) return 'A-no-prior';
	if (delta.identical) return 'B-unchanged';
	if (delta.filesChanged <= 5 && delta.wordDeltaPct <= 2) return 'C-minor';
	return 'D-major';
}
