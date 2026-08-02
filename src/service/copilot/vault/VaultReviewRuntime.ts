// T9: Vault Review capability runtime — interface only.
//
// Mirrors the T6R Vault Lint and T8 Ambient patterns: a narrow interface
// that production callers (the Vault Auto Run modal, picker sections,
// history modal, picker readiness card) reach through
// `AppContext.{get,tryGet}VaultReviewRuntime()`. The concrete
// implementation takes a `VaultReviewDeps` port bag and is composed in
// `src/app/copilot/vault/composeVaultReviewRuntime.ts` — the single
// place where Obsidian `App`, `sqliteStoreManager`, lint runtime,
// profile registry, search client, and Peak Harness are wired into
// ports.
//
// Single-instance-per-plugin-load. Binding semantics live in
// `AppRuntimeRegistry`.

import type { VaultReviewSessionSnapshot } from './VaultReviewSession';
import type { VaultReviewMode } from './VaultMetaAgentStream';
import type {
	VaultReviewHistoryRecord,
} from './VaultReviewReportService';
import type { ClusterMember, VaultDigest } from './VaultDigestService';
import type { VaultFingerprint } from './VaultFingerprintService';

export interface RunVaultReviewRuntimeOptions {
	mode: VaultReviewMode;
	signal: AbortSignal;
}

export interface VaultReviewRuntime {
	/**
	 * Drive the multi-round vault review session. Yields a snapshot on
	 * every change so the modal can re-render progressively.
	 */
	run(options: RunVaultReviewRuntimeOptions): AsyncGenerator<
		VaultReviewSessionSnapshot,
		VaultReviewSessionSnapshot,
		void
	>;

	/**
	 * Persist (or update in place) the report markdown for the current
	 * snapshot. The progressive checkpoint passes `existing` so a single
	 * run keeps writing into one file.
	 */
	saveReport(
		snapshot: VaultReviewSessionSnapshot,
		existing?: Pick<VaultReviewHistoryRecord, 'id' | 'storagePath'>,
	): Promise<VaultReviewHistoryRecord>;

	/**
	 * Latest-first list of vault review history records (read by the
	 * picker, history modal, and the auto-run modal's "previous review"
	 * fetch).
	 */
	listReports(limit?: number): Promise<VaultReviewHistoryRecord[]>;

	/**
	 * Load the snapshot embedded inside a historical report. Returns
	 * `null` if the markdown file is missing or its snapshot fence
	 * cannot be parsed.
	 */
	loadReport(record: VaultReviewHistoryRecord): Promise<VaultReviewSessionSnapshot | null>;

	/**
	 * Trash a historical report. No-op if the file is already gone.
	 */
	deleteReport(record: VaultReviewHistoryRecord): Promise<void>;

	migrateLegacyReports(): Promise<{ imported: number; warnings: string[] }>;

	/**
	 * Top-N members of a community, ordered by PageRank descending.
	 * Used by the Clusters tab drill-down.
	 */
	listClusterMembers(communityId: string, limit?: number): Promise<ClusterMember[]>;

	/**
	 * Current vault fingerprint. Used by the picker readiness card to
	 * compute freshness vs. the last persisted review. Returns `null`
	 * when the sqlite index is not yet ready.
	 */
	getVaultFingerprint(force?: boolean): Promise<VaultFingerprint | null>;

	/** Read-only Vault Maintenance projection; does not start an AI review. */
	getDigest(): Promise<VaultDigest | null>;

	/**
	 * Release any cached state (e.g. fingerprint cache, lazy services)
	 * held by adapters. Called from `main.onunload`. Idempotent.
	 */
	dispose?(): void;
}
