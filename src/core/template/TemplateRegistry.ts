import type { PromptId } from '@/service/prompt/PromptId';

/**
 * Category of template. Determines base path under plugin directory.
 */
export type TemplateCategory = 'prompts' | 'tools' | 'agents' | 'ui' | 'indexing' | 'stopwords';

/**
 * Tool result / handler template IDs (search graph inspector, etc.).
 */
export const ToolTemplateId = {
	LocalSearch: 'local-search',
	SearchByDimensions: 'search-by-dimensions',
	RecentChanges: 'recent-changes',
	GraphPathFinding: 'graph-path-finding',
	InspectNoteContext: 'inspect-note-context',
	ExploreFolder: 'explore-folder',
	OrphanNotes: 'orphan-notes',
	FindKeyNodes: 'find-key-nodes',
	GraphTraversal: 'graph-traversal',
} as const;

export type ToolTemplateId = (typeof ToolTemplateId)[keyof typeof ToolTemplateId];

/**
 * Agent helper template IDs (result snapshot, evidence hint).
 */
export const AgentTemplateId = {
	ResultSnapshot: 'result-snapshot',
	EvidenceHint: 'evidence-hint',
	EvidenceGroupSharedContext: 'evidence-group-shared-context',
	/** Weaved context from recon merged paths (structure + mesh). */
	WeavePathsContext: 'weave-paths-context',
	ReportBlockBlueprintLine: 'report-block-blueprint-line',
} as const;

export type AgentTemplateId = (typeof AgentTemplateId)[keyof typeof AgentTemplateId];

/**
 * Internal indexing templates (not prompts/tools).
 */
export const IndexingTemplateId = {
	CodeStopwords: 'indexing-code-stopwords',
	/** Hub-discover deterministic next-direction hint; render with `{ gapPrefixes: string[] }`. */
	HubDiscoverNextDirections: 'indexing-hub-discover-next-directions',
	/** Weak title/filename tokens filtered in cluster hub title token extraction. */
	ClusterHubWeakTitleTokens: 'indexing-cluster-hub-weak-title-tokens',
	/** Hub discovery agent: one page of folder tree for LLM (`folderRows` + Handlebars; no path mapping block). */
	HubDiscoveryFolderTreePage: 'indexing-hub-discovery-folder-tree-page',
	/** Hub discovery: empty-folder-tree placeholder Markdown. */
	HubDiscoveryFolderTreeEmpty: 'indexing-hub-discovery-folder-tree-empty',
	/** Hub discovery agent: default `userGoal` when caller omits `options.userGoal` (plain text; Handlebars optional). */
	HubDiscoveryDefaultUserGoal: 'indexing-hub-discovery-default-user-goal',
	/** Hub discovery agent: `agentPipelineBudget.note` in world metrics JSON (plain text for the LLM). */
	HubDiscoveryPipelineBudgetNote: 'indexing-hub-discovery-pipeline-budget-note',
	/** Knowledge intuition agent: default `userGoal` when caller omits `options.userGoal` (plain text). */
	KnowledgeIntuitionDefaultUserGoal: 'indexing-knowledge-intuition-default-user-goal',
	/** Knowledge intuition agent: rendered vault skeleton Markdown (Handlebars; English). */
	KnowledgeIntuitionSkeletonMarkdown: 'indexing-knowledge-intuition-skeleton-markdown',
	/** Knowledge intuition agent: prep-only output when `stopAt: prep` (Handlebars; English). */
	KnowledgeIntuitionPrepOnlyMarkdown: 'indexing-knowledge-intuition-prep-only-markdown',
} as const;

export type IndexingTemplateId = (typeof IndexingTemplateId)[keyof typeof IndexingTemplateId];

/**
 * Stopword templates used by TextRank/token pipelines.
 * Add `templates/stopwords/{stem}.md`, a new key here, and a {@link TEMPLATE_METADATA} row; hydration loads every id.
 */
