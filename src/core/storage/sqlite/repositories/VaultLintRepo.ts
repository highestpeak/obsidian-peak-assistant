import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type {
	LintFinding,
	LintDismissal,
	LintScanResult,
	LintDimension,
	LintSignalId,
	LintTrendPoint,
} from '@/service/lint/types';

const INSERT_BATCH_SIZE = 100;

/**
 * CRUD repository for vault_lint_scan, vault_lint_finding, vault_lint_dismissal tables.
 * Operates on vault (search) database only.
 */
export class VaultLintRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	// ─── vault_lint_scan ─────────────────────────────────────────────────

	/**
	 * Insert a new scan row (started but not yet completed). Returns the scan id.
	 */
	async insertScan(scan: {
		id: string;
		scanType: 'full' | 'incremental';
		startedAt: number;
		totalNotes: number;
		configHash?: string;
	}): Promise<string> {
		await this.db
			.insertInto('vault_lint_scan')
			.values({
				id: scan.id,
				scan_type: scan.scanType,
				started_at: scan.startedAt,
				total_notes: scan.totalNotes,
				config_hash: scan.configHash ?? null,
				signal_counts: '{}',
				completed_at: null,
				duration_ms: null,
				health_score: null,
				dim_structural: null,
				dim_content: null,
				dim_temporal: null,
				dim_semantic: null,
				dim_tags: null,
			})
			.execute();
		return scan.id;
	}

	/**
	 * Update a scan row with completion data (scores, duration, signal counts).
	 */
	async completeScan(scanId: string, result: {
		completedAt: number;
		durationMs: number;
		healthScore: number;
		dimensionScores: Record<LintDimension, number>;
		signalCounts: Partial<Record<LintSignalId, number>>;
	}): Promise<void> {
		await this.db
			.updateTable('vault_lint_scan')
			.set({
				completed_at: result.completedAt,
				duration_ms: result.durationMs,
				health_score: result.healthScore,
				dim_structural: result.dimensionScores.structural,
				dim_content: result.dimensionScores.content,
				dim_temporal: result.dimensionScores.temporal,
				dim_semantic: result.dimensionScores.semantic,
				dim_tags: result.dimensionScores.tags,
				signal_counts: JSON.stringify(result.signalCounts),
			})
			.where('id', '=', scanId)
			.execute();
	}

	/**
	 * Get the latest completed scan row, or null if none exist.
	 */
	async getLatestScan(): Promise<DbSchema['vault_lint_scan'] | null> {
		const rows = await this.db
			.selectFrom('vault_lint_scan')
			.selectAll()
			.where('completed_at', 'is not', null)
			.orderBy('started_at', 'desc')
			.limit(1)
			.execute();
		return rows[0] ?? null;
	}

	/**
	 * Get recent completed scans for trend data.
	 */
	async getRecentScans(limit: number): Promise<LintTrendPoint[]> {
		const rows = await this.db
			.selectFrom('vault_lint_scan')
			.selectAll()
			.where('completed_at', 'is not', null)
			.orderBy('started_at', 'desc')
			.limit(limit)
			.execute();
		return rows.map(r => ({
			timestamp: r.started_at,
			healthScore: r.health_score ?? 0,
			dimensions: {
				structural: r.dim_structural ?? 0,
				content: r.dim_content ?? 0,
				temporal: r.dim_temporal ?? 0,
				semantic: r.dim_semantic ?? 0,
				tags: r.dim_tags ?? 0,
			},
			totalFindings: Object.values(
				JSON.parse(r.signal_counts || '{}') as Record<string, number>
			).reduce((a, b) => a + b, 0),
		}));
	}

	// ─── vault_lint_finding ──────────────────────────────────────────────

	/**
	 * Batch-insert findings for a scan. Chunks by INSERT_BATCH_SIZE to respect SQLite variable limits.
	 */
	async insertFindings(scanId: string, findings: LintFinding[]): Promise<void> {
		if (findings.length === 0) return;
		for (let i = 0; i < findings.length; i += INSERT_BATCH_SIZE) {
			const batch = findings.slice(i, i + INSERT_BATCH_SIZE);
			await this.db
				.insertInto('vault_lint_finding')
				.values(batch.map(f => ({
					id: f.id,
					scan_id: scanId,
					signal_id: f.signalId,
					severity: f.severity,
					file_path: f.filePath ?? null,
					title: f.title,
					description: f.description,
					fix_actions: JSON.stringify(f.fixActions),
					metadata: JSON.stringify(f.metadata),
					status: f.status,
					dismissed_at: null,
					fixed_at: null,
				})))
				.execute();
		}
	}

	/**
	 * Get findings for a scan, optionally filtered by status.
	 */
	async getFindingsForScan(scanId: string, status?: 'open' | 'dismissed' | 'fixed'): Promise<LintFinding[]> {
		let query = this.db
			.selectFrom('vault_lint_finding')
			.selectAll()
			.where('scan_id', '=', scanId);

		if (status) {
			query = query.where('status', '=', status);
		}

		const rows = await query.execute();
		return rows.map(r => ({
			id: r.id,
			signalId: r.signal_id as LintSignalId,
			severity: r.severity as LintFinding['severity'],
			filePath: r.file_path,
			title: r.title,
			description: r.description ?? '',
			fixActions: JSON.parse(r.fix_actions) as LintFinding['fixActions'],
			metadata: JSON.parse(r.metadata) as Record<string, unknown>,
			status: r.status as LintFinding['status'],
		}));
	}

	// ─── vault_lint_dismissal ────────────────────────────────────────────

	/**
	 * Get all dismissals as a Map keyed by `${signalId}:${filePath}`.
	 */
	async getDismissals(): Promise<Map<string, LintDismissal>> {
		const rows = await this.db
			.selectFrom('vault_lint_dismissal')
			.selectAll()
			.execute();

		const map = new Map<string, LintDismissal>();
		for (const r of rows) {
			const key = `${r.signal_id}:${r.file_path}`;
			map.set(key, {
				signalId: r.signal_id as LintSignalId,
				filePath: r.file_path,
				dismissedAt: r.dismissed_at,
				reason: r.reason as LintDismissal['reason'],
				snoozeUntil: r.snooze_until ?? undefined,
			});
		}
		return map;
	}

	/**
	 * Upsert a dismissal (insert or replace).
	 */
	async dismissFinding(
		signalId: string,
		filePath: string,
		reason?: 'false_positive' | 'wont_fix' | 'snoozed',
		snoozeUntil?: number,
	): Promise<void> {
		await this.db
			.insertInto('vault_lint_dismissal')
			.values({
				signal_id: signalId,
				file_path: filePath,
				dismissed_at: Date.now(),
				reason: reason ?? null,
				snooze_until: snoozeUntil ?? null,
			})
			.onConflict(oc => oc
				.columns(['signal_id', 'file_path'])
				.doUpdateSet({
					dismissed_at: Date.now(),
					reason: reason ?? null,
					snooze_until: snoozeUntil ?? null,
				})
			)
			.execute();
	}

	/**
	 * Remove a dismissal.
	 */
	async undismiss(signalId: string, filePath: string): Promise<void> {
		await this.db
			.deleteFrom('vault_lint_dismissal')
			.where('signal_id', '=', signalId)
			.where('file_path', '=', filePath)
			.execute();
	}
}
