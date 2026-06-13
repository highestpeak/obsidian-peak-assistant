// T6/T7 Vault Lint Ports — narrow, capability-shaped dependency contracts.
//
// Before T6 the `VaultLintService` and its detectors reached out to
// service locators at runtime (`AppContext.getInstance()` twice,
// `sqliteStoreManager.getVaultLintRepo()`, the deleted SignalRegistry,
// and `app.vault` / `app.metadataCache` inside detectors). T6 hid the
// engine's own dependencies behind narrow ports. T7 extends the same
// discipline to DETECTOR-side reads: a new `VaultLintDetectorContextPort`
// is the single, fakeable surface through which signals/* talk to the
// vault, metadata cache, graph storage, and semantic search.
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

// ---------------------------------------------------------------------------
// T7: Detector context port
// ---------------------------------------------------------------------------
//
// The detector context is the narrow surface signals/*.ts use to read
// the vault, metadata cache, graph nodes/edges, and semantic neighbors.
// Before T7 each detector resolved those itself via `AppContext` /
// `sqliteStoreManager` / `getSemanticNeighbors`; after T7 the runtime
// composition wires ONE adapter and the engine threads it into the
// `LintScanContext` so every detector consumes the same fakeable port.
//
// Discipline mirrors the engine ports above:
//   - Methods are named in the detector's vocabulary (markdown file,
//     tags, unresolved link, hard orphan, graph node, semantic
//     neighbor) — not in Obsidian's (`TFile`, `MetadataCache`) and not
//     in sqlite's (`MobiusEdgeRepo`).
//   - Return types are plain serializable shapes so detector tests can
//     fake them without booting Obsidian. The original `GraphNode` /
//     `TagCache` / `TFile` types stay inside the adapter.

/** Narrow file reference returned by `listMarkdownFiles`. */
export interface VaultLintDetectorFileRef {
	readonly path: string;
	readonly basename: string;
}

/** Tags attached to a markdown file, classified by their source. */
export interface VaultLintDetectorTagInfo {
	readonly inlineTags: readonly string[];
	readonly frontmatterTags: readonly string[];
}

/**
 * Graph node projection a detector cares about. Mirrors the subset of
 * `GraphNode` (`@/core/storage/sqlite/repositories/MobiusNodeRepo.ts`)
 * actually read by current Vault Lint detectors. Adapters do the
 * projection at the boundary; detectors never see the raw DB row.
 */
export interface VaultLintDetectorGraphNode {
	readonly id: string;
	readonly label: string;
	readonly type: string;
	readonly attributes: string | null;
}

/**
 * Semantic neighbor returned by `getSemanticNeighbors`. `similarity`
 * is the formatted percentage string the existing pipeline uses
 * (`"95.0%"`) so detector logic stays byte-identical to pre-T7.
 */
export interface VaultLintDetectorSemanticNeighbor {
	readonly id: string;
	readonly label: string;
	readonly type: string;
	readonly attributes: string | null;
	readonly similarity: string;
}

/**
 * Single dependency surface for detectors.
 *
 * Today this is shaped to cover the four T7-closure callers:
 *   - `signals/content.ts`: list + read markdown files;
 *   - `signals/tags.ts`: list + tag classification;
 *   - `signals/structural.ts` (broken-link): unresolved links;
 *   - `signals/structural.ts` (orphan): hard orphans, node lookup,
 *     indexed-note classification, semantic neighbors.
 *
 * Growing it requires evidence from a real detector, not speculation.
 */
export interface VaultLintDetectorContextPort {
	listMarkdownFiles(): VaultLintDetectorFileRef[];
	readMarkdownFile(path: string): Promise<string>;
	getTags(path: string): VaultLintDetectorTagInfo;
	getUnresolvedLinks(): Record<string, Record<string, number>>;
	getHardOrphans(limit: number): Promise<string[]>;
	getNodesByIds(
		ids: readonly string[],
	): Promise<Map<string, VaultLintDetectorGraphNode>>;
	isIndexedNoteNodeType(type: string): boolean;
	getSemanticNeighbors(
		nodeId: string,
		limit: number,
		excludeIds: ReadonlySet<string>,
	): Promise<VaultLintDetectorSemanticNeighbor[]>;
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
	readonly detectorContext: VaultLintDetectorContextPort;
	readonly idFactory: VaultLintIdPort;
	readonly clock: VaultLintClockPort;
}
