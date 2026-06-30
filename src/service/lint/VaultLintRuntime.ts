// T6R Vault Lint runtime — pure interface file.
//
// T6 placed a module-level `currentRuntime` binding here (the central
// fail-loud handoff between `composeVaultLintRuntime` and the service
// consumers). T6R relocates that binding to app-level ownership in
// `src/app/runtime/AppRuntimeRegistry.ts` so the "no service-layer
// module singletons" rule holds at the capability boundary.
//
// What stays here: the minimum runtime SURFACE consumers depend on.
// Nothing else. No mutable state, no factory, no static instance.

import type { LintScanResult } from './types';
import type { VaultLintRunCallbacks } from './VaultLintRun';

/**
 * The minimum runtime surface consumers (`runVaultLintManualScan`,
 * `VaultDigestService`, the Vault Review runtime) need from the Vault
 * Lint engine. The implementing class today is `VaultLintService`.
 *
 * The standalone Vault X-Ray view + `openVaultXRay` command have been
 * retired (T11Y-1); Vault Lint is now an internal provider for the
 * Vault Intelligence loop (Copilot Picker → Vault tab → VaultAutoRunModal).
 *
 * Binding lifecycle lives in `AppRuntimeRegistry`; this file is
 * purely a contract between engine and consumers.
 */
export interface VaultLintRuntime {
	/** Execute one manual full scan. */
	runFullScan(callbacks?: VaultLintRunCallbacks): Promise<LintScanResult>;
	/** Read the most recent persisted scan, or null if none exists. */
	loadLatestScan(): Promise<LintScanResult | null>;
}
