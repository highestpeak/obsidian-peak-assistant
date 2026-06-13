// T9: Concrete implementation of `VaultReviewRuntime`.
//
// Mirrors the T8 `AmbientPushRuntime` shape — a service-layer class
// that takes a `VaultReviewDeps` port bag in its constructor and
// implements the runtime methods by delegating to those ports. No
// AppContext / sqlite / Obsidian imports here.
//
// The composition (`src/app/copilot/vault/composeVaultReviewRuntime`)
// is the ONE place that wires concrete Obsidian + sqlite + lint
// runtime + Agent SDK adapters into the port bag.

import type { VaultReviewRuntime, RunVaultReviewRuntimeOptions } from './VaultReviewRuntime';
import type { VaultReviewDeps } from './ports/VaultReviewPorts';
import type { VaultReviewSessionSnapshot } from './VaultReviewSession';
import type { VaultReviewHistoryRecord } from './VaultReviewReportService';
import type { ClusterMember } from './VaultDigestService';
import { runVaultReview } from './VaultReviewSession';

export class VaultReviewRuntimeImpl implements VaultReviewRuntime {
	constructor(private readonly deps: VaultReviewDeps) {}

	run(options: RunVaultReviewRuntimeOptions): AsyncGenerator<
		VaultReviewSessionSnapshot,
		VaultReviewSessionSnapshot,
		void
	> {
		return runVaultReview(
			{
				profile: this.deps.profile,
				digestData: this.deps.digestData,
				agent: this.deps.agent,
				vaultLintRuntime: this.deps.vaultLintRuntime,
			},
			options,
		);
	}

	saveReport(
		snapshot: VaultReviewSessionSnapshot,
		existing?: Pick<VaultReviewHistoryRecord, 'id' | 'storagePath'>,
	): Promise<VaultReviewHistoryRecord> {
		return this.deps.reports.save(snapshot, existing);
	}

	listReports(limit?: number): Promise<VaultReviewHistoryRecord[]> {
		return this.deps.reports.listAll(limit);
	}

	loadReport(record: VaultReviewHistoryRecord): Promise<VaultReviewSessionSnapshot | null> {
		return this.deps.reports.load(record);
	}

	deleteReport(record: VaultReviewHistoryRecord): Promise<void> {
		return this.deps.reports.delete(record);
	}

	listClusterMembers(communityId: string, limit?: number): Promise<ClusterMember[]> {
		return this.deps.digestData.listClusterMembers(communityId, limit);
	}

	getVaultFingerprint(force?: boolean) {
		return this.deps.digestData.getVaultFingerprint(force);
	}

	dispose(): void {
		// Adapter-side dispose hooks (the sqlite adapter clears its
		// fingerprint cache here). Each port is optional-disposable.
		const maybeDispose = (x: unknown) => {
			const candidate = x as { dispose?: () => void };
			candidate.dispose?.();
		};
		maybeDispose(this.deps.profile);
		maybeDispose(this.deps.digestData);
		maybeDispose(this.deps.agent);
		maybeDispose(this.deps.reports);
	}
}
