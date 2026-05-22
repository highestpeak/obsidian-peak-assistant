/**
 * VaultFingerprintService — vault-level fingerprint for incremental Vault Review.
 *
 * Computes a stable hash over `(path, content_hash)` pairs for all indexed notes.
 * Used to decide whether a Vault Auto Review needs to re-run.
 *
 * See docs/superpowers/specs/2026-05-20-vault-auto-review-design.md §10.
 */

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { hashSHA256 } from '@/core/utils/hash-utils';

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

const CACHE_TTL_MS = 30_000; // 30s — vault doesn't change often; this cap absorbs rapid re-entries.

let _cached: VaultFingerprint | null = null;

/**
 * Compute the current vault fingerprint. Cached for {@link CACHE_TTL_MS}.
 * Returns null when the index is unavailable (e.g., during startup).
 */
export async function getVaultFingerprint(force = false): Promise<VaultFingerprint | null> {
	if (!force && _cached && Date.now() - _cached.computedAt < CACHE_TTL_MS) {
		return _cached;
	}
	try {
		const db = sqliteStoreManager.getIndexContext('vault');
		const rows = await db
			.selectFrom('mobius_node')
			.select(['path', 'content_hash', 'word_count', 'mtime'])
			.where('path', 'is not', null)
			.execute();
		const lines: string[] = [];
		let totalWords = 0;
		let lastMtime = 0;
		for (const row of rows) {
			if (!row.path || !row.content_hash) continue;
			lines.push(`${row.path}:${row.content_hash}`);
			totalWords += row.word_count ?? 0;
			if (row.mtime && row.mtime > lastMtime) lastMtime = row.mtime;
		}
		lines.sort();
		const fingerprint: VaultFingerprint = {
			fingerprint: hashSHA256(lines.join('\n')),
			fileCount: lines.length,
			totalWordCount: totalWords,
			lastMaxMtime: lastMtime,
			computedAt: Date.now(),
		};
		_cached = fingerprint;
		return fingerprint;
	} catch (err) {
		console.warn('[VaultFingerprintService] failed to compute fingerprint', err);
		return null;
	}
}

/** Forces the next call to {@link getVaultFingerprint} to recompute. */
export function invalidateVaultFingerprint(): void {
	_cached = null;
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
