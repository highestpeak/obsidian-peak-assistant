import type { ReviewPreparationSession } from '@/core/types/review-preparation';
import type { VaultDiscoverySession, VaultDiscoveryProgressView } from '@/core/types/vault-discovery';
import type { VaultScanUsage } from '@/core/types/vault-intelligence';
import type { VaultScanRunProjection, VaultScanRunState } from '@/core/types/vault-scan';
import { calculateOverallPercent } from './ScanProgressCalculator';
import { projectReviewPreparation } from '../vault-review-preparation/ReviewPreparationProgress';

const EMPTY_USAGE: VaultScanUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

function title(state: VaultScanRunState): string {
	if (state.status === 'completed') return 'Scan complete';
	if (state.status === 'failed' || state.status === 'needs-attention' || state.status === 'recoverable') return 'Scan needs attention';
	if (state.activeStageIds.includes('publish')) return 'Publishing verified knowledge and follow-up.';
	if (state.activeStageIds.includes('prepare-review')) return 'Preparing work for review.';
	if (state.activeStageIds.includes('ai')) return 'Discovering structure across your vault.';
	if (state.activeStageIds.includes('index')) return 'Building search, semantic, and AI layers.';
	return 'Freezing this Scan plan and evidence boundary.';
}

function discoveryView(session: VaultDiscoverySession | null): VaultDiscoveryProgressView | null {
	if (!session) return null;
	const accountedRefs = new Set([...session.evidence.inspectedRefs, ...session.evidence.excludedRefs.map((entry) => entry.ref), ...session.evidence.failedRefs.map((entry) => entry.ref)]);
	const eligible = session.evidence.eligibleRefs.length;
	const active = Object.values(session.investigations).filter((item) => ['open', 'gathering', 'testing', 'blocked'].includes(item.state));
	const retained = Object.values(session.findings).filter((finding) => ['retained', 'revised'].includes(finding.state));
	const countsByKind = Object.fromEntries(retained.map((finding) => [finding.kindId, retained.filter((candidate) => candidate.kindId === finding.kindId).length]));
	return {
		status: session.status,
		coverage: { accounted: accountedRefs.size, eligible, percent: eligible > 0 ? Math.floor(accountedRefs.size / eligible * 100) : 100, inspected: session.evidence.inspectedRefs.length, excluded: session.evidence.excludedRefs.length, failed: session.evidence.failedRefs.length },
		investigations: { active, openCount: active.filter((item) => item.state !== 'blocked').length, blockedCount: active.filter((item) => item.state === 'blocked').length },
		findings: { retained, countsByKind },
		eta: session.status === 'paused' ? { state: 'paused' } : { state: 'calculating' },
		sessionLog: session.stream,
		completionBlockers: session.blockers,
		usage: session.usage,
	};
}

export function projectVaultScanRun(state: VaultScanRunState, discovery: VaultDiscoverySession | null, review: ReviewPreparationSession | null, now: number): VaultScanRunProjection {
	const lanes = Object.values(state.indexLanes);
	const usage = state.receipts.reduce((total, receipt) => ({ inputTokens: total.inputTokens + receipt.usage.inputTokens, outputTokens: total.outputTokens + receipt.usage.outputTokens, totalTokens: total.totalTokens + receipt.usage.totalTokens, costUsd: total.costUsd + receipt.usage.costUsd }), EMPTY_USAGE);
	return {
		runId: state.scanRunId,
		status: state.status,
		title: title(state),
		overallPercent: calculateOverallPercent(state, discovery, review),
		elapsedMs: Math.max(0, (state.completedAt ?? now) - state.startedAt),
		etaRangeMs: null,
		activeStageIds: state.activeStageIds,
		inspectionStageId: state.inspectionStageId,
		stages: Object.values(state.stages),
		buildIndex: { lanes, terminal: lanes.reduce((sum, lane) => sum + lane.terminal, 0), total: lanes.reduce((sum, lane) => sum + lane.total, 0) },
		discovery: discoveryView(discovery),
		reviewPreparation: review ? projectReviewPreparation(review) : null,
		usage,
		controls: { canPause: ['discovering', 'running', 'preparing-review'].includes(state.status), canResume: state.status === 'paused', canStop: !['completed', 'failed', 'stopped-partial'].includes(state.status), canRetry: ['recoverable', 'needs-attention'].includes(state.status) },
		warnings: state.warnings,
		error: state.error,
	};
}
