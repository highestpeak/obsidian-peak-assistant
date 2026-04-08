import type { TemplateManager } from '@/core/template/TemplateManager';
import type { BackboneMapResult } from '@/service/search/index/helper/backbone';
import type { computeHubDiscoverBudgets } from '@/service/search/index/helper/hub/hubDiscover';

/** One digest row used to render compact folder tree lines. */
export type FolderTreeNodeDigest = {
	path: string;
	name: string;
	depth: number;
	childFolderCount: number;
	subtreeMaxDepth: number;
	subtreeAvgDepth: number;
	docCount: number;
	directDocCount: number;
	topKeywords: string[];
	topTopics: string[];
	topTopicsWeighted?: string;
	topicPurity?: number;
	containerPenalty?: number;
	strongChildDocShare?: number;
	residualRatio?: number;
	strongChildCount?: number;
	folderRank?: number;
	hubGraphScore?: number;
	docOutgoing: number;
	docIncoming: number;
	fileNameTokenSample: string[];
	subfolderNameTokenSample: string[];
};

export type HubFolderTreePage = {
	pageId: string;
	pageIndex: number;
	totalPages: number;
	compactTreeMarkdown: string;
	pathsOnPage: string[];
};

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
import type {
	IntuitionEntity,
	IntuitionEntryPoint,
	IntuitionPartition,
	IntuitionTopology,
} from '@/core/schemas/agents';

/**
 * Working memory accumulated across intuition submit iterations.
 */
export type IntuitionMemory = {
	theme?: string;
	partitions: IntuitionPartition[];
	coreEntities: IntuitionEntity[];
	topology: IntuitionTopology[];
	evolution: string;
	entryPoints: IntuitionEntryPoint[];
	openQuestions: string[];
};

/** Prepared context: deterministic signals + rendered digests for prompts. */
export type IntuitionPrepContext = {
	tm: TemplateManager;
	userGoal: string;
	vaultName: string;
	currentDateLabel: string;
	baselineExcludedPrefixes: string[];
	worldMetricsForPrompt: Record<string, unknown>;
	backbone: BackboneMapResult;
	world: HubWorldSnapshot;
	documentShortlist: DocumentHubShortlistRow[];
	/** Ranked folder table + deep candidates (single block for plan prompts). */
	folderSignalsMarkdown: string;
	/** World + backbone numeric summary (Markdown lines). */
	vaultSummaryMarkdown: string;
	/** Top backbone edges as compact Markdown lines (plan prompt; JSON kept in backboneEdgesJson for submit). */
	backboneEdgesMarkdown: string;
	/** SQL-ranked doc hubs as compact Markdown lines. */
	documentShortlistMarkdown: string;
	/** Excluded path prefixes as Markdown bullets. */
	baselineExcludedMarkdown: string;
	/** Deterministic folder/doc counts for submit-step entry-point heuristics. */
	vaultScaleHintMarkdown: string;
	folderTreeMarkdown: string;
	backboneMarkdownExcerpt: string;
	backboneEdgesJson: string;
	indexBudgetRaw: ReturnType<typeof computeHubDiscoverBudgets>;
};

/** Options for {@link KnowledgeIntuitionAgent}. */
export type KnowledgeIntuitionAgentOptions = {
	/** High-level intent for planning and submit. */
	userGoal?: string;
	/** Display name in the markdown title (e.g. vault folder name). */
	vaultName?: string;
	/** ISO or human date string for the skeleton title. */
	currentDateLabel?: string;
	/** Debug: stop after prep (no LLM). */
	stopAt?: 'prep';
	/** Debug: cap recon iterations (1–6). */
	maxIterations?: number;
};

/** Full agent result: prep payload, merged memory, rendered markdown + JSON. */
export type KnowledgeIntuitionAgentResult = {
	prep: IntuitionPrepContext;
	memory: IntuitionMemory;
	markdown: string;
	json: Record<string, unknown>;
};
