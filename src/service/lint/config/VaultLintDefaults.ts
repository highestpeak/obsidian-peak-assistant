// T6R: Vault Lint compiled config fallback.
//
// This file owns the typed default `VaultLintConfig` that the engine
// uses when `templates/config/vault-lint-config.json` is missing,
// fails to parse, or returns `null`. It is the project's first
// concrete application of the configuration defaults governance rule
// (see `docs/superpowers/refactor-ops/config-defaults-governance.md`).
//
// Editable source (owner-facing, JSON):
//   templates/config/vault-lint-config.json
//
// Compiled fallback (this file):
//   src/service/lint/config/VaultLintDefaults.ts
//
// Loader / adapter:
//   src/app/lint/ObsidianVaultLintConfigAdapter.ts
//   -> TemplateManager.loadJson(ConfigTemplateId.VaultLintConfig)
//
// Drift guard:
//   test/vault-lint-defaults.test.ts — asserts every key in the
//   compiled fallback has the same value as the JSON template, so
//   tuning the JSON without updating the fallback (or vice versa)
//   surfaces as a failing test rather than silent divergence.
//
// Why this is not in `src/core/constant.ts`:
//   The Vault Lint config table is a large, domain-specific tuning
//   knob — `constant.ts` is reserved for small, cross-cutting,
//   runtime-immutable constants.

import type { VaultLintConfig } from '../types';

/**
 * Compiled fallback for `VaultLintConfig`. Mirrors the matching
 * entries in `templates/config/vault-lint-config.json`. When the
 * template loader returns `null` (file missing / parse error /
 * adapter throws), the engine merges its partial overrides on top
 * of this object.
 *
 * The template JSON may contain additional keys that the current
 * `VaultLintConfig` type does not expose (e.g.
 * `duplicateMinTitleJaccard`, `decayingBridgeDays`,
 * `recentDriftActiveDays`, `tagExplosionMultiplier`); those are
 * reserved for future detectors and intentionally not declared in
 * the fallback. The drift guard test only enforces the
 * intersection: values present in the fallback must equal values
 * present in the JSON.
 */
export const DEFAULT_VAULT_LINT_CONFIG: VaultLintConfig = {
	dimensionWeights: {
		structural: 0.30,
		content: 0.20,
		temporal: 0.15,
		semantic: 0.25,
		tags: 0.10,
	},
	thresholds: {
		stubMaxChars: 100,
		oversizedMinWords: 5000,
		duplicateMinSimilarity: 0.92,
		duplicateMinTitleJaccard: 0.50,
		staleHubDays: 180,
		staleHubMinPageRankPercentile: 75,
		softOrphanMaxDegree: 2,
		phantomNodeMinReferences: 3,
		islandClusterMaxSize: 5,
		missingBacklinkMinSimilarity: 0.70,
		tagExplosionMultiplier: 5,
	},
	scan: {
		incrementalDebounceMs: 30000,
		fullScanIntervalHours: 168,
	},
};

/**
 * Merge a partial Vault Lint config on top of the compiled fallback.
 * Exposed so the engine and tests use a single, well-tested merge
 * routine instead of repeating spread semantics inline.
 */
export function mergeVaultLintConfig(
	partial: Partial<VaultLintConfig> | null,
): VaultLintConfig {
	if (partial === null) return DEFAULT_VAULT_LINT_CONFIG;
	return {
		...DEFAULT_VAULT_LINT_CONFIG,
		...partial,
		thresholds: {
			...DEFAULT_VAULT_LINT_CONFIG.thresholds,
			...(partial.thresholds ?? {}),
		},
		scan: {
			...DEFAULT_VAULT_LINT_CONFIG.scan,
			...(partial.scan ?? {}),
		},
		dimensionWeights: {
			...DEFAULT_VAULT_LINT_CONFIG.dimensionWeights,
			...(partial.dimensionWeights ?? {}),
		},
	};
}
