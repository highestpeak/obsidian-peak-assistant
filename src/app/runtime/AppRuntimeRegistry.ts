// T6R / T8: App-owned runtime registry.
//
// T6 introduced a module-level `currentRuntime` binding inside
// `src/service/lint/VaultLintRuntime.ts`. T6R relocated it to this
// app-level registry; T7 added detector-context wiring; T8 adds the
// second capability (Ambient Push / Morning Briefing) to the same
// pattern. Each capability gets the same fail-loud / double-bind /
// clear semantics.
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
import type { AmbientRuntime } from '@/service/ambient/AmbientRuntime';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import type { QuickSearchBackgroundRuntime } from '@/service/search/background/QuickSearchBackgroundRuntime';

export class AppRuntimeRegistry {
	private vaultLintRuntime: VaultLintRuntime | null = null;
	private ambientRuntime: AmbientRuntime | null = null;
	private vaultReviewRuntime: VaultReviewRuntime | null = null;
	private quickSearchBackgroundRuntime: QuickSearchBackgroundRuntime | null = null;

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

	/**
	 * Bind the Ambient runtime. Called exactly once at plugin boot
	 * from `composeAmbientRuntime`. A second bind without an
	 * intervening `clearAmbientRuntime` throws — typically a hot-reload
	 * artifact or duplicate onload path.
	 */
	setAmbientRuntime(runtime: AmbientRuntime): void {
		if (this.ambientRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setAmbientRuntime: a runtime is already bound. Call clearAmbientRuntime first if this is intentional.',
			);
		}
		this.ambientRuntime = runtime;
	}

	/**
	 * Read the active Ambient runtime. Fail-loud if no runtime is
	 * bound — that is a boot-order bug. Command actions
	 * (`openRelatedNotes` / `refreshRelatedNotes`) use this form.
	 */
	getAmbientRuntime(): AmbientRuntime {
		if (this.ambientRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getAmbientRuntime: no runtime is bound. Plugin boot must call setAmbientRuntime() before consumers reach the runtime.',
			);
		}
		return this.ambientRuntime;
	}

	/**
	 * Soft accessor returning `null` when the runtime is not yet
	 * bound. Used by UI providers (the Related Notes panel + the
	 * serendipity gutter widget) that may mount during early boot,
	 * before the Ambient bootstrap path runs.
	 */
	tryGetAmbientRuntime(): AmbientRuntime | null {
		return this.ambientRuntime;
	}

	/**
	 * Dispose + drop the Ambient runtime. Used by `main.onunload` so
	 * a hot-reloaded plugin bundle does not hold an open editor event
	 * subscription. Idempotent.
	 */
	clearAmbientRuntime(): void {
		const runtime = this.ambientRuntime;
		this.ambientRuntime = null;
		runtime?.dispose();
	}

	/**
	 * T9: Bind the Vault Review runtime. Called exactly once at plugin
	 * boot from `composeVaultReviewRuntime`. A second bind without an
	 * intervening `clearVaultReviewRuntime` throws — typically a
	 * hot-reload artifact or duplicate onload path.
	 */
	setVaultReviewRuntime(runtime: VaultReviewRuntime): void {
		if (this.vaultReviewRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setVaultReviewRuntime: a runtime is already bound. Call clearVaultReviewRuntime first if this is intentional.',
			);
		}
		this.vaultReviewRuntime = runtime;
	}

	/**
	 * Read the active Vault Review runtime. Fail-loud if no runtime
	 * is bound — that is a boot-order bug.
	 */
	getVaultReviewRuntime(): VaultReviewRuntime {
		if (this.vaultReviewRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getVaultReviewRuntime: no runtime is bound. Plugin boot must call setVaultReviewRuntime() before consumers reach the runtime.',
			);
		}
		return this.vaultReviewRuntime;
	}

	/**
	 * Soft accessor returning `null` when the runtime is not yet
	 * bound. Used by UI components (the Copilot picker, the auto-run
	 * modal, the history modal) that can mount before vault review
	 * boot resolves.
	 */
	tryGetVaultReviewRuntime(): VaultReviewRuntime | null {
		return this.vaultReviewRuntime;
	}

	/**
	 * Dispose + drop the Vault Review runtime. Used by `main.onunload`
	 * so a hot-reloaded plugin bundle does not retain references to
	 * closed sqlite repos or stale fingerprint caches. Idempotent.
	 */
	clearVaultReviewRuntime(): void {
		const runtime = this.vaultReviewRuntime;
		this.vaultReviewRuntime = null;
		runtime?.dispose?.();
	}

	/**
	 * T10: Bind the Quick Search background-session runtime. Called
	 * exactly once at plugin boot from
	 * `composeQuickSearchBackgroundRuntime`. Double-bind without an
	 * intervening clear throws — typically a hot-reload artifact.
	 */
	setQuickSearchBackgroundRuntime(runtime: QuickSearchBackgroundRuntime): void {
		if (this.quickSearchBackgroundRuntime !== null) {
			throw new Error(
				'AppRuntimeRegistry.setQuickSearchBackgroundRuntime: a runtime is already bound. Call clearQuickSearchBackgroundRuntime first if this is intentional.',
			);
		}
		this.quickSearchBackgroundRuntime = runtime;
	}

	/**
	 * Read the active Quick Search background runtime. Fail-loud if no
	 * runtime is bound — that is a boot-order bug.
	 */
	getQuickSearchBackgroundRuntime(): QuickSearchBackgroundRuntime {
		if (this.quickSearchBackgroundRuntime === null) {
			throw new Error(
				'AppRuntimeRegistry.getQuickSearchBackgroundRuntime: no runtime is bound. Plugin boot must call setQuickSearchBackgroundRuntime() before consumers reach the runtime.',
			);
		}
		return this.quickSearchBackgroundRuntime;
	}

	/**
	 * Soft accessor returning `null` when the runtime is not yet bound.
	 * Used by UI components (Quick Search modal, Active Sessions list,
	 * Recent AI Analysis card) that can mount before boot resolves.
	 */
	tryGetQuickSearchBackgroundRuntime(): QuickSearchBackgroundRuntime | null {
		return this.quickSearchBackgroundRuntime;
	}

	/**
	 * Dispose + drop the runtime. Aborts every in-flight session so a
	 * hot-reloaded plugin bundle doesn't hold agent / abort-controller
	 * references. Idempotent.
	 */
	clearQuickSearchBackgroundRuntime(): void {
		const runtime = this.quickSearchBackgroundRuntime;
		this.quickSearchBackgroundRuntime = null;
		runtime?.dispose();
	}
}
