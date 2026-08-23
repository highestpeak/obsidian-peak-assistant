import type { VaultMaintenanceTask, VaultScanResolvedRoute, VaultScanUsage } from './vault-intelligence';

export type ReviewAtomDisposition = 'automatic-receipt' | 'assigned-to-task' | 'merged-duplicate' | 'superseded' | 'informational-only' | 'excluded-by-policy' | 'blocked';
export type ReviewPreparationPhase = 'normalizing' | 'grouping' | 'inspecting' | 'drafting' | 'validating' | 'revising' | 'freezing';

export interface ReviewAtom {
	id: string;
	kindId: string;
	objectRefs: readonly string[];
	evidenceRefs: readonly string[];
	sourceRevisionRefs: readonly string[];
	ownerSurfaceId: string;
	ownerQuestionId: string;
	writeBoundary: 'peak-owned' | 'proposal' | 'no-change' | 'recovery';
	verificationKind: string;
	exitCondition: string;
	deterministicOnly: boolean;
}

export interface ReviewAtomDispositionRecord {
	atomId: string;
	disposition: ReviewAtomDisposition;
	workKey: string | null;
	reason: string;
}

export interface ReviewChoice {
	id: string;
	label: string;
	description: string;
}

export interface ReviewWorkArtifact {
	schemaVersion: 1;
	artifactId: string;
	scanRunId: string;
	workKey: string;
	planRevision: number;
	title: string;
	ownerQuestion: string;
	evidenceSummary: string;
	affectedObjectRefs: readonly string[];
	citations: readonly { evidenceRef: string; sourceRevisionRef: string }[];
	choices: readonly ReviewChoice[];
	recommendedChoiceId: string | null;
	recommendationReason: string | null;
	impact: 'low' | 'medium' | 'high';
	caveats: readonly string[];
	writeBoundary: ReviewAtom['writeBoundary'];
	verificationKind: string;
	exitCondition: string;
	sourceRevisionRefs: readonly string[];
	generatedBy: { attemptId: string; route: VaultScanResolvedRoute | null; usage: VaultScanUsage };
	validationReceiptId: string;
}

export interface ReviewPreparationJob {
	jobId: string;
	workKey: string;
	atomRefs: readonly string[];
	conflictKeys: readonly string[];
	status: 'queued' | 'inspecting' | 'drafting' | 'validating' | 'revising' | 'completed' | 'attention';
	attemptIds: readonly string[];
	artifactId: string | null;
	error: string | null;
}

export interface ReviewPreparationStreamEvent {
	id: string;
	type: 'job-queued' | 'reasoning-delta' | 'tool-start' | 'tool-result' | 'artifact-draft' | 'validation-failed' | 'validation-passed' | 'artifact-committed' | 'job-completed' | 'checkpoint';
	jobId: string | null;
	text: string;
	occurredAt: number;
}

export interface ReviewPreparationSession {
	schemaVersion: 1;
	id: string;
	scanRunId: string;
	status: 'planning' | 'running' | 'pausing' | 'paused' | 'completed' | 'completed-with-attention' | 'stopped-partial' | 'failed';
	inputSnapshotId: string;
	atoms: readonly ReviewAtom[];
	dispositions: readonly ReviewAtomDispositionRecord[];
	planRevision: number;
	planFrozenAt: number | null;
	jobs: readonly ReviewPreparationJob[];
	artifacts: readonly ReviewWorkArtifact[];
	tasks: readonly VaultMaintenanceTask[];
	phase: ReviewPreparationPhase;
	stream: readonly ReviewPreparationStreamEvent[];
	usage: VaultScanUsage;
	updatedAt: number;
}

export interface ReviewPreparationProjection {
	status: ReviewPreparationSession['status'];
	phase: ReviewPreparationPhase;
	percent: number | null;
	findingsAccounted: { processed: number; total: number };
	tasksPlanned: number | null;
	ready: number;
	attention: number;
	jobs: readonly ReviewPreparationJob[];
	artifacts: readonly ReviewWorkArtifact[];
	stream: readonly ReviewPreparationStreamEvent[];
}

export interface ReviewPreparationPackage {
	schemaVersion: 1;
	packageId: string;
	scanRunId: string;
	inputSnapshotId: string;
	dispositions: readonly ReviewAtomDispositionRecord[];
	tasks: readonly VaultMaintenanceTask[];
	reviewArtifacts: readonly ReviewWorkArtifact[];
	blockedAtomIds: readonly string[];
	completedAt: number;
}
