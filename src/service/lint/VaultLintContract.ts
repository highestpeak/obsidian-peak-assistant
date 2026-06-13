// T1 capability contract seed for Vault Lint.
//
// Boundary rule: this file must not import obsidian, AppContext,
// sqliteStoreManager, any zustand store, SignalRegistry, HealthScoreEngine,
// or any other runtime singleton. The only allowed import source is
// `./types`. The companion test `test/vault-lint-contract.test.ts` enforces
// this by source-string scan.
//
// Truth rule: every value here describes CURRENT runtime behavior in
// `VaultLintService` at the time of T1. Future expansion (RunEnvelope,
// ports, extra triggers, complete/error events, narrowed output) is named
// out explicitly so the contract cannot be silently widened later.

import type { LintDimension, LintScanResult } from './types';

export const VAULT_LINT_CAPABILITY_ID = 'vault.lint.scan' as const;
export type VaultLintCapabilityId = typeof VAULT_LINT_CAPABILITY_ID;

/**
 * Input shape the current runtime accepts.
 *
 * `scanType:'full'` is the only path implemented in
 * `VaultLintService.runFullScan`. `LintScanResult` carries an
 * `'incremental'` variant but no runtime owner exists today.
 *
 * `trigger:'manual'` is the only entry point in use (the X-Ray panel's
 * "Scan Now" button). startup/scheduled triggers are explicitly out of T1
 * and listed in {@link VaultLintFutureTrigger}.
 */
export interface VaultLintCapabilityInput {
	scanType: 'full';
	trigger: 'manual';
}

/** Triggers that are deliberately NOT part of the T1 contract. */
export type VaultLintFutureTrigger = 'startup' | 'scheduled';

/**
 * Progress event shape currently emitted into `useVaultLintStore`.
 *
 * Only three phases exist:
 *   - `init`     : registry warmup, before any detector runs
 *   - `scanning` : detectors are running in parallel
 *   - `cleared`  : progress entry was set to null after a successful run
 *
 * `complete` and `error` events do not exist; completion is signalled by
 * the service returning a `LintScanResult`, and detector failures only
 * emit `console.warn`. Those belong to RunEnvelope (T3+), not to a seed.
 */
export interface VaultLintProgressEvent {
	phase: 'init' | 'scanning' | 'cleared';
	detector?: string;
	processed?: number;
	total?: number;
}

/**
 * Output produced by the current runtime.
 *
 * Aliased to `LintScanResult` on purpose: the runtime returns the full
 * scan result (every finding with its metadata). Narrowing this to a
 * smaller projection is a future task; the T1 contract refuses to
 * misrepresent what the runtime currently emits.
 */
export type VaultLintCapabilityOutput = LintScanResult;

// -- dependency inventory ----------------------------------------------------

export interface AppContextResolution {
	readonly site: string;
	readonly access: string;
	readonly purpose: string;
	readonly optional: boolean;
}

export interface SingletonResolution {
	readonly site: string;
	readonly singleton: string;
	readonly purpose: string;
}

export type VaultLintSideEffectKind =
	| 'vault.read'
	| 'sqlite.write'
	| 'sqlite.read'
	| 'ui.store.write'
	| 'log.warn'
	| 'template.read'
	| 'crypto.random';

export interface VaultLintSideEffect {
	readonly kind: VaultLintSideEffectKind;
	readonly site: string;
	readonly target: string;
}

export interface VaultLintConsumer {
	readonly site: string;
	readonly mode: 'runFullScan' | 'initRegistry' | 'runManualScan' | 'loadLatestScan';
}

// `runManualScan` is the T4 mode: the consumer drives a manual scan
// through `runVaultLintManualScan` (Vault Lint RunEnvelope runner) rather
// than calling `VaultLintService.getInstance().runFullScan()` directly.
// The underlying service method is still the one that does work; the
// mode just records WHICH entry point a consumer is wired to so the
// contract does not silently lie about the post-T4 runtime.

export interface VaultLintDependencyInventory {
	readonly capabilityId: VaultLintCapabilityId;
	// Free-form: the post-T5 layout has no UI store; older milestones used
	// 'useVaultLintStore + VaultLintRepo (split)'. Keeping this as `string`
	// avoids freezing the literal so future closure waves can update the
	// description without a contract type change.
	readonly stateOwner: string;
	readonly appContextResolutions: ReadonlyArray<AppContextResolution>;
	readonly singletonResolutions: ReadonlyArray<SingletonResolution>;
	readonly sideEffects: ReadonlyArray<VaultLintSideEffect>;
	readonly consumers: ReadonlyArray<VaultLintConsumer>;
	readonly knownDimensions: ReadonlyArray<LintDimension>;
}

