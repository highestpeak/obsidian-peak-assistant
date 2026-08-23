import type { BuildIndexLaneState, ScanStageLedger, VaultScanDomainEvent, VaultScanRunState, VaultScanWorkUnitReceipt } from '@/core/types/vault-scan';

interface StagePayload { stage: ScanStageLedger }
interface LanePayload { lane: BuildIndexLaneState }
interface ReceiptPayload { receipt: VaultScanWorkUnitReceipt }

interface FrozenPlanPayload {
	plan: NonNullable<VaultScanRunState['frozenPlan']>;
	ref: NonNullable<VaultScanRunState['frozenPlanRef']>;
}

export function reduceScanEvent(state: VaultScanRunState, event: VaultScanDomainEvent): VaultScanRunState {
	if (event.scanRunId !== state.scanRunId) throw new Error(`Scan event ${event.eventId} belongs to another run.`);
	if (event.sequence <= state.eventSequence) return state;
	if (event.sequence !== state.eventSequence + 1) throw new Error(`Scan event sequence gap: expected ${state.eventSequence + 1}, got ${event.sequence}.`);
	let next = { ...state, eventSequence: event.sequence, updatedAt: event.occurredAt };
	if (event.eventType === 'run.status-changed') {
		const payload = event.payload as { status: VaultScanRunState['status']; error?: string | null };
		next = { ...next, status: payload.status, error: payload.error ?? next.error };
	}
	if (event.eventType === 'run.control-requested') {
		const payload = event.payload as { kind: 'pause' | 'stop' };
		next = { ...next, pauseRequested: payload.kind === 'pause' || next.pauseRequested, stopRequested: payload.kind === 'stop' || next.stopRequested };
	}
	if (event.eventType === 'plan.frozen') {
		const { plan, ref } = event.payload as FrozenPlanPayload;
		next = { ...next, snapshotId: plan.snapshotId, frozenPlan: plan, frozenPlanRef: ref, status: 'discovering' };
	}
	if (event.eventType === 'stage.projected') {
		const { stage } = event.payload as StagePayload;
		next = { ...next, stages: { ...next.stages, [stage.id]: stage } };
	}
	if (event.eventType === 'lane.projected') {
		const { lane } = event.payload as LanePayload;
		next = { ...next, indexLanes: { ...next.indexLanes, [lane.id]: lane } };
	}
	if (event.eventType === 'work.receipt-committed') {
		const { receipt } = event.payload as ReceiptPayload;
		if (!next.receipts.some((candidate) => candidate.workKey === receipt.workKey)) next = { ...next, receipts: [...next.receipts, receipt] };
	}
	return next;
}

export function replayScanEvents(initial: VaultScanRunState, events: readonly VaultScanDomainEvent[]): VaultScanRunState {
	return [...events].sort((left, right) => left.sequence - right.sequence).reduce(reduceScanEvent, initial);
}
