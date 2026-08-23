import type { ReviewPreparationSession } from '@/core/types/review-preparation';
import type { VaultDiscoverySession } from '@/core/types/vault-discovery';
import type { ScanStageLedger, VaultScanRunState, VaultScanStageId } from '@/core/types/vault-scan';

export const DEFAULT_SCAN_PROGRESS_WEIGHTS: Readonly<Record<VaultScanStageId, number>> = Object.freeze({
	discover: 15,
	index: 40,
	ai: 33,
	'prepare-review': 10,
	publish: 2,
});

export function terminalFraction(stage: ScanStageLedger): number {
	if (stage.status === 'completed' || stage.status === 'completed-with-attention') return 1;
	if (!stage.totalUnits || stage.totalUnits <= 0) return 0;
	return Math.min(1, Math.max(0, stage.terminalUnits / stage.totalUnits));
}

export function discoveryFraction(session: VaultDiscoverySession | null): number {
	if (!session) return 0;
	if (session.status === 'completed' || session.status === 'completed-with-attention') return 1;
	const accounted = new Set([
		...session.evidence.inspectedRefs,
		...session.evidence.excludedRefs.map((entry) => entry.ref),
		...session.evidence.failedRefs.map((entry) => entry.ref),
	]).size;
	const eligible = session.evidence.eligibleRefs.length;
	const coverage = eligible > 0 ? accounted / eligible : 1;
	const objectives = session.objectiveIds.length > 0 ? session.terminalObjectiveIds.length / session.objectiveIds.length : 1;
	const candidates = session.candidateDenominator && session.candidateDenominator > 0
		? session.terminalCandidateCount / session.candidateDenominator
		: 0;
	const noHighPriorityFrontier = Object.values(session.investigations).every((item) => (
		!['open', 'gathering', 'testing'].includes(item.state) || item.priority < 0.5
	));
	const noUnverifiedFinding = Object.values(session.findings).every((finding) => finding.state !== 'candidate');
	const convergence = (noHighPriorityFrontier ? 1 / 3 : 0)
		+ (noUnverifiedFinding ? 1 / 3 : 0)
		+ (session.stableCycles >= 3 ? 1 / 3 : 0);
	const completion = session.completionReceiptId ? 1 : 0;
	const evidenceBoundary = session.evidence.manifestRef ? 1 : 0;
	return Math.min(1, (evidenceBoundary * 10 + objectives * 25 + coverage * 25 + candidates * 20 + convergence * 15 + completion * 5) / 100);
}

export function reviewPreparationFraction(session: ReviewPreparationSession | null): number {
	if (!session || session.planFrozenAt === null) return 0;
	if (session.status === 'completed' || session.status === 'completed-with-attention') return 1;
	const atomTotal = session.atoms.length;
	const atomFraction = atomTotal > 0 ? session.dispositions.length / atomTotal : 1;
	const planFraction = session.jobs.length > 0 || atomTotal === 0 ? 1 : 0;
	const jobFraction = session.jobs.length > 0
		? session.jobs.filter((job) => ['completed', 'attention'].includes(job.status)).length / session.jobs.length
		: 1;
	const plannedArtifacts = session.jobs.filter((job) => job.status !== 'attention').length;
	const artifactFraction = plannedArtifacts > 0 ? session.artifacts.length / plannedArtifacts : 1;
	const frozen = session.phase === 'freezing' && session.status === 'running' ? 0.5 : 0;
	return Math.min(1, (atomFraction * 20 + planFraction * 15 + jobFraction * 30 + artifactFraction * 25 + frozen * 10) / 100);
}

export function calculateOverallPercent(
	state: VaultScanRunState,
	discovery: VaultDiscoverySession | null,
	review: ReviewPreparationSession | null,
): number {
	const weights = state.frozenPlan?.progressPlan.weights ?? DEFAULT_SCAN_PROGRESS_WEIGHTS;
	const fractions: Record<VaultScanStageId, number> = {
		discover: terminalFraction(state.stages.discover),
		index: terminalFraction(state.stages.index),
		ai: discoveryFraction(discovery),
		'prepare-review': reviewPreparationFraction(review),
		publish: terminalFraction(state.stages.publish),
	};
	const computed = Math.floor((Object.keys(weights) as VaultScanStageId[]).reduce((sum, stageId) => (
		sum + weights[stageId] * fractions[stageId]
	), 0));
	return Math.max(state.overallPercent, Math.min(100, computed));
}
