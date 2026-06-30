// T6/T6R Vault Lint engine — plain class, ports DI, no service locator.
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
// T6R moves the typed config defaults out of this file. The engine
// imports the compiled fallback from `./config/VaultLintDefaults`; the
// service is responsible for behavior only.
//
// Implements `VaultLintRuntime` so the app-owned `AppRuntimeRegistry`
// can store this instance and consumers can reach it via the registry.

import { computeHealthScore } from './HealthScoreEngine';
import type {
	LintFinding,
	LintScanContext,
	LintScanResult,
} from './types';
import { mergeVaultLintConfig } from './config/VaultLintDefaults';
import type { VaultLintPorts } from '@/core/ports/VaultLintPorts';
import type { VaultLintRuntime } from './VaultLintRuntime';
import type { VaultLintRunCallbacks } from './VaultLintRun';

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
		const activeConfig = mergeVaultLintConfig(loaded);

		// Defense in depth: composition already initialized the registry
		// at boot, but a test that constructs the service with a bare
		// registry can rely on this call to populate it.
		detectorRegistry.ensureInitialized(activeConfig);

		const totalNotes = vault.getMarkdownFileCount();

		const dismissalList = await persistence.loadActiveDismissals();
		const dismissals = new Map(dismissalList.map((d) => [`${d.signalId}:${d.filePath}`, d]));

		const lastScanTimestamp = await persistence.getLastFullScanTimestamp();
		// T7: detectorContext is the single surface signals/*.ts use
		// to read the vault, metadata cache, graph nodes, and semantic
		// neighbors. Composition wires the Obsidian/sqlite adapter at
		// boot; tests inject a fake.
		const context: LintScanContext = {
			totalNotes,
			allNodeIds: [],
			lastScanTimestamp,
			dismissals,
			detectorContext: this.ports.detectorContext,
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
