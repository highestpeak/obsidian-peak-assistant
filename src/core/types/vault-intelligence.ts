export type VaultIntelligenceSurface = 'overview' | 'map' | 'queue';
export type VaultIntelligenceMapSurface = 'contents' | 'activity';
export type VaultScanScopeMode = 'changed' | 'selected' | 'entire';
export type VaultScanScopeSelectorKind = 'file' | 'folder' | 'community' | 'saved-work';
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
	/**
	 * Concrete paths frozen into the plan.  This is deliberately retained even
	 * when the owner selected a folder, Community, or saved work set so a later
	 * run is reproducible if that collection changes.
	 */
	selectedPaths: string[];
	selectors?: VaultScanScopeSelector[];
}

export interface VaultScanScopeSelector {
	id: string;
	kind: VaultScanScopeSelectorKind;
	label: string;
	paths: string[];
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
	/** A concrete candidate supplied by the detector, never a guessed replacement. */
	suggestedValue?: string | null;
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
	kind: 'file-change' | 'chat' | 'project' | 'composer' | 'scan' | 'owner-choice' | 'apply' | 'verify';
	label: string;
	objectPath: string | null;
	runId: string | null;
}

export type VaultProposalStatus = 'ready-review' | 'applied' | 'stale' | 'verified' | 'rejected';

/**
 * A compact, reviewable textual patch.  We persist only the matched fragment
 * and its context, not an entire copy of the user's note.  `sourceHash` and
 * `sourceMtime` make Apply fail closed when the source has changed.
 */
export interface VaultProposalFileChange {
	id: string;
	atomicItemIds: string[];
	path: string;
	sourceMtime: number | null;
	sourceHash: string;
	beforeText: string;
	afterText: string;
	beforeContext: string;
	afterContext: string;
	matchCount: number;
}

export interface VaultMaintenanceProposal {
	id: string;
	taskId: string;
	sourceRunId: string;
	status: VaultProposalStatus;
	createdAt: number;
	updatedAt: number;
	changes: VaultProposalFileChange[];
	warnings: string[];
	appliedAt: number | null;
	verifiedAt: number | null;
}

export interface VaultMapTextEntry {
	id: string;
	communityId: string;
	communityLabel: string;
	text: string;
	sourceFingerprint: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface VaultIntelligencePersistedState {
	version: 1 | 2;
	updatedAt: number;
	changedCursorAt: number | null;
	activeRun: VaultScanRunState | null;
	lastCompletedRun: VaultCompletedRun | null;
	tasks: VaultMaintenanceTask[];
	recentActivity: VaultActivityRecord[];
	proposals?: VaultMaintenanceProposal[];
	mapTextEntries?: VaultMapTextEntry[];
}

export interface VaultIntelligenceEvent {
	id: string;
	timestamp: number;
	type: 'run-started' | 'stage-changed' | 'operation-changed' | 'run-completed' | 'run-failed' | 'owner-choice' | 'review-decisions-saved' | 'proposal-prepared' | 'proposal-applied' | 'task-applied' | 'task-verified' | 'map-text-saved';
	runId: string | null;
	detail: string;
}