export const VAULT_LINT_CURRENT_DEPENDENCIES: VaultLintDependencyInventory = {
	capabilityId: VAULT_LINT_CAPABILITY_ID,
	// T6 closure: the engine no longer resolves its own dependencies.
	// `VaultLintService` is a plain class that receives `VaultLintPorts`
	// through its constructor; the app-layer `composeVaultLintRuntime`
	// wires real adapters at boot and `setVaultLintRuntime` binds the
	// instance for consumers. Persistence still lives in `VaultLintRepo`
	// (sqlite); the central runtime binding replaces the old singleton.
	stateOwner: 'VaultLintRepo (persistence) + central VaultLintRuntime binding',
	// T6 retired: the engine no longer resolves AppContext. The two
	// remaining resolutions live in app-layer adapters
	// (`ObsidianVaultLintConfigAdapter`, `ObsidianVaultLintVaultAdapter`).
	// They are listed here so the contract still describes WHERE
	// AppContext is reached, even though it is no longer inside the
	// engine itself.
	appContextResolutions: [
		{
			site: 'src/app/lint/ObsidianVaultLintConfigAdapter.ts',
			access: 'AppContext.getInstance().manager.getTemplateManager()',
			purpose: 'load optional config-vault-lint template; falls back to DEFAULT_CONFIG',
			optional: true,
		},
		{
			site: 'src/app/lint/ObsidianVaultLintVaultAdapter.ts',
			access: 'AppContext.getInstance().app.vault.getMarkdownFiles().length',
			purpose: 'expose markdown file count to the engine via VaultLintVaultPort',
			optional: false,
		},
	],
	singletonResolutions: [
		// T6 retired: `VaultLintService.getInstance()` no longer exists;
		// the engine is constructed once by `composeVaultLintRuntime`
		// and stored behind `getVaultLintRuntime()`.
		// T6 retired: `SignalRegistry.getInstance()` no longer exists;
		// detectors live in a per-runtime `InMemoryDetectorRegistry`
		// instance constructed at boot.
		{
			site: 'src/service/lint/VaultLintRuntime.ts',
			singleton: 'getVaultLintRuntime() / setVaultLintRuntime()',
			purpose: 'central, fail-loud Vault Lint runtime binding (transitional, single point of contact)',
		},
		{
			site: 'src/app/lint/composeVaultLintRuntime.ts',
			singleton: 'sqliteStoreManager.getVaultLintRepo()',
			purpose: 'one-shot at boot: hand the sqlite repo to the persistence adapter',
		},
	],
	sideEffects: [
		{ kind: 'vault.read', site: 'ObsidianVaultLintVaultAdapter.getMarkdownFileCount', target: 'app.vault.getMarkdownFiles().length' },
		{ kind: 'template.read', site: 'ObsidianVaultLintConfigAdapter.loadConfig', target: 'ConfigTemplateId.VaultLintConfig' },
		{ kind: 'sqlite.read', site: 'SqliteVaultLintPersistenceAdapter.loadActiveDismissals', target: 'VaultLintRepo.loadActiveDismissals' },
		{ kind: 'sqlite.read', site: 'SqliteVaultLintPersistenceAdapter.getLastFullScanTimestamp', target: 'VaultLintRepo.getLastFullScanTimestamp' },
		{ kind: 'sqlite.read', site: 'SqliteVaultLintPersistenceAdapter.loadLatestScan', target: 'VaultLintRepo.loadLatestScan' },
		{ kind: 'sqlite.write', site: 'SqliteVaultLintPersistenceAdapter.saveScanResult', target: 'VaultLintRepo.saveScanResult' },
		{ kind: 'log.warn', site: 'VaultLintService.runFullScan', target: 'console.warn (detector failure)' },
		{ kind: 'crypto.random', site: 'DefaultVaultLintIdFactory.nextScanId', target: 'crypto.randomUUID (scanId)' },
	],
	consumers: [
		{ site: 'src/app/commands/PeakCommandActions.ts:openVaultXRay', mode: 'runManualScan' },
		{ site: 'src/ui/view/vault-lint/VaultXRayPanel.tsx', mode: 'runManualScan' },
		{ site: 'src/service/copilot/vault/VaultDigestService.ts', mode: 'loadLatestScan' },
	],
	knownDimensions: ['structural', 'content', 'temporal', 'semantic', 'tags'],
} as const;
