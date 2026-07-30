// T9 / T11Y-4a: Single composition point for the Vault Review runtime.
//
// This is the ONE place that wires concrete Obsidian, sqlite, profile
// registry, lint runtime, search client, and Peak Harness dependencies
// into the `VaultReviewDeps` port bag, then constructs the runtime
// implementation. Called exactly once at plugin boot from `main.ts`.
//
// T11Y-4a split the legacy `SqliteVaultReviewDigestAdapter` into:
//   - `SqliteVaultReviewReadAdapter`  (app layer, SQL only)
//   - `VaultDigestBuilder`            (service layer, fingerprint +
//                                      top-K + derivation + lint merge)
// The builder satisfies `VaultReviewDigestDataPort`, so it slots into
// the runtime deps where the sqlite adapter used to.

import type { App } from 'obsidian';
import { SqliteVaultReviewReadAdapter } from '@/app/copilot/vault/SqliteVaultReviewReadAdapter';
import { AppContext } from '@/app/context/AppContext';
import { VaultDigestBuilder } from '@/service/copilot/vault/VaultDigestBuilder';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import { VaultReviewRuntimeImpl } from '@/service/copilot/vault/VaultReviewRuntimeImpl';
import type { VaultReviewDeps } from '@/core/ports/VaultReviewPorts';
import { AppVaultReviewProfileAdapter } from './AppVaultReviewProfileAdapter';
import { AppVaultReviewAgentAdapter } from './AppVaultReviewAgentAdapter';
import { ObsidianVaultReviewReportAdapter } from './ObsidianVaultReviewReportAdapter';

export function composeVaultReviewRuntime(app: App): VaultReviewRuntime {
	const vaultLintRuntime = AppContext.getVaultLintRuntime();
	const reads = new SqliteVaultReviewReadAdapter();
	const digestBuilder = new VaultDigestBuilder(reads, vaultLintRuntime);
	const deps: VaultReviewDeps = {
		profile: new AppVaultReviewProfileAdapter(),
		digestData: digestBuilder,
		agent: new AppVaultReviewAgentAdapter(app),
		reports: new ObsidianVaultReviewReportAdapter(app),
		vaultLintRuntime,
	};
	return new VaultReviewRuntimeImpl(deps);
}
