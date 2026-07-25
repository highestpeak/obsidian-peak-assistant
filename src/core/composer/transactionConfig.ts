/**
 * Peak Composer — transaction engine config (WP2).
 *
 * Timing / grouping knobs are domain config, not code constants
 * (docs/conventions/configurability.md): they mirror the `transaction` section
 * of templates/config/composer.json. This module is the compiled fallback used
 * in tests, at cold start, and anywhere the runtime JSON is unavailable. The
 * app layer loads the JSON and passes the resolved value into the hub; the drift
 * guard test/composer-config.test.ts keeps the two in sync.
 */

export interface ComposerTransactionConfig {
	/**
	 * Time window (ms) within which consecutive `direct` edits on the same
	 * target coalesce into one History parent + one Undo step (typing burst).
	 */
	burstWindowMs: number;
}

export const DEFAULT_TRANSACTION_CONFIG: ComposerTransactionConfig = {
	burstWindowMs: 800,
};
