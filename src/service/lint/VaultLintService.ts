import { randomUUID } from 'crypto';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { SignalRegistry } from './SignalRegistry';
import { computeHealthScore } from './HealthScoreEngine';
import { orphanDetector, brokenLinkDetector } from './signals/structural';
import { emptyDetector, buildContentDetectors } from './signals/content';
import { untaggedDetector } from './signals/tags';
import type { VaultLintConfig, LintScanResult, LintFinding, LintScanContext } from './types';
import { useVaultLintStore } from '@/ui/store/vaultLintStore';

const DEFAULT_CONFIG: VaultLintConfig = {
	dimensionWeights: { structural: 0.30, content: 0.20, temporal: 0.15, semantic: 0.25, tags: 0.10 },
	thresholds: {
		stubMaxChars: 100, oversizedMinWords: 5000, duplicateMinSimilarity: 0.92,
		staleHubDays: 180, staleHubMinPageRankPercentile: 75,
		softOrphanMaxDegree: 2, phantomNodeMinReferences: 3,
		islandClusterMaxSize: 5,
	},
	scan: { incrementalDebounceMs: 30000, fullScanIntervalHours: 168 },
};

export class VaultLintService {
	private static instance: VaultLintService | null = null;
	private config: VaultLintConfig = DEFAULT_CONFIG;
	private registryInitialized = false;

	static getInstance(): VaultLintService {
		if (!VaultLintService.instance) VaultLintService.instance = new VaultLintService();
		return VaultLintService.instance;
	}

	/** Register all built-in detectors. Call once at plugin startup. */
	initRegistry(): void {
		if (this.registryInitialized) return;
		const registry = SignalRegistry.getInstance();
		// Phase 1 detectors
		registry.register(orphanDetector);
		registry.register(brokenLinkDetector);
		registry.register(emptyDetector);
		// buildContentDetectors returns stub detector — register it
		for (const d of buildContentDetectors(this.config)) {
			if (d.id !== 'C-EMPTY') registry.register(d); // C-EMPTY already registered above
		}
		registry.register(untaggedDetector);
		this.registryInitialized = true;
	}

	/** Load config from template file, fall back to DEFAULT_CONFIG. */
	async loadConfig(): Promise<void> {
		try {
			const tm = AppContext.getInstance().manager.getTemplateManager?.();
			if (tm) {
				const parsed = await tm.loadJson<Partial<VaultLintConfig>>(ConfigTemplateId.VaultLintConfig);
				if (parsed) {
					this.config = {
						...DEFAULT_CONFIG,
						...parsed,
						thresholds: { ...DEFAULT_CONFIG.thresholds, ...(parsed.thresholds ?? {}) },
						scan: { ...DEFAULT_CONFIG.scan, ...(parsed.scan ?? {}) },
						dimensionWeights: { ...DEFAULT_CONFIG.dimensionWeights, ...(parsed.dimensionWeights ?? {}) },
					};
				}
			}
		} catch {
			// Template not found — use defaults
		}
	}

	/** Run a full scan: all non-LLM detectors in parallel. */
	async runFullScan(): Promise<LintScanResult> {
		const store = useVaultLintStore.getState();
		store.setScanProgress({ detector: 'init', processed: 0, total: 0 });

		await this.loadConfig();

		const lintRepo = sqliteStoreManager.getVaultLintRepo();
		const app = AppContext.getInstance().app;
		const files = app.vault.getMarkdownFiles();
		const totalNotes = files.length;

		// Load dismissals
		const dismissalList = await lintRepo.loadActiveDismissals();
		const dismissals = new Map(dismissalList.map(d => [`${d.signalId}:${d.filePath}`, d]));

		const lastScanTimestamp = await lintRepo.getLastFullScanTimestamp();
		const context: LintScanContext = {
			totalNotes,
			allNodeIds: [],
			lastScanTimestamp,
			dismissals,
		};

		const detectors = SignalRegistry.getInstance().getNonLlm();
		const startedAt = Date.now();

		store.setScanProgress({ detector: 'scanning', processed: 0, total: detectors.length });

		// Run all non-LLM detectors in parallel
		const findingArrays = await Promise.all(
			detectors.map(d => d.detect(context).catch(err => {
				console.warn(`[VaultLintService] detector ${d.id} failed:`, err);
				return [] as LintFinding[];
			}))
		);

		const findings = findingArrays.flat();
		const completedAt = Date.now();

		const { healthScore, dimensionScores } = computeHealthScore(findings, totalNotes, this.config);

		// Build signal counts
		const signalCounts: LintScanResult['signalCounts'] = {};
		for (const f of findings) {
			signalCounts[f.signalId] = (signalCounts[f.signalId] ?? 0) + 1;
		}

		const result: LintScanResult = {
			id: randomUUID(),
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

		await lintRepo.saveScanResult(result);

		const trend = await lintRepo.loadTrendHistory(30);
		store.setScanResult(result, trend);
		store.setScanProgress(null);

		return result;
	}
}
