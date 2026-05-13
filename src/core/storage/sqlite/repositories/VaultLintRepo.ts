import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import type { LintScanResult, LintFinding, LintDismissal, LintTrendPoint, LintSignalId } from '@/service/lint/types';

const FINDING_INSERT_BATCH_SIZE = 80;

function persistedFindingId(scanId: string, findingId: string, index: number): string {
	return `${scanId}:${index}:${findingId}`;
}

export class VaultLintRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/** Persist a completed scan and its findings atomically. */
	async saveScanResult(result: LintScanResult): Promise<void> {
		await this.db.transaction().execute(async (trx) => {
			await trx
				.insertInto('vault_lint_scan')
				.values({
					id: result.id,
					scan_type: result.scanType,
					started_at: result.startedAt,
					completed_at: result.completedAt,
					duration_ms: result.durationMs,
					total_notes: result.totalNotes,
					health_score: result.healthScore,
					dim_structural: result.dimensionScores.structural,
					dim_content: result.dimensionScores.content,
					dim_temporal: result.dimensionScores.temporal,
					dim_semantic: result.dimensionScores.semantic,
					dim_tags: result.dimensionScores.tags,
					signal_counts: JSON.stringify(result.signalCounts),
					config_hash: null,
				})
				.execute();

			for (let i = 0; i < result.findings.length; i += FINDING_INSERT_BATCH_SIZE) {
				const batchStart = i;
				const batch = result.findings.slice(batchStart, batchStart + FINDING_INSERT_BATCH_SIZE);
				if (batch.length === 0) continue;

				await trx
					.insertInto('vault_lint_finding')
					.values(batch.map((f, batchIndex) => ({
						id: persistedFindingId(result.id, f.id, batchStart + batchIndex),
						scan_id: result.id,
						signal_id: f.signalId,
						severity: f.severity,
						file_path: f.filePath,
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
		});
	}

	/** Load the latest completed scan with its findings. */
	async loadLatestScan(): Promise<LintScanResult | null> {
		const row = await this.db
			.selectFrom('vault_lint_scan')
			.selectAll()
			.where('completed_at', 'is not', null)
			.orderBy('started_at', 'desc')
			.limit(1)
			.executeTakeFirst();

		if (!row) return null;
		const findings = await this.loadFindingsByScanId(row.id);
		return this.rowToScanResult(row, findings);
	}

	/** Load findings for a scan id. */
	async loadFindingsByScanId(scanId: string): Promise<LintFinding[]> {
		const rows = await this.db
			.selectFrom('vault_lint_finding')
			.selectAll()
			.where('scan_id', '=', scanId)
			.where('status', '=', 'open')
			.execute();

		return rows.map(r => ({
			id: r.id,
			signalId: r.signal_id as LintSignalId,
			severity: r.severity as LintFinding['severity'],
			filePath: r.file_path,
			title: r.title,
			description: r.description ?? '',
			fixActions: JSON.parse(r.fix_actions),
			metadata: JSON.parse(r.metadata),
			status: r.status as LintFinding['status'],
		}));
	}

	/** Load trend history (last N completed scans, no findings). */
	async loadTrendHistory(limit = 30): Promise<LintTrendPoint[]> {
		const rows = await this.db
			.selectFrom('vault_lint_scan')
			.selectAll()
			.where('completed_at', 'is not', null)
			.where('health_score', 'is not', null)
			.orderBy('started_at', 'desc')
			.limit(limit)
			.execute();

		return rows.reverse().map(r => ({
			timestamp: r.started_at,
			healthScore: r.health_score!,
			dimensions: {
				structural: r.dim_structural ?? 0,
				content: r.dim_content ?? 0,
				temporal: r.dim_temporal ?? 0,
				semantic: r.dim_semantic ?? 0,
				tags: r.dim_tags ?? 0,
			},
			totalFindings: 0,
		}));
	}

	/** Load active dismissals (not snoozed past snooze_until). */
	async loadActiveDismissals(): Promise<LintDismissal[]> {
		const now = Date.now();
		const rows = await this.db
			.selectFrom('vault_lint_dismissal')
			.selectAll()
			.where(eb => eb.or([
				eb('snooze_until', 'is', null),
				eb('snooze_until', '>', now),
			]))
			.execute();

		return rows.map(r => ({
			signalId: r.signal_id as LintSignalId,
			filePath: r.file_path,
			dismissedAt: r.dismissed_at,
			reason: r.reason as LintDismissal['reason'],
			snoozeUntil: r.snooze_until ?? undefined,
		}));
	}

	/** Persist a new dismissal (upsert). */
	async upsertDismissal(d: LintDismissal): Promise<void> {
		await this.db
			.insertInto('vault_lint_dismissal')
			.values({
				signal_id: d.signalId,
				file_path: d.filePath,
				dismissed_at: d.dismissedAt,
				reason: d.reason ?? null,
				snooze_until: d.snoozeUntil ?? null,
			})
			.onConflict(oc => oc.columns(['signal_id', 'file_path']).doUpdateSet({
				dismissed_at: d.dismissedAt,
				reason: d.reason ?? null,
				snooze_until: d.snoozeUntil ?? null,
			}))
			.execute();
	}

	/** Mark a finding as fixed. */
	async markFindingFixed(findingId: string): Promise<void> {
		await this.db
			.updateTable('vault_lint_finding')
			.set({ status: 'fixed', fixed_at: Date.now() })
			.where('id', '=', findingId)
			.execute();
	}

	/** Get the timestamp of the last completed full scan. */
	async getLastFullScanTimestamp(): Promise<number | null> {
		const row = await this.db
			.selectFrom('vault_lint_scan')
			.select('started_at')
			.where('scan_type', '=', 'full')
			.where('completed_at', 'is not', null)
			.orderBy('started_at', 'desc')
			.limit(1)
			.executeTakeFirst();
		return row?.started_at ?? null;
	}

	private rowToScanResult(
		row: DbSchema['vault_lint_scan'],
		findings: LintFinding[],
	): LintScanResult {
		return {
			id: row.id,
			scanType: row.scan_type as 'full' | 'incremental',
			startedAt: row.started_at,
			completedAt: row.completed_at!,
			durationMs: row.duration_ms ?? 0,
			totalNotes: row.total_notes,
			healthScore: row.health_score ?? 0,
			dimensionScores: {
				structural: row.dim_structural ?? 0,
				content: row.dim_content ?? 0,
				temporal: row.dim_temporal ?? 0,
				semantic: row.dim_semantic ?? 0,
				tags: row.dim_tags ?? 0,
			},
			findings,
			signalCounts: JSON.parse(row.signal_counts),
		};
	}
}
