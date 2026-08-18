export type VaultIntelligenceSurface = 'overview' | 'map' | 'queue';
export type VaultIntelligenceMapSurface = 'contents' | 'activity';
export type VaultScanScopeMode = 'changed' | 'selected' | 'entire';
export type VaultScanStageId = 'discover' | 'index' | 'ai' | 'publish';
export type VaultScanRunStatus = 'idle' | 'running' | 'stopping' | 'interrupted' | 'completed' | 'failed';
export type VaultMaintenanceTaskCategory = 'decision' | 'review' | 'recovery';
export type VaultMaintenanceTaskState = 'needs-choice' | 'needs-proposal' | 'ready-review' | 'ready-apply' | 'recovery' | 'verified';
export type VaultMaintenanceTaskKind =
	| 'file-properties'
	| 'broken-links'
	| 'community-membership'
	| 'knowledge-connections'
	| 'related-notes'
	| 'note-split'
	| 'community-structure'
	| 'community-hubs'
	| 'content-lifecycle'
	| 'unusual-notes'
	| 'unreadable-files';
export type VaultScanAiOperationId =
	| 'embedding-refresh'
	| 'file-summaries'
	| 'ai-tags'
	| 'relationship-review'
	| 'community-analysis'
	| 'file-proposals'
	| 'maintenance-synthesis';

export interface VaultScanScope {
	mode: VaultScanScopeMode;
	selectedPaths: string[];
}

export interface VaultScanAiOperationPlan {
	id: VaultScanAiOperationId;
	enabled: boolean;
	model: string;
	provider: string;
	estimatedTokens: number;
	estimatedCostUsd: number;
}

export interface VaultScanOperationRoute {
	model: string;
	provider: string;
	available: boolean;
}

export interface VaultScanPlan {
	scope: VaultScanScope;
	enabledCheckIds: string[];
	aiOperations: VaultScanAiOperationPlan[];
	createdAt: number;
}

export interface VaultScanUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	costUsd: number;
}

export interface VaultScanOperationState extends VaultScanAiOperationPlan {
	status: 'waiting' | 'running' | 'completed' | 'skipped' | 'failed';
	processed: number;
	total: number;
	currentPath: string | null;
	usage: VaultScanUsage;
	error: string | null;
}

export interface VaultScanStageState {
	id: VaultScanStageId;
	status: 'waiting' | 'running' | 'completed' | 'partial' | 'failed';
	processed: number;
	total: number;
	message: string;
}

export interface VaultScanRunState {
	id: string | null;
	status: VaultScanRunStatus;
	plan: VaultScanPlan | null;
	currentStage: VaultScanStageId | null;
	completedStages: VaultScanStageId[];
	stages: VaultScanStageState[];
	operations: VaultScanOperationState[];
	frozenPaths: string[];
	startedAt: number | null;
	completedAt: number | null;
	warnings: string[];
	error: string | null;
	stopRequested: boolean;
}

export interface VaultMaintenanceOwnerChoice {
	choiceId: string;
	choiceValue?: string | null;
	chosenAt: number;
	status: 'selected' | 'applied' | 'verified';
	sourceRevision: number | null;
}

export interface VaultMaintenanceAtomicItem {
	id: string;
	sourceFindingId: string | null;
	signalId: string | null;
	filePath: string | null;
	title: string;
	evidence: string;
	projectionKey: string;
	projectionLabel: string;
	suggestedChoiceId: string | null;
	ownerChoice: VaultMaintenanceOwnerChoice | null;
}

export interface VaultMaintenanceTask {
	id: string;
	kind: VaultMaintenanceTaskKind;
	sourceRunId: string;
	category: VaultMaintenanceTaskCategory;
	state: VaultMaintenanceTaskState;
	title: string;
	typeLabel: string;
	affectedLabel: string;
	contextLabel: string;
	impact: 'high' | 'medium' | 'low';
	atomicItems: VaultMaintenanceAtomicItem[];
	defaultChoice: VaultMaintenanceOwnerChoice | null;
	createdAt: number;
	updatedAt: number;
}

export interface VaultScanReceipt {
	id: string;
	label: string;
	detail: string;
	result: string;
	status: 'completed' | 'partial' | 'failed';
	ownerBoundary: 'peak-owned' | 'user-files';
}

export interface VaultCompletedRun {
	runId: string;
	startedAt: number;
	completedAt: number;
	scopeMode: VaultScanScopeMode;
	objectCount: number;
	searchableCount: number | null;
	usage: VaultScanUsage;
	receipts: VaultScanReceipt[];
	maintenanceTaskIds: string[];
	warnings: string[];
}

export interface VaultActivityRecord {
	id: string;
	timestamp: number;
	kind: 'file-change' | 'scan' | 'owner-choice' | 'apply' | 'verify';
	label: string;
	objectPath: string | null;
	runId: string | null;
}

export interface VaultIntelligencePersistedState {
	version: 1;
	updatedAt: number;
	changedCursorAt: number | null;
	activeRun: VaultScanRunState | null;
	lastCompletedRun: VaultCompletedRun | null;
	tasks: VaultMaintenanceTask[];
	recentActivity: VaultActivityRecord[];
}

export interface VaultIntelligenceEvent {
	id: string;
	timestamp: number;
	type: 'run-started' | 'stage-changed' | 'operation-changed' | 'run-completed' | 'run-failed' | 'owner-choice' | 'review-decisions-saved' | 'task-applied' | 'task-verified';
	runId: string | null;
	detail: string;
}
