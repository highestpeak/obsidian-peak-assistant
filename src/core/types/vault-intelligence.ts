export type VaultIntelligenceSurface = 'overview' | 'map' | 'queue';
export type VaultIntelligenceMapSurface = 'contents' | 'activity';
export type VaultScanScopeMode = 'changed' | 'selected' | 'entire';
export type VaultScanScopeSelectorKind = 'file' | 'folder' | 'file-type' | 'community' | 'saved-work' | 'dynamic';
export type VaultScanStageId = import('./vault-scan').VaultScanStageId;
export type VaultScanRunStatus = 'idle' | 'starting' | 'discovering' | 'running' | 'pausing' | 'stopping' | 'paused' | 'interrupted' | 'stopped-partial' | 'preparing-review' | 'publishing' | 'needs-attention' | 'recoverable' | 'completed' | 'failed';
export type VaultMaintenanceTaskCategory = 'decision' | 'review' | 'recovery';
export type VaultMaintenanceTaskState = 'needs-choice' | 'needs-proposal' | 'ready-review' | 'ready-apply' | 'applying' | 'applied' | 'reindexing' | 'verifying' | 'recovery' | 'verified';
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
	/** Legacy persisted operation. New Scan plans never create or execute it. */
	| 'plan-scan'
	| 'embedding-refresh'
	| 'file-summaries'
	| 'ai-tags'
	| 'relationship-discovery'
	| 'semantic-review'
	| 'community-analysis'
	| 'hub-bridge-analysis'
	| 'file-proposals'
	| 'maintenance-synthesis'
	/** Legacy persisted V2 run id. New plans normalize this to relationship-discovery. */
	| 'relationship-review';

export type VaultScanIndexOutputId =
	| 'fulltext'
	| 'embeddings'
	| 'markdown-summary'
	| 'pdf-summary'
	| 'image-summary'
	| 'canvas-summary'
	| 'keywords'
	| 'ai-topic-tags'
	| 'functional-tags'
	| 'context-entities'
	| 'inferred-date'
	| 'links-tags-folders'
	| 'semantic-relations'
	| 'community-signals'
	| 'search-ranking-signals'
	| 'pdf-text'
	| 'canvas-text'
	| 'pdf-ocr'
	| 'image-ocr'
	| 'image-description';

export interface VaultScanIndexOutputPlan {
	id: VaultScanIndexOutputId;
	enabled: boolean;
	availability: 'required' | 'automatic' | 'optional' | 'later';
	operationIds: VaultScanAiOperationId[];
}

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
	estimatedInputTokens?: number;
	estimatedOutputTokens?: number;
}

export interface VaultScanOperationRoute {
	profileId: string | null;
	model: string;
	provider: string;
	available: boolean;
	candidates?: VaultScanOperationRouteCandidate[];
}

export interface VaultScanOperationRouteCandidate {
	profileId: string;
	model: string;
	provider: string;
	displayName?: string;
	/** The catalog-declared model type. Never infer this from an id string. */
	modelType?: 'llm' | 'embedding' | 'image' | 'video' | 'sound';
	/** A candidate remains visible when incompatible so the picker can explain why it cannot be used. */
	selectable?: boolean;
	unavailableReason?: string | null;
}

/** A configuration outcome the Scan model picker may safely explain to its owner. */
export class VaultOperationRouteSelectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'VaultOperationRouteSelectionError';
	}
}

export interface VaultScanPlan {
	scope: VaultScanScope;
	enabledCheckIds: string[];
	/** The current-run output plan; Index settings still own long-lived defaults. */
	indexOutputs?: VaultScanIndexOutputPlan[];
	aiOperations: VaultScanAiOperationPlan[];
	createdAt: number;
}

export interface VaultScanUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	costUsd: number;
}

export interface VaultScanResolvedRoute {
	profileId: string;
	model: string;
	provider: string;
}

export interface VaultScanOperationAttemptReceipt {
	id: string;
	executionId: string;
	path: string | null;
	status: 'produced' | 'partial' | 'failed' | 'cancelled' | 'already-current' | 'not-eligible';
	plannedRoute: VaultScanResolvedRoute | null;
	actualRoute: VaultScanResolvedRoute | null;
	startedAt: number;
	completedAt: number;
	usage: VaultScanUsage;
	error: string | null;
	evidence: string[];
	/** Operation-specific generated output retained with the durable Scan receipt. */
	generatedKnowledge?: {
		summary?: string | null;
		tags?: string[];
	};
}

export interface VaultScanOperationState extends VaultScanAiOperationPlan {
	status: 'waiting' | 'running' | 'completed' | 'partial' | 'skipped' | 'failed';
	processed: number;
	total: number;
	currentPath: string | null;
	usage: VaultScanUsage;
	error: string | null;
	/** Observable runtime facts, never a synthetic AI claim. */
	evidence?: string[];
	startedAt?: number | null;
	completedAt?: number | null;
	/** Frozen setup choice and the provider route that actually produced a receipt. */
	plannedRoute?: VaultScanResolvedRoute | null;
	actualRoute?: VaultScanResolvedRoute | null;
	executionId?: string | null;
	attempts?: VaultScanOperationAttemptReceipt[];
	/** Bounded presentation-safe stream trace for the active provider call. */
	liveEvidence?: Array<{ kind: 'status' | 'text' | 'tool'; text: string; updatedAt: number }>;
}

