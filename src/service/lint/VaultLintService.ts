// T6 Vault Lint engine — plain class, ports DI, no service locator.
//
// Before T6 the engine was a singleton (`VaultLintService.getInstance()`)
// that resolved its own dependencies through `AppContext.getInstance()`,
// `sqliteStoreManager`, and `SignalRegistry.getInstance()`. After T6
// every dependency arrives through the constructor as a port; the
// engine itself never touches the Obsidian, sqlite, or detector
// singletons. The runtime composition
// (`src/app/lint/composeVaultLintRuntime.ts`) is the ONE place that
// wires real adapters into the ports; tests construct fake ports
// directly.
//
// Implements `VaultLintRuntime` so the central `getVaultLintRuntime()`
// binding can return this instance directly.

import { computeHealthScore } from './HealthScoreEngine';
import type {
	LintFinding,
	LintScanContext,
	LintScanResult,
	VaultLintConfig,
} from './types';
import type { VaultLintPorts } from './ports/VaultLintPorts';
import type { VaultLintRuntime } from './VaultLintRuntime';
import type { VaultLintRunCallbacks } from './VaultLintRun';

export const DEFAULT_VAULT_LINT_CONFIG: VaultLintConfig = {
	dimensionWeights: { structural: 0.30, content: 0.20, temporal: 0.15, semantic: 0.25, tags: 0.10 },
	thresholds: {
		stubMaxChars: 100, oversizedMinWords: 5000, duplicateMinSimilarity: 0.92,
		staleHubDays: 180, staleHubMinPageRankPercentile: 75,
		softOrphanMaxDegree: 2, phantomNodeMinReferences: 3,
		islandClusterMaxSize: 5,
	},
	scan: { incrementalDebounceMs: 30000, fullScanIntervalHours: 168 },
};

function mergeConfig(partial: Partial<VaultLintConfig> | null): VaultLintConfig {
	if (partial === null) return DEFAULT_VAULT_LINT_CONFIG;
	return {
		...DEFAULT_VAULT_LINT_CONFIG,
		...partial,
		thresholds: { ...DEFAULT_VAULT_LINT_CONFIG.thresholds, ...(partial.thresholds ?? {}) },
		scan: { ...DEFAULT_VAULT_LINT_CONFIG.scan, ...(partial.scan ?? {}) },
		dimensionWeights: {
			...DEFAULT_VAULT_LINT_CONFIG.dimensionWeights,
			...(partial.dimensionWeights ?? {}),
		},
	};
}

export class VaultLintService implements VaultLintRuntime {
	constructor(private readonly ports: VaultLintPorts) {}

	/**
	 * Run a full scan: all non-LLM detectors in parallel. Pure dependency
	 * flow through the constructor ports — no `getInstance()` anywhere
	 * in this method.
	 */
	async runFullScan(callbacks?: VaultLintRunCallbacks): Promise<LintScanResult> {
		const { config, vault, persistence, detectorRegistry, idFactory, clock } = this.ports;

		callbacks?.onProgress?.({ phase: 'init' });

		const loaded = await config.loadConfig().catch(() => null);
		const activeConfig = mergeConfig(loaded);

		// Defense in depth: composition already initialized the registry
		// at boot, but a test that constructs the service with a bare
		// registry can rely on this call to populate it.
		detectorRegistry.ensureInitialized(activeConfig);

		const totalNotes = vault.getMarkdownFileCount();

		const dismissalList = await persistence.loadActiveDismissals();
		const dismissals = new Map(dismissalList.map((d) => [`${d.signalId}:${d.filePath}`, d]));

		const lastScanTimestamp = await persistence.getLastFullScanTimestamp();
		const context: LintScanContext = {
			totalNotes,
			allNodeIds: [],
			lastScanTimestamp,
			dismissals,
		};

		const detectors = detectorRegistry.getNonLlm();
		const startedAt = clock.now();

		callbacks?.onProgress?.({
			phase: 'scanning',
			detector: 'non-llm',
			processed: 0,
			total: detectors.length,
		});

		const findingArrays = await Promise.all(
			detectors.map((detector) =>
				detector.detect(context).catch((err) => {
					console.warn(`[VaultLintService] detector ${detector.id} failed:`, err);
					callbacks?.onDetectorWarning?.(detector.id, err);
					return [] as LintFinding[];
				}),
			),
		);

		const findings = findingArrays.flat();
		const completedAt = clock.now();

		const { healthScore, dimensionScores } = computeHealthScore(
			findings,
			totalNotes,
			activeConfig,
		);

		const signalCounts: LintScanResult['signalCounts'] = {};
		for (const f of findings) {
			signalCounts[f.signalId] = (signalCounts[f.signalId] ?? 0) + 1;
		}

		const result: LintScanResult = {
			id: idFactory.nextScanId(),
			scanType: 'full',
			startedAt,
			completedAt,
			durationMs: completedAt - startedAt,
			totalNotes,
			healthScore,
			dimensionScores,
			findings,
			signalCounts,
		};

		await persistence.saveScanResult(result);

		callbacks?.onProgress?.({ phase: 'cleared' });

		return result;
	}

	loadLatestScan(): Promise<LintScanResult | null> {
		return this.ports.persistence.loadLatestScan();
	}
}
