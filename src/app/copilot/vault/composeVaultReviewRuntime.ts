// T9: Single composition point for the Vault Review runtime.
//
// This is the ONE place that wires concrete Obsidian, sqlite, profile
// registry, lint runtime, search client, and Agent SDK dependencies
// into the `VaultReviewDeps` port bag, then constructs the runtime
// implementation. Called exactly once at plugin boot from `main.ts`.
//
// All concrete imports (Obsidian `App`, AppContext, sqliteStoreManager,
// LintRuntime) live behind this function and the adapters it constructs.
// Service-layer code stays pure orchestration over the port bag.

import type { App } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import { VaultReviewRuntimeImpl } from '@/service/copilot/vault/VaultReviewRuntimeImpl';
import type { VaultReviewDeps } from '@/service/copilot/vault/ports/VaultReviewPorts';
import { AppVaultReviewProfileAdapter } from './AppVaultReviewProfileAdapter';
import { SqliteVaultReviewDigestAdapter } from './SqliteVaultReviewDigestAdapter';
import { AppVaultReviewAgentAdapter } from './AppVaultReviewAgentAdapter';
import { ObsidianVaultReviewReportAdapter } from './ObsidianVaultReviewReportAdapter';

export function composeVaultReviewRuntime(app: App): VaultReviewRuntime {
	const deps: VaultReviewDeps = {
		profile: new AppVaultReviewProfileAdapter(),
		digestData: new SqliteVaultReviewDigestAdapter(),
		agent: new AppVaultReviewAgentAdapter(app),
		reports: new ObsidianVaultReviewReportAdapter(app),
		// Lint runtime is bound earlier in boot via composeVaultLintRuntime;
		// the registry returns the active instance.
		vaultLintRuntime: AppContext.getVaultLintRuntime(),
	};
	return new VaultReviewRuntimeImpl(deps);
}
