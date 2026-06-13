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
	readonly mode: 'runFullScan' | 'initRegistry' | 'runManualScan';
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
	// T5 closure: `useVaultLintStore` was deleted; the only persistent
	// state owner is `VaultLintRepo`. UI runtime state is projected from
	// the `RunEnvelope` event trace inside `useVaultLintRunState`, which
	// is per-mount React state and not a long-lived store.
	stateOwner: 'VaultLintRepo (persistence) + per-run RunEnvelope trace',
	appContextResolutions: [
		{
			site: 'VaultLintService.loadConfig',
			access: 'AppContext.getInstance().manager.getTemplateManager()',
			purpose: 'load optional config-vault-lint template; falls back to DEFAULT_CONFIG',
			optional: true,
		},
		{
			site: 'VaultLintService.runFullScan',
			access: 'AppContext.getInstance().app.vault.getMarkdownFiles()',
			purpose: 'enumerate vault markdown files',
			optional: false,
		},
	],
	singletonResolutions: [
		{
			site: 'VaultLintService (file)',
			singleton: 'VaultLintService.getInstance()',
			purpose: 'process-level scan orchestrator',
		},
		{
			site: 'VaultLintService.initRegistry / runFullScan',
			singleton: 'SignalRegistry.getInstance()',
			purpose: 'global detector registry shared across initializations',
		},
		{
			site: 'VaultLintService.runFullScan',
			singleton: 'sqliteStoreManager.getVaultLintRepo()',
			purpose: 'persistence and history of scan results / dismissals',
		},
		// T5 retired: `useVaultLintStore.getState()` is no longer touched
		// by the service. The store file was deleted entirely.
	],
	sideEffects: [
		{ kind: 'vault.read', site: 'VaultLintService.runFullScan', target: 'app.vault.getMarkdownFiles' },
		{ kind: 'template.read', site: 'VaultLintService.loadConfig', target: 'ConfigTemplateId.VaultLintConfig' },
		{ kind: 'sqlite.read', site: 'VaultLintService.runFullScan', target: 'VaultLintRepo.loadActiveDismissals' },
		{ kind: 'sqlite.read', site: 'VaultLintService.runFullScan', target: 'VaultLintRepo.getLastFullScanTimestamp' },
		{ kind: 'sqlite.write', site: 'VaultLintService.runFullScan', target: 'VaultLintRepo.saveScanResult' },
		// T5 retired: `loadTrendHistory` read + `ui.store.write` x2 were
		// removed when the UI store was deleted.
		{ kind: 'log.warn', site: 'VaultLintService.runFullScan', target: 'console.warn (detector failure)' },
		{ kind: 'crypto.random', site: 'VaultLintService.runFullScan', target: 'crypto.randomUUID (scanId)' },
	],
	consumers: [
		{ site: 'src/app/commands/PeakCommandActions.ts:openVaultXRay', mode: 'initRegistry' },
		{ site: 'src/ui/view/vault-lint/VaultXRayPanel.tsx', mode: 'runManualScan' },
		{ site: 'src/service/copilot/vault/VaultDigestService.ts', mode: 'initRegistry' },
	],
	knownDimensions: ['structural', 'content', 'temporal', 'semantic', 'tags'],
} as const;
