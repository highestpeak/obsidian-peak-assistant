// T6 Vault Lint Ports — runtime access point.
//
// One file, one binding. After T5 we deleted the UI store; after T6 we
// delete the four service-locator exits inside the engine
// (`AppContext.getInstance` ×2, `sqliteStoreManager.getVaultLintRepo`,
// `SignalRegistry.getInstance`) and the static `VaultLintService.getInstance`.
//
// What stays as the new central point of contact is this module-level
// `currentRuntime` binding. It is intentionally a transitional shape
// that mirrors T2's `ProgressReporterPort.defaultReporter` discipline:
//   - written exactly once at boot (`main.onload` → `composeVaultLintRuntime`
//     → `setVaultLintRuntime`);
//   - cleared exactly once at unload (`main.onunload` →
//     `clearVaultLintRuntimeForTests`);
//   - fail-loud on read before write (engine code calling
//     `getVaultLintRuntime()` before boot is a programmer error and
//     should throw, not silently null out);
//   - test-only reset (`clearVaultLintRuntimeForTests`) so unit tests
//     can swap in a fake runtime without process-wide leakage.
//
// This is the ONLY module-level mutable binding T6 introduces. Refusing
// any binding would force the runner / commands / digest service to
// receive the runtime via a parameter chain that does not exist in the
// React/Obsidian-command call sites — that would be more invasive than
// useful at this stage. T7+ may replace this binding with a per-call
// `runtime` argument once the consumers have an obvious place to
// receive it.

import type { LintScanResult } from './types';
import type { VaultLintRunCallbacks } from './VaultLintRun';

/**
 * The minimum runtime surface consumers (`runVaultLintManualScan`,
 * `openVaultXRay`, `VaultDigestService`) need from the Vault Lint
 * engine. The implementing class today is `VaultLintService`.
 */
export interface VaultLintRuntime {
	/** Execute one manual full scan. */
	runFullScan(callbacks?: VaultLintRunCallbacks): Promise<LintScanResult>;
	/** Read the most recent persisted scan, or null if none exists. */
	loadLatestScan(): Promise<LintScanResult | null>;
}

let currentRuntime: VaultLintRuntime | null = null;

/**
 * Bind the active Vault Lint runtime. Called exactly once at plugin
 * boot from the app-layer composition function. Calling it twice
 * without an intervening `clearVaultLintRuntimeForTests` throws.
 */
export function setVaultLintRuntime(runtime: VaultLintRuntime): void {
	if (currentRuntime !== null) {
		throw new Error(
			'setVaultLintRuntime: a runtime is already bound. Call clearVaultLintRuntimeForTests first if this is a test, or unload the plugin if this is production.',
		);
	}
	currentRuntime = runtime;
}

/**
 * Read the active Vault Lint runtime. Fail-loud if no runtime is
 * bound — that is a boot-order bug, not a graceful-degradation case.
 */
export function getVaultLintRuntime(): VaultLintRuntime {
	if (currentRuntime === null) {
		throw new Error(
			'getVaultLintRuntime: no runtime is bound. Plugin boot must call setVaultLintRuntime() before consumers reach the runtime.',
		);
	}
	return currentRuntime;
}

/**
 * Tear down the active runtime. Used by `main.onunload` and by tests
 * to release the previously bound runtime. Idempotent: clearing a
 * not-yet-bound runtime is a no-op so test setup is permissive.
 */
export function clearVaultLintRuntimeForTests(): void {
	currentRuntime = null;
}
