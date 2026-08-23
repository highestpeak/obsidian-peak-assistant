import type { BuildIndexLaneState, ScanStageLedger, VaultScanIndexLayerId, VaultScanRunState, VaultScanStageId } from '@/core/types/vault-scan';

const STAGES: readonly VaultScanStageId[] = ['discover', 'index', 'ai', 'prepare-review', 'publish'];
const LANES: readonly VaultScanIndexLayerId[] = ['full-text', 'embedding', 'ai-enrichment'];

function stage(id: VaultScanStageId): ScanStageLedger {
	return { id, status: 'waiting', terminalUnits: 0, successfulUnits: 0, failedUnits: 0, skippedUnits: 0, totalUnits: null, earnedCredits: 0, message: 'Waiting', startedAt: null, completedAt: null };
}

function lane(id: VaultScanIndexLayerId): BuildIndexLaneState {
	return { id, status: 'waiting', terminal: 0, successful: 0, failed: 0, total: 0, current: [], throughputPerMinute: null, remainingRangeMs: null };
}

export function createVaultScanRunState(scanRunId: string, now: number): VaultScanRunState {
	return {
		schemaVersion: 1,
		scanRunId,
		snapshotId: null,
		status: 'starting',
		activeStageIds: ['discover'],
		inspectionStageId: 'discover',
		frozenPlanRef: null,
		frozenPlan: null,
		stages: Object.fromEntries(STAGES.map((id) => [id, stage(id)])) as Record<VaultScanStageId, ScanStageLedger>,
		indexLanes: Object.fromEntries(LANES.map((id) => [id, lane(id)])) as Record<VaultScanIndexLayerId, BuildIndexLaneState>,
		receipts: [],
		eventSequence: 0,
		overallPercent: 0,
		startedAt: now,
		updatedAt: now,
		completedAt: null,
		pauseRequested: false,
		stopRequested: false,
		warnings: [],
		error: null,
		completedPackageRef: null,
	};
}
