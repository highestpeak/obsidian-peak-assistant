// T9: Vault Review service ports.
//
// Every concrete dependency the vault review code used to grab via
// `AppContext.getInstance()`, `sqliteStoreManager.*`, or direct
// `obsidian` imports is now expressed as a port. The app layer owns
// the adapters that implement these ports.
//
// Two layers of dependency bags:
//   - `VaultReviewSessionDeps`  — what `runVaultReview` needs to drive a
//                                 multi-round session (profile + digest +
//                                 agent + lint runtime).
//   - `VaultReviewDeps`         — full runtime bag: session deps plus
//                                 the report + digest data ports the
//                                 runtime exposes to UI / history flows.

import type { LLMStreamEvent } from '@/core/providers/types';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type {
	VaultDigest,
	BuildVaultDigestOptions,
	ClusterMember,
} from '@/service/copilot/vault/VaultDigestService';
import type { VaultFingerprint } from '@/service/copilot/vault/VaultFingerprintService';
import type {
	VaultMetaAgentOptions,
} from '@/service/copilot/vault/VaultMetaAgentStream';
import type {
	VaultReviewHistoryRecord,
} from '@/service/copilot/vault/VaultReviewReportService';
import type { VaultReviewSessionSnapshot } from '@/service/copilot/vault/VaultReviewSession';

/**
 * User profile text used in the meta-agent system prompt. Returns
 * `undefined` when the user has no profile yet.
 */
export interface VaultReviewProfilePort {
	loadUserProfileText(): Promise<string | undefined>;
}

/**
 * SQLite-backed data access for the vault digest + cluster drill-down.
 * Implementations cache the fingerprint internally.
 */
export interface VaultReviewDigestDataPort {
	getVaultFingerprint(force?: boolean): Promise<VaultFingerprint | null>;
	buildDigest(options: BuildVaultDigestOptions): Promise<VaultDigest | null>;
	listClusterMembers(communityId: string, limit?: number): Promise<ClusterMember[]>;
}

/**
 * Stream a single round of the vault meta-agent. The adapter owns the
 * Peak Harness model/tool execution and Obsidian `App` access.
 */
export interface VaultReviewAgentPort {
	runRound(options: VaultMetaAgentOptions): AsyncGenerator<LLMStreamEvent>;
}

/**
 * Vault review markdown file persistence (frontmatter + body + JSON
 * fence). All Obsidian `App` / `TFile` / `TFolder` / `Notice` access is
 * contained in the adapter behind this port.
 */
export interface VaultReviewReportPort {
	save(
		snapshot: VaultReviewSessionSnapshot,
		existing?: Pick<VaultReviewHistoryRecord, 'id' | 'storagePath'>,
	): Promise<VaultReviewHistoryRecord>;
	listAll(limit?: number): Promise<VaultReviewHistoryRecord[]>;
	load(record: VaultReviewHistoryRecord): Promise<VaultReviewSessionSnapshot | null>;
	delete(record: VaultReviewHistoryRecord): Promise<void>;
}

/**
 * Deps consumed by `runVaultReview(...)` itself. No report-port here —
 * report persistence is owned by the runtime / UI layer.
 */
export interface VaultReviewSessionDeps {
	profile: VaultReviewProfilePort;
	digestData: VaultReviewDigestDataPort;
	agent: VaultReviewAgentPort;
	vaultLintRuntime: VaultLintRuntime;
}

/**
 * Full deps bag bound to the runtime. The runtime exposes
 * report/history/cluster operations through these ports.
 */
export interface VaultReviewDeps extends VaultReviewSessionDeps {
	reports: VaultReviewReportPort;
}
