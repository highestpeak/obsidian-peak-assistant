import type { VaultDiscoverySession } from '@/core/types/vault-discovery';

export interface DiscoveryCompletionDecision {
	allowed: boolean;
	status: 'completed' | 'completed-with-attention' | null;
	blockers: string[];
}

export function evaluateDiscoveryCompletion(session: VaultDiscoverySession): DiscoveryCompletionDecision {
	const blockers: string[] = [];
	const accounted = new Set([...session.evidence.inspectedRefs, ...session.evidence.excludedRefs.map((entry) => entry.ref), ...session.evidence.failedRefs.map((entry) => entry.ref)]);
	for (const ref of session.evidence.eligibleRefs) if (!accounted.has(ref)) blockers.push(`Evidence not accounted: ${ref}`);
	for (const objective of session.objectiveIds) if (!session.terminalObjectiveIds.includes(objective)) blockers.push(`Required probe not terminal: ${objective}`);
	for (const investigation of Object.values(session.investigations)) {
		if (['open', 'gathering', 'testing'].includes(investigation.state) && investigation.priority >= 0.5) blockers.push(`High-priority investigation remains open: ${investigation.id}`);
	}
	for (const finding of Object.values(session.findings)) {
		if (finding.state === 'candidate') blockers.push(`Finding candidate has no terminal disposition: ${finding.id}`);
		if (['retained', 'revised'].includes(finding.state) && finding.evidenceRefs.length === 0) blockers.push(`Retained finding has no evidence: ${finding.id}`);
	}
	if (session.stableCycles < 3) blockers.push('Convergence window has not stabilized.');
	if (blockers.length > 0) return { allowed: false, status: null, blockers };
	const attention = session.evidence.excludedRefs.length > 0 || session.evidence.failedRefs.length > 0;
	return { allowed: true, status: attention ? 'completed-with-attention' : 'completed', blockers: [] };
}
