import type { GeneratedArtifactRef } from '@/core/storage/generated-output';
import type { VaultMaintenanceTask, VaultScanPlan, VaultScanResolvedRoute, VaultScanUsage } from './vault-intelligence';

export type VaultScanStageId = 'discover' | 'index' | 'ai' | 'prepare-review' | 'publish';
export type VaultScanRunStatus =
	| 'idle'
	| 'starting'
	| 'discovering'
	| 'running'
	| 'pausing'
	| 'paused'
	| 'stopping'
	| 'stopped-partial'
	| 'preparing-review'
	| 'publishing'
	| 'needs-attention'
	| 'recoverable'
	| 'completed'
	| 'failed';
export type VaultScanTerminalDisposition = 'ready' | 'already-current' | 'failed' | 'skipped-by-policy' | 'unavailable';
export type VaultScanIndexLayerId = 'full-text' | 'embedding' | 'ai-enrichment';

export interface VaultScanSourceRevision {
	path: string;
	mtime: number;
	size: number;
	sha256: string | null;
}

export interface FrozenScopeManifest {
	snapshotId: string;
	mode: VaultScanPlan['scope']['mode'];
	paths: readonly string[];
	sourceRevisions: readonly VaultScanSourceRevision[];
	excluded: readonly { path: string; reason: string }[];
	unreadable: readonly { path: string; reason: string }[];
	frozenAt: number;
	fingerprint: string;
}

export interface FrozenModelRoute {
	profileId: string;
	provider: string;
	model: string;
	local: boolean;
	selectable: boolean;
}

export interface FrozenRoutePolicy {
	operationId: string;
	candidates: readonly FrozenModelRoute[];
	strategy: 'single' | 'capacity-aware' | 'fallback';
	maxConcurrency: number;
	localMaxConcurrency: number;
	retryPolicy: { maxAttempts: number; baseDelayMs: number };
	fingerprint: string;
}

export interface ScanProgressPlan {
	schemaVersion: 1;
	weights: Readonly<Record<VaultScanStageId, number>>;
	discoverGateIds: readonly ['scope-frozen', 'evidence-snapshot-pinned', 'execution-plan-resolved', 'work-graph-published'];
	indexUnitCount: number;
	discoveryObjectiveCount: number;
	createdAt: number;
	fingerprint: string;
}

export interface WorkGraphManifest {
	snapshotId: string;
	nodes: readonly { id: string; stageId: VaultScanStageId; dependsOn: readonly string[] }[];
	workUnitKeys: readonly string[];
	evidenceFloor: readonly string[];
	fingerprint: string;
}

export interface FrozenScanPlan {
	schemaVersion: 1;
	scanRunId: string;
	snapshotId: string;
	scope: FrozenScopeManifest;
	selectedTaskIds: readonly string[];
	enabledIndexLayers: readonly VaultScanIndexLayerId[];
	discoveryObjectives: readonly string[];
	routePolicies: Readonly<Record<string, FrozenRoutePolicy>>;
	progressPlan: ScanProgressPlan;
	workGraph: WorkGraphManifest;
	createdAt: number;
	fingerprint: string;
}

export interface VaultScanWorkUnitReceipt {
	receiptId: string;
	workKey: string;
	snapshotId: string;
	stageSessionId: string;
	path: string | null;
	layerId: VaultScanIndexLayerId | 'evidence' | 'discovery' | 'review' | 'publish';
	disposition: VaultScanTerminalDisposition;
	plannedRoute: VaultScanResolvedRoute | null;
	actualRoute: VaultScanResolvedRoute | null;
	attemptId: string;
	executionId: string;
	startedAt: number;
	completedAt: number;
	usage: VaultScanUsage;
	evidenceRefs: readonly string[];
	error: string | null;
}

export interface ScanStageLedger {
	id: VaultScanStageId;
	status: 'waiting' | 'running' | 'completed' | 'completed-with-attention' | 'paused' | 'failed';
	terminalUnits: number;
	successfulUnits: number;
	failedUnits: number;
	skippedUnits: number;
	totalUnits: number | null;
	earnedCredits: number;
	message: string;
	startedAt: number | null;
	completedAt: number | null;
}

export interface BuildIndexLaneState {
	id: VaultScanIndexLayerId;
	status: ScanStageLedger['status'];
	terminal: number;
	successful: number;
	failed: number;
	total: number;
	current: readonly { path: string; action: string; route: VaultScanResolvedRoute | null; status: string }[];
	throughputPerMinute: number | null;
	remainingRangeMs: readonly [number, number] | null;
}

export interface VaultScanDomainEvent {
	schemaVersion: 1;
	eventId: string;
	scanRunId: string;
	sequence: number;
	eventType: string;
	idempotencyKey: string;
	stageId: VaultScanStageId | null;
	sessionId: string | null;
	attemptId: string | null;
	artifactRefs: readonly GeneratedArtifactRef[];
	occurredAt: number;
	payload: unknown;
}

export interface CompletedPackage {
	schemaVersion: 1;
	packageId: string;
	scanRunId: string;
	snapshotId: string;
	builtAt: number;
	indexReceiptRefs: readonly string[];
	discoveryArtifactRefs: readonly string[];
	reviewArtifactRefs: readonly string[];
	tasks: readonly VaultMaintenanceTask[];
	usage: VaultScanUsage;
	warnings: readonly string[];
	checksum: string;
}

export interface VaultScanRunState {
	schemaVersion: 1;
	scanRunId: string;
	snapshotId: string | null;
	status: VaultScanRunStatus;
	activeStageIds: readonly VaultScanStageId[];
	inspectionStageId: VaultScanStageId;
	frozenPlanRef: GeneratedArtifactRef | null;
	frozenPlan: FrozenScanPlan | null;
	stages: Readonly<Record<VaultScanStageId, ScanStageLedger>>;
	indexLanes: Readonly<Record<VaultScanIndexLayerId, BuildIndexLaneState>>;
	receipts: readonly VaultScanWorkUnitReceipt[];
	eventSequence: number;
	overallPercent: number;
	startedAt: number;
	updatedAt: number;
	completedAt: number | null;
	pauseRequested: boolean;
	stopRequested: boolean;
	warnings: readonly string[];
	error: string | null;
	completedPackageRef: GeneratedArtifactRef | null;
}

export interface VaultScanRunProjection {
	runId: string;
	status: VaultScanRunStatus;
	title: string;
	overallPercent: number;
	elapsedMs: number;
	etaRangeMs: readonly [number, number] | null;
	activeStageIds: readonly VaultScanStageId[];
	inspectionStageId: VaultScanStageId;
	stages: readonly ScanStageLedger[];
	buildIndex: { lanes: readonly BuildIndexLaneState[]; terminal: number; total: number };
	discovery: import('./vault-discovery').VaultDiscoveryProgressView | null;
	reviewPreparation: import('./review-preparation').ReviewPreparationProjection | null;
	usage: VaultScanUsage;
	controls: { canPause: boolean; canResume: boolean; canStop: boolean; canRetry: boolean };
	warnings: readonly string[];
	error: string | null;
}

export interface VaultScanCheckpoint {
	schemaVersion: 1;
	state: VaultScanRunState;
	discovery: import('./vault-discovery').VaultDiscoverySession | null;
	reviewPreparation: import('./review-preparation').ReviewPreparationSession | null;
	lastEventSequence: number;
	updatedAt: number;
}
