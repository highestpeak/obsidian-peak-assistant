import type {
	CoverageAssessment,
	DocumentHubLead,
	FolderDeepenRoundOutput,
	FolderHubCandidate,
	FolderIntuitionRoundOutput,
	FolderNavigationGroup,
	HighwayFolderLead,
	HubDiscoveryDocumentReconSubmit,
	RejectedFolderPathEntry,
} from '@/core/schemas';
import type { computeHubDiscoverBudgets } from '@/service/search/index/helper/hub/hubDiscover';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { HubDiscoveryStopAt } from './hubDiscoveryDebug';

export type { HubDiscoveryStopAt, HubDiscoveryStopAtPhase, ReconLoopDebugOptions } from './hubDiscoveryDebug';

/**
 * Options for `HubDiscoveryAgent.streamRun`.
 * Pipeline limits are computed internally from vault size unless overridden for debugging.
 */
export type HubDiscoveryAgentOptions = {
	/** Optional high-level intent; included in folder-round / deepen prompts. */
	userGoal?: string;
	/**
	 * Debug: where to stop (prep only, after full folder recon, or after a specific plan/submit round).
	 * Use object hooks with 1-based `iteration` (e.g. first plan round: `{ hook: 'folder_plan', iteration: 1 }`).
	 */
	stopAt?: HubDiscoveryStopAt;
	/** Debug: cap folder recon iterations (1–6). When omitted, uses budget-derived default (≥3). */
	folderReconMaxIterations?: number;
	/** Debug: cap document recon iterations (1–6). When omitted, uses budget-derived default (≥3). */
	documentReconMaxIterations?: number;
};

/** One digest row used to render compact folder tree lines (internal + metrics). */
export type FolderTreeNodeDigest = {
	path: string;
	name: string;
	depth: number;
	/** Direct visible child folders (after exclusions), same as digest “Subdirs”. */
	childFolderCount: number;
	/** Max absolute depth among this folder and all descendant folders in its subtree. */
	subtreeMaxDepth: number;
	/** Mean absolute depth over all folders in this subtree (this folder + descendants). */
	subtreeAvgDepth: number;
	/** Indexed notes under this folder path (recursive subtree), including nested subfolders. */
	docCount: number;
	/** Indexed notes directly in this folder (not in subfolders). */
	directDocCount: number;
	topKeywords: string[];
	topTopics: string[];
	/** Top topic + keyword tags with estimated share (for observation panel). */
	topTopicsWeighted?: string;
	/** Topic purity [0,1] from folder-hub enrichment when available. */
	topicPurity?: number;
	containerPenalty?: number;
	strongChildDocShare?: number;
	residualRatio?: number;
	strongChildCount?: number;
	/** Enrichment rank (graph + purity − container), when Mobius folder stats exist. */
	folderRank?: number;
	/** Materialized SQL hub_graph_score on folder node when present. */
	hubGraphScore?: number;
	docOutgoing: number;
	docIncoming: number;
	/** Top token stems from all indexed file basenames under this folder (recursive), by frequency. */
	fileNameTokenSample: string[];
	/** Top token stems from direct child folder names (empty if no subfolders). */
	subfolderNameTokenSample: string[];
};

/** Paginated slice of the vault folder tree for LLM context. */
export type HubFolderTreePage = {
	pageId: string;
	pageIndex: number;
	totalPages: number;
	compactTreeMarkdown: string;
	pathsOnPage: string[];
};

/** Global numeric hints for intuition (deterministic). */
export type WorldMetricsDigest = {
	totalIndexedDocuments: number;
	totalFoldersScanned: number;
	topLevelBranchCount: number;
	orphanHardSampleCount: number;
	orphanRiskHint: 'low' | 'medium' | 'high';
	topOutgoingFolders: Array<{ path: string; outgoing: number }>;
};

export type HubWorldSnapshot = {
	pages: HubFolderTreePage[];
	metrics: WorldMetricsDigest;
	nodes: FolderTreeNodeDigest[];
};

/** Deterministic document hub shortlist row (SQL ranking). */
export type DocumentHubShortlistRow = {
	path: string;
	label: string;
	hubGraphScore: number;
	docIncoming: number;
	docOutgoing: number;
};