export const StopwordTemplateId = {
	Common: 'stopwords-common',
	English: 'stopwords-en',
	Chinese: 'stopwords-zh',
} as const;

export type StopwordTemplateId = (typeof StopwordTemplateId)[keyof typeof StopwordTemplateId];

/**
 * Union of all template identifiers.
 */
export type TemplateId = PromptId | ToolTemplateId | AgentTemplateId | IndexingTemplateId | StopwordTemplateId;

/**
 * Metadata for a single template (path, options). No content.
 */
export interface TemplateMetadata {
	/** Path relative to plugin root, e.g. templates/prompts/foo.md */
	path: string;
	category: TemplateCategory;
	/** For prompts: whether LLM output is expected to be JSON */
	expectsJson?: boolean;
	/** For prompts: extra JSON instruction (e.g. "Return only JSON array") */
	jsonConstraint?: string;
	/** For prompts: paired system prompt id when this is a user prompt */
	systemPromptId?: PromptId;
}

/** Path prefix per category (under plugin dir). All under templates/. */
const CATEGORY_PREFIX: Record<TemplateCategory, string> = {
	prompts: 'templates/prompts',
	tools: 'templates/tools',
	agents: 'templates/agents',
	ui: 'templates/ui',
	indexing: 'templates/indexing',
	stopwords: 'templates/stopwords',
};

function meta(
	category: TemplateCategory,
	fileStem: string,
	opts?: Partial<Pick<TemplateMetadata, 'expectsJson' | 'jsonConstraint' | 'systemPromptId'>>
): TemplateMetadata {
	const ext = 'md';
	return {
		category,
		path: `${CATEGORY_PREFIX[category]}/${fileStem}.${ext}`,
		...opts,
	};
}

/**
 * Central registry: template id -> metadata only. Content loaded on demand via TemplateManager.
 */
