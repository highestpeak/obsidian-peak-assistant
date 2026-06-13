// T6 Vault Lint Ports — narrow, capability-shaped dependency contracts.
//
// Before T6 the `VaultLintService` reached out to four service locators
// at runtime: `AppContext.getInstance()` (twice — TemplateManager + Vault),
// `sqliteStoreManager.getVaultLintRepo()`, `SignalRegistry.getInstance()`,
// and `crypto.randomUUID()` / `Date.now()` baked into the engine. T6
// hides each of those behind a narrow port so the engine becomes a
// plain class that takes its dependencies through its constructor.
//
// Discipline:
//   - Ports must not pass `AppContext` itself. Each port describes the
//     ONE capability the engine actually needs, named in the engine's
//     vocabulary, not in the app shell's.
//   - This file may import only types from `../types`. No runtime
//     singleton, no app-shell import, no UI import. The companion test
//     `test/vault-lint-service-ports.test.ts` enforces that by source
//     scan.
//   - Adapter implementations live in `../runtime/` (pure adapters,
//     stay in service) or in `src/app/lint/` (Obsidian / sqlite-bound
//     adapters that may reach app singletons).
//   - The runtime composition (`src/app/lint/composeVaultLintRuntime`)
//     is the ONE place that wires app singletons into ports. The
//     service must never reach across.

import type {
	LintDismissal,
	LintScanResult,
	LintSignalDetector,
	VaultLintConfig,
} from '../types';

/**
 * Loads the (optional) config-vault-lint template and returns the
 * parsed partial. Returns `null` when the template is missing or fails
 * to parse — the engine merges with `DEFAULT_VAULT_LINT_CONFIG` and
 * still runs.
 */
export interface VaultLintConfigPort {
	loadConfig(): Promise<Partial<VaultLintConfig> | null>;
}

/**
 * Reports vault-shape information the engine needs without exposing
 * the full Obsidian `App.vault` surface. Today the engine only needs
 * the markdown file COUNT (`totalNotes`); growing this port requires
 * showing real demand from the engine, not from speculation.
 */
export interface VaultLintVaultPort {
	getMarkdownFileCount(): number;
}

/**
 * Persistence surface for scan results, dismissals, and timestamps.
 * The engine never sees `sqliteStoreManager` or `Kysely` directly.
 */
export interface VaultLintPersistencePort {
	loadActiveDismissals(): Promise<LintDismissal[]>;
	getLastFullScanTimestamp(): Promise<number | null>;
	saveScanResult(result: LintScanResult): Promise<void>;
	loadLatestScan(): Promise<LintScanResult | null>;
}

/**
 * Holds the built-in detectors for the engine. `ensureInitialized` is
 * idempotent — the runtime composition calls it once at boot with
 * `DEFAULT_VAULT_LINT_CONFIG`, but engine code may call it again before
 * `runFullScan` as a defense.
 */
export interface VaultLintDetectorRegistryPort {
	ensureInitialized(config: VaultLintConfig): void;
	getNonLlm(): LintSignalDetector[];
}

/** Mints a scan id. Tests inject a deterministic sequence. */
export interface VaultLintIdPort {
	nextScanId(): string;
}

/** Provides monotonic timestamps. Tests inject a fake clock. */
export interface VaultLintClockPort {
	now(): number;
}

/**
 * Aggregate handed to `new VaultLintService(ports)`. Keeping it as a
 * single object is intentional: the engine only depends on the bag,
 * which makes constructor signature changes localized.
 */
export interface VaultLintPorts {
	readonly config: VaultLintConfigPort;
	readonly vault: VaultLintVaultPort;
	readonly persistence: VaultLintPersistencePort;
	readonly detectorRegistry: VaultLintDetectorRegistryPort;
	readonly idFactory: VaultLintIdPort;
	readonly clock: VaultLintClockPort;
}