export type ExploreFolderRunRecord = {
	path: string;
	goal: string;
	markdown: string;
};

/** Full hub discovery pipeline result (folder LLM phases + deterministic doc shortlist). */
export type HubDiscoveryAgentLoopResult = {
	world?: HubWorldSnapshot;
	folderRounds: FolderIntuitionRoundOutput[];
	deepen?: FolderDeepenRoundOutput;
	explores: ExploreFolderRunRecord[];
	mergedFolderHubCandidates: FolderHubCandidate[];
	mergedFolderNavigationGroups: FolderNavigationGroup[];
	mergedDocumentHubLeads: DocumentHubLead[];
	documentShortlist?: DocumentHubShortlistRow[];
	/** One entry per folder round, same order as `folderRounds` (folder rounds run in parallel). */
	folderCoverageAssessments: CoverageAssessment[];
	/** Set only when deepen runs (`deepen.updatedCoverage`). */
	lastCoverage?: CoverageAssessment;
	/** Cross-cutting folder corridors (not cohesive folder hubs); feeds document-hub recon. */
	highwayFolderLeads: HighwayFolderLead[];
};

/** Folder-hub recon working state (submit prompts + merge). */
export type FolderReconMemory = {
	/** Final accepted folder hub candidates accumulated across iterations. */
	confirmedFolderHubs: FolderHubCandidate[];
	/** Final navigation groups formed from multiple related folders. */
	folderNavigationGroups: FolderNavigationGroup[];
	/** Explicitly rejected folder paths to avoid repeated reconsideration. */
	rejectedFolderPaths: RejectedFolderPathEntry[];
	/**
	 * Cross-cutting "corridor" folders (often high-outgoing / mixed-topic) that help locate
	 * document-level hubs (bridges / index / authority notes) in the next phase.
	 */
	highwayFolderLeads: HighwayFolderLead[];
	/** Folder path prefixes that should be skipped in subsequent tool calls / iterations. */
	ignoredPathPrefixes: string[];
	/** Stop/coverage signals: what themes/roots are covered vs missing, plus orphan risk. */
	coverage: CoverageAssessment;
	/** Remaining uncertainties to carry into the next iteration or final report. */
	openQuestions: string[];
};

/** Document-hub recon working state. */
export type DocumentReconMemory = {
	/** Document-hub leads refined from tools + LLM submit loops (tasks to find bridge/index/authority notes). */
	refinedDocumentHubLeads: DocumentHubLead[];
	/** Confirmed document hub paths (bridge/index/authority) produced by the submit schema. */
	confirmedDocumentHubPaths: HubDiscoveryDocumentReconSubmit['confirmedDocumentHubPaths'];
	/** Seed documents that were tried and rejected as hubs (avoid repeated attempts). */
	rejectedSeeds: Array<{ path: string; reason: string }>;
	/** Remaining uncertainties to carry into the next iteration or final report. */
	openQuestions: string[];
};

/** Internal pipeline caps for one hub-discovery run. */
export type HubDiscoveryPipelineBudget = {
	maxFolderPages: number;
	maxExploresPerPage: number;
	docShortlistLimit: number;
	globalTreeMaxDepth: number;
	maxFoldersInSnapshot: number;
	maxNodesPerPage: number;
	runDeepenRound: boolean;
	indexBudgetRaw: ReturnType<typeof computeHubDiscoverBudgets>;
};

/** Prepared context after templates + snapshot + shortlist. */
export type HubDiscoveryPrepContext = {
	tm: TemplateManager;
	userGoal: string;
	suggestBudget: HubDiscoveryPipelineBudget;
	world: HubWorldSnapshot;
	worldMetricsForPrompt: Record<string, unknown>;
	documentNodeCount: number;
	initialDocumentShortlist: DocumentHubShortlistRow[];
	baselineExcludedPrefixes: string[];
};

export type {
	CoverageAssessment,
	DocumentHubLead,
	FolderHubCandidate,
	FolderIntuitionRoundOutput,
	FolderNavigationGroup,
	HighwayFolderLead,
};
