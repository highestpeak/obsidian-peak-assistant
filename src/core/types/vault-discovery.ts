import type { VaultScanUsage } from './vault-intelligence';

export type DiscoveryFindingKind = 'relationship' | 'community' | 'hub' | 'bridge' | 'island' | 'drift' | 'structural-gap' | 'anomaly';
export type DiscoveryFindingState = 'candidate' | 'retained' | 'revised' | 'superseded' | 'rejected' | 'stale';

export interface EvidenceLedger {
	manifestRef: string;
	eligibleRefs: readonly string[];
	inspectedRefs: readonly string[];
	excludedRefs: readonly { ref: string; reason: string }[];
	failedRefs: readonly { ref: string; reason: string }[];
	derivedFactRefs: readonly string[];
}

export interface DiscoveryInvestigation {
	id: string;
	question: string;
	state: 'open' | 'gathering' | 'testing' | 'blocked' | 'resolved' | 'abandoned';
	priority: number;
	evidenceRefs: readonly string[];
	findingRefs: readonly string[];
	parentInvestigationId: string | null;
	revisitCount: number;
	updatedAt: number;
}

export interface DiscoveryFinding {
	id: string;
	identityKey: string;
	kindId: DiscoveryFindingKind;
	state: DiscoveryFindingState;
	statement: string;
	evidenceRefs: readonly string[];
	counterEvidenceRefs: readonly string[];
	confidence: number;
	investigationRefs: readonly string[];
	supersedes: readonly string[];
	version: number;
	updatedAt: number;
}

export interface DiscoveryStreamEvent {
	id: string;
	type: 'reasoning' | 'tool-start' | 'tool-result' | 'finding' | 'transition' | 'checkpoint' | 'warning';
	text: string;
	route: string | null;
	evidenceRef: string | null;
	occurredAt: number;
}

export interface VaultDiscoverySession {
	schemaVersion: 1;
	id: string;
	scanRunId: string;
	snapshotId: string;
	status: 'preparing' | 'running' | 'pausing' | 'paused' | 'completed' | 'completed-with-attention' | 'stopped-partial' | 'failed';
	evidence: EvidenceLedger;
	investigations: Readonly<Record<string, DiscoveryInvestigation>>;
	findings: Readonly<Record<string, DiscoveryFinding>>;
	frontier: readonly string[];
	objectiveIds: readonly string[];
	terminalObjectiveIds: readonly string[];
	candidateDenominator: number | null;
	terminalCandidateCount: number;
	stableCycles: number;
	completionReceiptId: string | null;
	blockers: readonly string[];
	usage: VaultScanUsage;
	stream: readonly DiscoveryStreamEvent[];
	attemptIds: readonly string[];
	updatedAt: number;
}

export interface VaultDiscoveryProgressView {
	status: VaultDiscoverySession['status'];
	coverage: { accounted: number; eligible: number; percent: number; inspected: number; excluded: number; failed: number };
	investigations: { active: readonly DiscoveryInvestigation[]; openCount: number; blockedCount: number };
	findings: { retained: readonly DiscoveryFinding[]; countsByKind: Partial<Record<DiscoveryFindingKind, number>> };
	eta: { state: 'calculating' | 'available' | 'paused' | 'unknown'; minMs?: number; maxMs?: number };
	sessionLog: readonly DiscoveryStreamEvent[];
	completionBlockers: readonly string[];
	usage: VaultScanUsage;
}