export const TEMPLATE_METADATA: Record<TemplateId, TemplateMetadata> = {
	// --- Prompts (category prompts) ---
	'conversation-system': meta('prompts', 'conversation-system'),
	'conversation-summary-short': meta('prompts', 'conversation-summary-short'),
	'conversation-summary-full': meta('prompts', 'conversation-summary-full'),
	'project-summary-short': meta('prompts', 'project-summary-short'),
	'project-summary-full': meta('prompts', 'project-summary-full'),
	'search-rerank-rank-gpt': meta('prompts', 'search-rerank-rank-gpt'),
	'application-generate-title': meta('prompts', 'application-generate-title'),
	'memory-extract-candidates-json': meta('prompts', 'memory-extract-candidates-json', { expectsJson: true, jsonConstraint: 'Return only the JSON array, nothing else.' }),
	'prompt-quality-eval-json': meta('prompts', 'prompt-quality-eval-json', { expectsJson: true, jsonConstraint: 'Return only the JSON object, nothing else.' }),
	'prompt-rewrite-with-library': meta('prompts', 'prompt-rewrite-with-library'),
	'doc-summary-short': meta('prompts', 'doc-summary-short'),
	'doc-summary-full': meta('prompts', 'doc-summary-full'),
	'ai-analysis-session-summary': meta('prompts', 'ai-analysis-session-summary'),
	'image-description': meta('prompts', 'image-description'),
	'image-summary': meta('prompts', 'image-summary'),
	'folder-project-summary': meta('prompts', 'folder-project-summary'),
	'ai-analysis-followup': meta('prompts', 'ai-analysis-followup'),
	'ai-analysis-followup-system': meta('prompts', 'ai-analysis-followup-system'),
	'ai-analysis-title': meta('prompts', 'ai-analysis-dashboard-title'),
	'ai-analysis-doc-simple-scope': meta('prompts', 'ai-analysis-doc-simple-scope'),
	'ai-analysis-doc-simple-system': meta('prompts', 'ai-analysis-doc-simple-system'),
	'ai-analysis-suggest-follow-up-questions-system': meta('prompts', 'ai-analysis-suggest-follow-up-questions-system'),
	'ai-analysis-suggest-follow-up-questions': meta('prompts', 'ai-analysis-suggest-follow-up-questions', { systemPromptId: 'ai-analysis-suggest-follow-up-questions-system' as PromptId }),
	'ai-analysis-query-classifier-system': meta('prompts', 'ai-analysis-query-classifier-system'),
	'ai-analysis-query-classifier': meta('prompts', 'ai-analysis-query-classifier', { expectsJson: true, jsonConstraint: 'Return only the JSON object, no markdown or explanation.', systemPromptId: 'ai-analysis-query-classifier-system' as PromptId }),
	'ai-analysis-search-architect-system': meta('prompts', 'ai-analysis-search-architect-system'),
	'ai-analysis-search-architect': meta('prompts', 'ai-analysis-search-architect', { expectsJson: true, jsonConstraint: 'Return only the JSON object with physical_tasks, no markdown or explanation.', systemPromptId: 'ai-analysis-search-architect-system' as PromptId }),
	// Retired prompts — PromptId values kept by hook but template files removed; no live code uses these.
	'ai-analysis-dimension-recon-system': meta('prompts', 'ai-analysis-dimension-recon-system'),
	'ai-analysis-dimension-recon': meta('prompts', 'ai-analysis-dimension-recon'),
	'ai-analysis-dimension-evidence-system': meta('prompts', 'ai-analysis-dimension-evidence-system'),
	'ai-analysis-dimension-evidence': meta('prompts', 'ai-analysis-dimension-evidence'),
	'ai-analysis-dimension-evidence-batch': meta('prompts', 'ai-analysis-dimension-evidence-batch'),
	'ai-analysis-task-consolidator-system': meta('prompts', 'ai-analysis-task-consolidator-system'),
	'ai-analysis-task-consolidator': meta('prompts', 'ai-analysis-task-consolidator'),
	'ai-analysis-group-context-system': meta('prompts', 'ai-analysis-group-context-system'),
	'ai-analysis-group-context-single': meta('prompts', 'ai-analysis-group-context-single'),
	'ai-analysis-overview-logic-model-system': meta('prompts', 'ai-analysis-overview-logic-model-system'),
	'ai-analysis-overview-logic-model': meta('prompts', 'ai-analysis-overview-logic-model'),
	'ai-analysis-overview-logic-model-from-recon-system': meta('prompts', 'ai-analysis-overview-logic-model-from-recon-system'),
	'ai-analysis-overview-logic-model-from-recon': meta('prompts', 'ai-analysis-overview-logic-model-from-recon'),
	'ai-analysis-dashboard-update-topics-system': meta('prompts', 'ai-analysis-dashboard-update-topics-system'),
	'ai-analysis-dashboard-update-topics': meta('prompts', 'ai-analysis-dashboard-update-topics'),
	'ai-analysis-dashboard-update-blocks-system': meta('prompts', 'ai-analysis-dashboard-update-blocks-system'),
	'ai-analysis-dashboard-update-blocks': meta('prompts', 'ai-analysis-dashboard-update-blocks'),
	'ai-analysis-report-plan-system': meta('prompts', 'ai-analysis-report-plan-system'),
	'ai-analysis-report-plan': meta('prompts', 'ai-analysis-report-plan'),
	'ai-analysis-visual-blueprint-system': meta('prompts', 'ai-analysis-visual-blueprint-system'),
	'ai-analysis-visual-blueprint': meta('prompts', 'ai-analysis-visual-blueprint'),
	'ai-analysis-report-body-blocks-system': meta('prompts', 'ai-analysis-report-body-blocks-system'),
	'ai-analysis-report-body-blocks': meta('prompts', 'ai-analysis-report-body-blocks'),
	'ai-analysis-report-appendices-blocks-system': meta('prompts', 'ai-analysis-report-appendices-blocks-system'),
	'ai-analysis-report-appendices-blocks': meta('prompts', 'ai-analysis-report-appendices-blocks'),
	'ai-analysis-review-blocks-system': meta('prompts', 'ai-analysis-review-blocks-system'),
	'ai-analysis-review-blocks': meta('prompts', 'ai-analysis-review-blocks'),
	'ai-analysis-dashboard-update-plan-system': meta('prompts', 'ai-analysis-dashboard-update-plan-system'),
	'ai-analysis-dashboard-update-plan': meta('prompts', 'ai-analysis-dashboard-update-plan'),
	'ai-analysis-mermaid-fix-system': meta('prompts', 'ai-analysis-mermaid-fix-system'),
	'ai-analysis-mermaid-fix': meta('prompts', 'ai-analysis-mermaid-fix'),
	'ai-analysis-summary-system': meta('prompts', 'ai-analysis-dashboard-result-summary-system'),
	'search-ai-summary': meta('prompts', 'ai-analysis-dashboard-result-summary', { systemPromptId: 'ai-analysis-summary-system' as PromptId }),
	'ai-analysis-overview-regenerate': meta('prompts', 'ai-analysis-overview-regenerate'),
	'ai-analysis-overview-mermaid-render-system': meta('prompts', 'ai-analysis-overview-mermaid-render-system'),
	'ai-analysis-overview-mermaid-render': meta('prompts', 'ai-analysis-overview-mermaid-render', { systemPromptId: 'ai-analysis-overview-mermaid-render-system' as PromptId }),
	'ai-analysis-save-filename': meta('prompts', 'ai-analysis-save-filename'),
	'ai-analysis-save-folder': meta('prompts', 'ai-analysis-save-folder'),
	// Vault pipeline prompts
	'ai-analysis-vault-classify-system': meta('prompts', 'ai-analysis-vault-classify-system'),
	'ai-analysis-vault-classify': meta('prompts', 'ai-analysis-vault-classify', { systemPromptId: 'ai-analysis-vault-classify-system' as PromptId }),
	'ai-analysis-vault-decompose-system': meta('prompts', 'ai-analysis-vault-decompose-system'),
	'ai-analysis-vault-decompose': meta('prompts', 'ai-analysis-vault-decompose', { systemPromptId: 'ai-analysis-vault-decompose-system' as PromptId }),
	'ai-analysis-vault-recon-plan-system': meta('prompts', 'ai-analysis-vault-recon-plan-system'),
	'ai-analysis-vault-recon-plan': meta('prompts', 'ai-analysis-vault-recon-plan', { systemPromptId: 'ai-analysis-vault-recon-plan-system' as PromptId }),
	'ai-analysis-vault-recon-submit-system': meta('prompts', 'ai-analysis-vault-recon-submit-system'),
	'ai-analysis-vault-recon-submit': meta('prompts', 'ai-analysis-vault-recon-submit', { systemPromptId: 'ai-analysis-vault-recon-submit-system' as PromptId }),
	'ai-analysis-vault-present-plan-system': meta('prompts', 'ai-analysis-vault-present-plan-system'),
	'ai-analysis-vault-present-plan': meta('prompts', 'ai-analysis-vault-present-plan', { systemPromptId: 'ai-analysis-vault-present-plan-system' as PromptId }),
	'ai-analysis-vault-report-system': meta('prompts', 'ai-analysis-vault-report-system'),
	'ai-analysis-vault-report': meta('prompts', 'ai-analysis-vault-report', { systemPromptId: 'ai-analysis-vault-report-system' as PromptId }),
	'doc-tag-generate-json': meta('prompts', 'doc-tag-generate-json', {
		expectsJson: true,
		jsonConstraint:
			'Return only the JSON object with topicTagEntries, functionalTagEntries (1–5 ids from closed list, never empty), context tag arrays, optional inferCreatedAt, and optional docType/docTypeConfidence/docTypeReasoning (folded into functional labels server-side), nothing else.',
	}),
	'hub-doc-summary-system': meta('prompts', 'hub-doc-summary-system'),
	'hub-doc-summary': meta('prompts', 'hub-doc-summary', {
		expectsJson: true,
		jsonConstraint:
			'Return exactly one JSON object with keys shortSummary, fullSummary, coreFacts, queryAnchors, tagTopicDistribution, timeDimension, keyPatterns. No markdown fences.',
		systemPromptId: 'hub-doc-summary-system' as PromptId,
	}),
	'hub-discover-round-review-system': meta('prompts', 'hub-discover-round-review-system'),
	'hub-discover-round-review': meta('prompts', 'hub-discover-round-review', {
		expectsJson: true,
		jsonConstraint:
			'Return only JSON: coverageSufficient, quality, needAnotherRound, confidence, summary, strengths, issues, nextDirections, suggestedDiscoveryModes, targetPathPrefixes, stopReason.',
		systemPromptId: 'hub-discover-round-review-system' as PromptId,
	}),
	'hub-semantic-merge-system': meta('prompts', 'hub-semantic-merge-system'),
	'hub-semantic-merge': meta('prompts', 'hub-semantic-merge', {
		expectsJson: true,
		jsonConstraint:
			'Return only JSON: mergeGroups (array of objects with representativeStableKey, memberStableKeys, reason, confidence 0-1, mergeKind duplicate|alias|same_topic, optional risks array). No markdown fences.',
		systemPromptId: 'hub-semantic-merge-system' as PromptId,
	}),
	'hub-discovery-folder-recon-submit-system': meta('prompts', 'hub-discovery-folder-recon-submit-system'),
	'hub-discovery-folder-recon-submit': meta('prompts', 'hub-discovery-folder-recon-submit', {
		expectsJson: true,
		jsonConstraint:
			'Return only one JSON object: confirmedFolderHubCandidates, folderNavigationGroups, rejectedFolderPaths, highwayFolderLeads, ignoredPathPrefixes, updatedCoverage, openQuestions, should_stop, findingsSummary.',
		systemPromptId: 'hub-discovery-folder-recon-submit-system' as PromptId,
	}),
	'hub-discovery-document-recon-submit-system': meta('prompts', 'hub-discovery-document-recon-submit-system'),
	'hub-discovery-document-recon-submit': meta('prompts', 'hub-discovery-document-recon-submit', {
		expectsJson: true,
		jsonConstraint:
			'Return only one JSON object: refinedDocumentHubLeads, confirmedDocumentHubPaths, rejectedSeeds, openQuestions, should_stop, findingsSummary.',
		systemPromptId: 'hub-discovery-document-recon-submit-system' as PromptId,
	}),
	'knowledge-intuition-plan-system': meta('prompts', 'knowledge-intuition-plan-system'),
	'knowledge-intuition-plan': meta('prompts', 'knowledge-intuition-plan', {
		systemPromptId: 'knowledge-intuition-plan-system' as PromptId,
	}),
	'knowledge-intuition-submit-system': meta('prompts', 'knowledge-intuition-submit-system'),
	'knowledge-intuition-submit': meta('prompts', 'knowledge-intuition-submit', {
		expectsJson: true,
		jsonConstraint:
			'Return only one JSON object: findingsSummary, optional theme, partitions (max 6, entryPaths max 2 each), coreEntities (max 8, whyItMatters each), topology (max 8), evolution, entryPoints (max 24; count N from Vault scale in user prompt; intent, startPaths max 2, rich whatYouWillFind), optional openQuestions (max 6), should_stop.',
		systemPromptId: 'knowledge-intuition-submit-system' as PromptId,
	}),
	'context-memory': meta('prompts', 'context-memory'),
	'user-profile-context': meta('prompts', 'user-profile-context'),
	'profile-from-vault-json': meta('prompts', 'profile-from-vault-json', { expectsJson: true, jsonConstraint: 'Return only the JSON array, nothing else.' }),
	'user-profile-organize-markdown': meta('prompts', 'user-profile-organize-markdown'),
	'message-resources': meta('prompts', 'message-resources'),

	// --- Tools ---
	[ToolTemplateId.LocalSearch]: meta('tools', 'local-search'),
	[ToolTemplateId.SearchByDimensions]: meta('tools', 'search-by-dimensions'),
	[ToolTemplateId.RecentChanges]: meta('tools', 'recent-changes'),
	[ToolTemplateId.GraphPathFinding]: meta('tools', 'graph-path-finding'),
	[ToolTemplateId.InspectNoteContext]: meta('tools', 'inspect-note-context'),
	[ToolTemplateId.ExploreFolder]: meta('tools', 'explore-folder'),
	[ToolTemplateId.OrphanNotes]: meta('tools', 'orphan-notes'),
	[ToolTemplateId.FindKeyNodes]: meta('tools', 'find-key-nodes'),
	[ToolTemplateId.GraphTraversal]: meta('tools', 'graph-traversal'),

	// --- Agents ---
	[AgentTemplateId.ResultSnapshot]: meta('agents', 'result-snapshot'),
	[AgentTemplateId.EvidenceHint]: meta('agents', 'evidence-hint'),
	[AgentTemplateId.EvidenceGroupSharedContext]: meta('agents', 'evidence-group-shared-context'),
	[AgentTemplateId.WeavePathsContext]: meta('agents', 'weave-paths-context'),
	[AgentTemplateId.ReportBlockBlueprintLine]: meta('agents', 'report-block-blueprint-line'),

	// --- Indexing (Handlebars; loaded at plugin boot for markdown chunking helpers) ---
	[IndexingTemplateId.CodeStopwords]: meta('indexing', 'code-stopwords'),
	[IndexingTemplateId.HubDiscoverNextDirections]: meta('indexing', 'hub-discover-next-directions'),
	[IndexingTemplateId.ClusterHubWeakTitleTokens]: meta('indexing', 'cluster-hub-weak-title-tokens'),
	[IndexingTemplateId.HubDiscoveryFolderTreePage]: meta('indexing', 'hub-discovery-folder-tree-page'),
	[IndexingTemplateId.HubDiscoveryFolderTreeEmpty]: meta('indexing', 'hub-discovery-folder-tree-empty'),
	[IndexingTemplateId.HubDiscoveryDefaultUserGoal]: meta('indexing', 'hub-discovery-default-user-goal'),
	[IndexingTemplateId.HubDiscoveryPipelineBudgetNote]: meta('indexing', 'hub-discovery-pipeline-budget-note'),
	[IndexingTemplateId.KnowledgeIntuitionDefaultUserGoal]: meta('indexing', 'knowledge-intuition-default-user-goal'),
	[IndexingTemplateId.KnowledgeIntuitionSkeletonMarkdown]: meta('indexing', 'knowledge-intuition-skeleton-markdown'),
	[IndexingTemplateId.KnowledgeIntuitionPrepOnlyMarkdown]: meta('indexing', 'knowledge-intuition-prep-only-markdown'),
	[StopwordTemplateId.Common]: meta('stopwords', 'common'),
	[StopwordTemplateId.English]: meta('stopwords', 'en'),
	[StopwordTemplateId.Chinese]: meta('stopwords', 'zh'),
};

export function getTemplateMetadata(id: TemplateId): TemplateMetadata {
	const m = TEMPLATE_METADATA[id];
	if (!m) throw new Error(`Unknown template id: ${id}`);
	return m;
}

export function isPromptTemplateId(id: TemplateId): id is PromptId {
	return id in TEMPLATE_METADATA && TEMPLATE_METADATA[id as TemplateId].category === 'prompts';
}
