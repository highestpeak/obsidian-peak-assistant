import { AppContext } from '@/app/context/AppContext';
import { SqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { SignalRegistry } from './SignalRegistry';
import { HealthScoreEngine } from './HealthScoreEngine';
import { OrphanDetector, BrokenLinkDetector } from './signals/structural';
import { EmptyDetector, StubDetector } from './signals/content';
import { UntaggedDetector } from './signals/tags';
import type {
	LintScanContext,
	LintScanResult,
	LintSignalId,
	LintTrendPoint,
	VaultLintConfig,
} from './types';
import { DEFAULT_VAULT_LINT_CONFIG } from './types';

function generateScanId(): string {
	return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Orchestrator: runs signal detectors, computes health score, persists results.
 */
export class VaultLintService {
	private readonly registry: SignalRegistry;
	private readonly config: VaultLintConfig;

	constructor(config?: Partial<VaultLintConfig>) {
		this.config = { ...DEFAULT_VAULT_LINT_CONFIG, ...config };
		this.registry = new SignalRegistry();

		// Register Phase-1 detectors
		this.registry.register(OrphanDetector);
		this.registry.register(BrokenLinkDetector);
		this.registry.register(EmptyDetector);
		this.registry.register(StubDetector);
		this.registry.register(UntaggedDetector);
	}

	async runFullScan(): Promise<LintScanResult> {
		const startedAt = Date.now();
		const scanId = generateScanId();
		const repo = SqliteStoreManager.getInstance().getVaultLintRepo();
		const app = AppContext.getApp();

		// 1. Build scan context
		const files = app.vault.getMarkdownFiles();
		const totalNotes = files.length;
		const allNodes = await SqliteStoreManager.getInstance().getMobiusNodeRepo('vault').getByType('document');
		const allNodeIds = allNodes.map(n => n.id);
		const dismissals = await repo.getDismissals();
		const lastScan = await repo.getLatestScan();
		const lastScanTimestamp = lastScan?.started_at ?? null;

		const context: LintScanContext = {
			totalNotes,
			allNodeIds,
			lastScanTimestamp,
			dismissals,
			config: this.config,
		};

		// 2. Insert in-progress scan row
		await repo.insertScan({
			id: scanId,
			scanType: 'full',
			startedAt,
			totalNotes,
		});

		// 3. Run all non-LLM detectors
		let findings = await this.registry.runAll(context);

		// 4. Filter out dismissed findings (respect snooze expiry)
		const now = Date.now();
		findings = findings.filter(f => {
			const key = `${f.signalId}:${f.filePath ?? 'vault'}`;
			const dismissal = context.dismissals.get(key);
			if (!dismissal) return true;
			// If snoozed and snooze has expired, include the finding
			if (dismissal.reason === 'snoozed' && dismissal.snoozeUntil && dismissal.snoozeUntil < now) {
				return true;
			}
			// Otherwise it's actively dismissed
			f.status = 'dismissed';
			return false;
		});

		// 5. Compute health score
		const engine = new HealthScoreEngine(this.registry.getAllDetectors(), this.config);
		const { healthScore, dimensionScores } = engine.compute(findings, totalNotes);

		// 6. Build signal counts
		const signalCounts: Partial<Record<LintSignalId, number>> = {};
		for (const f of findings) {
			signalCounts[f.signalId] = (signalCounts[f.signalId] ?? 0) + 1;
		}

		// 7. Persist findings
		await repo.insertFindings(scanId, findings);

		// 8. Complete scan
		const completedAt = Date.now();
		await repo.completeScan(scanId, {
			completedAt,
			durationMs: completedAt - startedAt,
			healthScore,
			dimensionScores,
			signalCounts,
		});

		return {
			id: scanId,
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
	}

	async getLatestResult(): Promise<LintScanResult | null> {
		const repo = SqliteStoreManager.getInstance().getVaultLintRepo();
		const scan = await repo.getLatestScan();
		if (!scan) return null;

		const findings = await repo.getFindingsForScan(scan.id);

		const signalCounts: Partial<Record<LintSignalId, number>> = {};
		try {
			const parsed = JSON.parse(scan.signal_counts || '{}');
			Object.assign(signalCounts, parsed);
		} catch { /* ignore parse errors */ }

		return {
			id: scan.id,
			scanType: scan.scan_type as 'full' | 'incremental',
			startedAt: scan.started_at,
			completedAt: scan.completed_at ?? scan.started_at,
			durationMs: scan.duration_ms ?? 0,
			totalNotes: scan.total_notes,
			healthScore: scan.health_score ?? 0,
			dimensionScores: {
				structural: scan.dim_structural ?? 0,
				content: scan.dim_content ?? 0,
				temporal: scan.dim_temporal ?? 0,
				semantic: scan.dim_semantic ?? 0,
				tags: scan.dim_tags ?? 0,
			},
			findings,
			signalCounts,
		};
	}

	async getTrendData(limit = 30): Promise<LintTrendPoint[]> {
		const repo = SqliteStoreManager.getInstance().getVaultLintRepo();
		return repo.getRecentScans(limit);
	}
}