export interface VaultScanStageState {
	id: VaultScanStageId;
	status: 'waiting' | 'running' | 'completed' | 'partial' | 'skipped' | 'failed';
	processed: number;
	total: number;
	message: string;
	/** Real object currently reported by this stage. Null means the runtime has
	 * not published object-level progress; the UI must not invent one. */
	currentPath?: string | null;
	startedAt?: number | null;
	completedAt?: number | null;
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
	/** Durable document checkpoint. Only paths whose Core Search write completed
	 * successfully appear here; resume never repeats them. */
	coreIndexedPaths?: string[];
	/** Frozen per-layer eligibility. Unsupported files retain UI geometry but
	 * never enter an AI/vector denominator or masquerade as Complete. */
	pathEligibility?: Record<string, { fullText: boolean; embeddings: boolean; aiEnrichment: boolean; reason: string | null }>;
	startedAt: number | null;
	completedAt: number | null;
	warnings: string[];
	error: string | null;
	stopRequested: boolean;
	stopMode?: 'pause' | 'stop' | null;
	progress?: VaultScanProgressLedger;
	reviewPreparation?: import('./review-preparation').ReviewPreparationProjection | null;
	discoveryFindings?: Array<{ id: string; kind: 'relationship' | 'community' | 'hub' | 'bridge' | 'island' | 'drift'; title: string; evidenceCount: number }>;
}

export interface VaultScanProgressLedger {
	terminalUnits: number;
	successfulUnits: number;
	failedUnits: number;
	skippedUnits: number;
	totalUnits: number;
	percent: number;
	source: 'frozen-plan-work-units';
	frozenAt: number;
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
	/** Stable semantic identity across Scan runs and provider retries. */
	identityKey?: string;
	sourceType?: 'lint' | 'index-error' | 'vault-review-action' | 'vault-review-gap';
	/** Exact cited Vault paths/concepts published by the producing detector or agent. */
	provenance?: string[];
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
	/** Optional detector-supplied patch. It is only materialized after exact source matching. */
	proposalPatch?: { beforeText: string; afterText: string; label?: string } | null;
	ownerChoice: VaultMaintenanceOwnerChoice | null;
	verification?: {
		verifiedAt: number;
		status: 'passed' | 'failed';
		method: 'fresh-detector' | 'index-retry' | 'owner-choice-receipt';
		detail: string;
		sourceRevision: number | null;
	};
}

export interface VaultMaintenanceTask {
	id: string;
	/** Controller-derived identity that remains stable across Scan runs. */
	workKey?: string;
	/** Immutable Prepare review artifact. A task cannot be prepared without it. */
	reviewArtifactId?: string;
	preparationState?: 'planning' | 'prepared' | 'attention';
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
	workflow?: {
		phase: 'decision' | 'proposal' | 'applying' | 'applied' | 'reindexing' | 'verifying' | 'recovery' | 'verified';
		processed: number;
		total: number;
		currentPath: string | null;
		detail: string;
		updatedAt: number;
	};
	suggestionReceipt?: {
		id: string;
		status: 'running' | 'completed' | 'failed';
		instruction: string;
		route: VaultScanResolvedRoute | null;
		usage: VaultScanUsage;
		requestedAt: number;
		completedAt: number | null;
		error: string | null;
		evidence: string[];
	};
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
	/** Distinct successful provider executions, not planned routes or UI labels. */
	providerReceiptCount?: number;
	receipts: VaultScanReceipt[];
	maintenanceTaskIds: string[];
	warnings: string[];
	/** The resolved routes that completed this scan. They seed the next scan only
	 * while their profile and model remain selectable. */
	aiOperations?: Array<Pick<VaultScanAiOperationPlan, 'id' | 'model' | 'provider'> & { profileId: string | null }>;
}

export interface VaultActivityRecord {
	id: string;
	timestamp: number;
	kind: 'file-change' | 'chat' | 'project' | 'composer' | 'scan' | 'owner-choice' | 'apply' | 'verify';
	label: string;
	objectPath: string | null;
	runId: string | null;
}

export type VaultProposalStatus = 'ready-review' | 'applying' | 'applied' | 'stale' | 'verified' | 'rejected';

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
	selected?: boolean;
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
	revisions?: VaultMapTextRevision[];
}

export interface VaultMapTextRevision {
	id: string;
	text: string;
	sourceFingerprint: string | null;
	createdAt: number;
	status: 'draft' | 'published' | 'kept' | 'superseded';
}

export interface VaultActivitySession {
	id: string;
	startedAt: number;
	endedAt: number;
	recordIds: string[];
	objectPaths: string[];
	reason: 'shared-object' | 'adjacent-time' | 'single-record';
	label: string;
}

export interface VaultActivityTheme {
	id: string;
	label: string;
	recordIds: string[];
	sessionIds: string[];
	confidence: number;
	citations: Array<{ recordId: string; objectPath: string | null }>;
	generatedAt: number;
	sourceRevision: string;
}

export interface VaultIntelligencePersistedState {
	version: 1 | 2 | 3 | 4;
	updatedAt: number;
	changedCursorAt: number | null;
	activeRun: VaultScanRunState | null;
	lastCompletedRun: VaultCompletedRun | null;
	tasks: VaultMaintenanceTask[];
	recentActivity: VaultActivityRecord[];
	proposals?: VaultMaintenanceProposal[];
	mapTextEntries?: VaultMapTextEntry[];
	activityThemes?: VaultActivityTheme[];
}

export interface VaultIntelligenceEvent {
	id: string;
	timestamp: number;
	type: 'run-started' | 'stage-changed' | 'operation-changed' | 'run-completed' | 'run-failed' | 'owner-choice' | 'review-decisions-saved' | 'proposal-prepared' | 'proposal-applied' | 'task-applied' | 'task-verified' | 'map-text-saved' | 'map-text-published' | 'activity-themes-generated';
	runId: string | null;
	detail: string;
}
