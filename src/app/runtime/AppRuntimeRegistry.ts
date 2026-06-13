// T6R: App-owned runtime registry.
//
// T6 introduced a module-level `currentRuntime` binding inside
// `src/service/lint/VaultLintRuntime.ts`. That was an acceptable
// transitional state but the rule "no service-layer module singletons"
// applies once any second capability needs the same shape — so we relocate
// the binding to app-level ownership before T7.
//
// This registry is owned by `AppContext` (one instance per plugin load).
// It is unit-testable because it does not pull any Obsidian / sqlite /
// AIServiceManager dependencies. Tests construct `new AppRuntimeRegistry()`
// directly and exercise fail-loud / double-bind / clear behavior.
//
// Per-capability accessors are added here rather than on `AppContext`
// itself so the registry stays the single point where binding semantics
// live; `AppContext` only exposes thin static delegators.

import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';

export class AppRuntimeRegistry {
	private vaultLintRuntime: VaultLintRuntime | null = null;

	/**
	 * Bind the Vault Lint runtime. Called exactly once at plugin boot
	 * from `composeVaultLintRuntime`. A second bind without an
	 * intervening `clearVaultLintRuntime` is a programmer error and
	 * throws — that situation almost always indicates a duplicate
	 * onload path or a stale hot-reload binding.
	 */
	setVaultLintRuntime(runtime: VaultLintRuntime): void {
		if (this.vaultLintRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setVaultLintRuntime: a runtime is already bound. Call clearVaultLintRuntime first if this is intentional.',
			);
		}
		this.vaultLintRuntime = runtime;
	}

	/**
	 * Read the active Vault Lint runtime. Fail-loud if no runtime is
	 * bound — that is a boot-order bug, not a graceful-degradation
	 * case. Service callers (e.g. `VaultReviewSession`) use this form
	 * because they should only run after the runtime is up.
	 */
	getVaultLintRuntime(): VaultLintRuntime {
		if (this.vaultLintRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getVaultLintRuntime: no runtime is bound. Plugin boot must call setVaultLintRuntime() before consumers reach the runtime.',
			);
		}
		return this.vaultLintRuntime;
	}

	/**
	 * Soft accessor that returns `null` when the runtime is not yet
	 * bound. Used by UI providers that may mount during early boot
	 * (e.g. user opening the Vault X-Ray view before sqlite init
	 * resolves). The consumer is expected to handle the null case.
	 */
	tryGetVaultLintRuntime(): VaultLintRuntime | null {
		return this.vaultLintRuntime;
	}

	/**
	 * Tear down the active runtime. Used by `main.onunload` so a
	 * hot-reloaded plugin bundle does not hold references to the
	 * closed sqlite repo or unloaded `AppContext`. Idempotent.
	 */
	clearVaultLintRuntime(): void {
		this.vaultLintRuntime = null;
	}
}
