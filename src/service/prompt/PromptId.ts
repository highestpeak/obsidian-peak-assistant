export interface UserPersonaConfig {
	appeal?: string;
	detail_level?: string;
}
export interface FollowUpQuestionVariables {
	initialPrompt: string;
	dashboardBlocks?: string;
	confirmedFacts?: string;
	topics?: string;
}
export interface AiSummaryVariables {
	originalQuery: string;
	userQuery: string;
	mermaidOverview?: string;
	dashboardBlockPlan?: string;
}
/**
 * Prompt template definition.
 */
export interface PromptTemplate {
	/** Template text with {{variable}} placeholders */
	template: string;
	/** Whether this prompt expects JSON output */
	expectsJson?: boolean;
	/** Additional instructions for JSON output (e.g., "Return only JSON array") */
	jsonConstraint?: string;
}

/**
 * Centralized prompt identifier enum.
 * All prompts used across the application should be registered here.
 */
export enum PromptId {
	// Chat prompts
	ConversationSystem = 'conversation-system', // todo we need to tell the model. that we have [[xxx]] @xxx@ /xxx/ tags syntax. to let it know he can read these things.
	ConversationSummaryShort = 'conversation-summary-short',
	ConversationSummaryFull = 'conversation-summary-full',
	ProjectSummaryShort = 'project-summary-short',
	ProjectSummaryFull = 'project-summary-full',

	SearchRerankRankGpt = 'search-rerank-rank-gpt',

	// Application prompts (title generation)
	ApplicationGenerateTitle = 'application-generate-title',

	// Memory/Profile prompts
	MemoryExtractCandidatesJson = 'memory-extract-candidates-json',

	// Prompt rewrite prompts
	PromptQualityEvalJson = 'prompt-quality-eval-json',
	PromptRewriteWithLibrary = 'prompt-rewrite-with-library',

	/** One-sentence short summary (preferred for indexing). */
	DocSummaryShort = 'doc-summary-short',
	/** Long-form summary; may use short summary + TextRank anchors. */
	DocSummaryFull = 'doc-summary-full',
	ImageDescription = 'image-description',
	ImageSummary = 'image-summary',
	FolderProjectSummary = 'folder-project-summary',
	/** Topic + functional + context tags and optional vault document-type classification (same JSON). */
	DocTagGenerateJson = 'doc-tag-generate-json',
	/** System: Hub navigation note JSON fill (maintenance). Paired with {@link HubDocSummary}. */
	HubDocSummarySystem = 'hub-doc-summary-system',
	/** User: Hub metadata + draft markdown + vault excerpts → JSON for hub_doc sections. */
	HubDocSummary = 'hub-doc-summary',
	/** System: Whole-round hub discovery review (coverage + next directions). */
	HubDiscoverRoundReviewSystem = 'hub-discover-round-review-system',
	/** User: Round summary JSON → structured review. */
	HubDiscoverRoundReview = 'hub-discover-round-review',
	/** System: Hub semantic merge (duplicate / same-topic folds). */
	HubSemanticMergeSystem = 'hub-semantic-merge-system',
	/** User: Hub card JSON → merge groups (does not invent stableKeys). */
	HubSemanticMerge = 'hub-semantic-merge',
	/** System: Folder hub recon — structured submit after host ran plan tools. */
	HubDiscoveryFolderReconSubmitSystem = 'hub-discovery-folder-recon-submit-system',
	/** User: memory + tree + plan text + tool results for folder submit. */
	HubDiscoveryFolderReconSubmit = 'hub-discovery-folder-recon-submit',

	/** System: Document hub recon — structured submit after tools. */
	HubDiscoveryDocumentReconSubmitSystem = 'hub-discovery-document-recon-submit-system',
	/** User: assembled context for document submit. */
	HubDiscoveryDocumentReconSubmit = 'hub-discovery-document-recon-submit',

	/** System: Knowledge intuition — plan step (tools optional). */
	KnowledgeIntuitionPlanSystem = 'knowledge-intuition-plan-system',
	/** User: backbone + folder digest + document shortlist for intuition planning. */
	KnowledgeIntuitionPlan = 'knowledge-intuition-plan',
	/** System: Knowledge intuition — structured submit after tools. */
	KnowledgeIntuitionSubmitSystem = 'knowledge-intuition-submit-system',
	/** User: memory + tool results for intuition submit. */
	KnowledgeIntuitionSubmit = 'knowledge-intuition-submit',

	// Search prompts
	/** Session history compression; preserves user background, pains, evidence paths. */
	AiAnalysisSessionSummary = 'ai-analysis-session-summary',
	// AI analysis dashboard update agent (update overviewMermaid/sources/topics/graph/blocks from memory evidence)
	AiAnalysisSummarySystem = 'ai-analysis-summary-system',
	AiAnalysisSummary = 'search-ai-summary',
	/** Regenerate overview from current result snapshot (UI only; not used by pipeline). */
	AiAnalysisOverviewRegenerate = 'ai-analysis-overview-regenerate',
	/** Phase 2: render logic model → flowchart Mermaid. */
	AiAnalysisOverviewMermaidRenderSystem = 'ai-analysis-overview-mermaid-render-system',
	AiAnalysisOverviewMermaidRender = 'ai-analysis-overview-mermaid-render',
	// AI analysis title (generated at end of analysis; used for save/recent/folder suggestion)
	AiAnalysisTitle = 'ai-analysis-title',
	/** Doc Simple mode: scope prefix (current file only + full coverage). */
	AiAnalysisDocSimpleScope = 'ai-analysis-doc-simple-scope',
	/** Doc Simple mode: system prompt for single-file Q&A agent. */
	AiAnalysisDocSimpleSystem = 'ai-analysis-doc-simple-system',
	AiAnalysisSuggestFollowUpQuestionsSystem = 'ai-analysis-suggest-follow-up-questions-system',
	/** Suggest follow-up questions from full session context (not from topics). */
	AiAnalysisSuggestFollowUpQuestions = 'ai-analysis-suggest-follow-up-questions',
	/** Slot-routing: lightweight query classification (queryType, hints). JSON output. */
	AiAnalysisQueryClassifierSystem = 'ai-analysis-query-classifier-system',
	AiAnalysisQueryClassifier = 'ai-analysis-query-classifier',
	/** Search Architect: collapse dimensions into physical tasks (dimension-to-task collapse). */
	AiAnalysisSearchArchitectSystem = 'ai-analysis-search-architect-system',
	AiAnalysisSearchArchitect = 'ai-analysis-search-architect',
	/** Dimension recon: system. */
	AiAnalysisDimensionReconSystem = 'ai-analysis-dimension-recon-system',
	/** Dimension recon: user prompt. */
	AiAnalysisDimensionRecon = 'ai-analysis-dimension-recon',
	/** Dimension evidence: system. */
	AiAnalysisDimensionEvidenceSystem = 'ai-analysis-dimension-evidence-system',
	/** Dimension evidence: user prompt. */
	AiAnalysisDimensionEvidence = 'ai-analysis-dimension-evidence',
	/** Dimension evidence batch: user prompt. */
	AiAnalysisDimensionEvidenceBatch = 'ai-analysis-dimension-evidence-batch',
	/** Task consolidator: system. */
	AiAnalysisTaskConsolidatorSystem = 'ai-analysis-task-consolidator-system',
	/** Task consolidator: user prompt. */
	AiAnalysisTaskConsolidator = 'ai-analysis-task-consolidator',
	/** Group context: system. */
	AiAnalysisGroupContextSystem = 'ai-analysis-group-context-system',
	/** Group context single: user prompt. */
	AiAnalysisGroupContextSingle = 'ai-analysis-group-context-single',
	/** Overview logic model: system. */
	AiAnalysisOverviewLogicModelSystem = 'ai-analysis-overview-logic-model-system',
	/** Overview logic model: user prompt. */
	AiAnalysisOverviewLogicModel = 'ai-analysis-overview-logic-model',
	/** Overview logic model from recon: system. */
	AiAnalysisOverviewLogicModelFromReconSystem = 'ai-analysis-overview-logic-model-from-recon-system',
	/** Overview logic model from recon: user prompt. */
	AiAnalysisOverviewLogicModelFromRecon = 'ai-analysis-overview-logic-model-from-recon',
	/** Dashboard update topics: system. */
	AiAnalysisDashboardUpdateTopicsSystem = 'ai-analysis-dashboard-update-topics-system',
	/** Dashboard update topics: user prompt. */
	AiAnalysisDashboardUpdateTopics = 'ai-analysis-dashboard-update-topics',
	/** Dashboard update blocks: system. */
	AiAnalysisDashboardUpdateBlocksSystem = 'ai-analysis-dashboard-update-blocks-system',
	/** Dashboard update blocks: user prompt. */
	AiAnalysisDashboardUpdateBlocks = 'ai-analysis-dashboard-update-blocks',
	/** Report plan: system. */
	AiAnalysisReportPlanSystem = 'ai-analysis-report-plan-system',
	/** Report plan: user prompt. */
	AiAnalysisReportPlan = 'ai-analysis-report-plan',
	/** Visual blueprint: system. */
	AiAnalysisVisualBlueprintSystem = 'ai-analysis-visual-blueprint-system',
	/** Visual blueprint: user prompt. */
	AiAnalysisVisualBlueprint = 'ai-analysis-visual-blueprint',
	/** Report body blocks: system. */
	AiAnalysisReportBodyBlocksSystem = 'ai-analysis-report-body-blocks-system',
	/** Report body blocks: user prompt. */
	AiAnalysisReportBodyBlocks = 'ai-analysis-report-body-blocks',
	/** Report appendices blocks: system. */
	AiAnalysisReportAppendicesBlocksSystem = 'ai-analysis-report-appendices-blocks-system',
	/** Report appendices blocks: user prompt. */
	AiAnalysisReportAppendicesBlocks = 'ai-analysis-report-appendices-blocks',
	/** Review blocks: system. */
	AiAnalysisReviewBlocksSystem = 'ai-analysis-review-blocks-system',
	/** Review blocks: user prompt. */
	AiAnalysisReviewBlocks = 'ai-analysis-review-blocks',
	/** Dashboard update plan: system. */
	AiAnalysisDashboardUpdatePlanSystem = 'ai-analysis-dashboard-update-plan-system',
	/** Dashboard update plan: user prompt. */
	AiAnalysisDashboardUpdatePlan = 'ai-analysis-dashboard-update-plan',
	/** Mermaid fix: system. */
	AiAnalysisMermaidFixSystem = 'ai-analysis-mermaid-fix-system',
	/** Mermaid fix: user prompt. */
	AiAnalysisMermaidFix = 'ai-analysis-mermaid-fix',
	/** Unified follow-up user prompt (Summary, Graph, Sources, Blocks, Full). Caller builds contextContent. */
	AiAnalysisFollowup = 'ai-analysis-followup',
	/** System prompt for all follow-up chats (Topic, Continue, Graph, Blocks, Sources). */
	AiAnalysisFollowupSystem = 'ai-analysis-followup-system',
	// AI analysis save dialog (filename/folder suggestions)
	AiAnalysisSaveFileName = 'ai-analysis-save-filename',
	AiAnalysisSaveFolder = 'ai-analysis-save-folder',

	// Vault pipeline prompts (VaultSearchAgent phases)
	/** Vault query understanding: system (combined classify + decompose). */
	AiAnalysisVaultQueryUnderstandingSystem = 'ai-analysis-vault-query-understanding-system',
	/** Vault query understanding: user prompt (combined classify + decompose). */
	AiAnalysisVaultQueryUnderstanding = 'ai-analysis-vault-query-understanding',
	/** Vault classify: system (static). */
	AiAnalysisVaultClassifySystem = 'ai-analysis-vault-classify-system',
	/** Vault classify: user prompt with query + vault context. */
	AiAnalysisVaultClassify = 'ai-analysis-vault-classify',
	/** Vault decompose: system (static). */
	AiAnalysisVaultDecomposeSystem = 'ai-analysis-vault-decompose-system',
	/** Vault decompose: user prompt with classify result. */
	AiAnalysisVaultDecompose = 'ai-analysis-vault-decompose',
	/** Vault recon plan: system with tool list (task-specific tool hints). */
	AiAnalysisVaultReconPlanSystem = 'ai-analysis-vault-recon-plan-system',
	/** Vault recon plan: user message with task + search leads. */
	AiAnalysisVaultReconPlan = 'ai-analysis-vault-recon-plan',
	/** Vault recon submit: system (static). */
	AiAnalysisVaultReconSubmitSystem = 'ai-analysis-vault-recon-submit-system',
	/** Vault recon submit: user message with tool results. */
	AiAnalysisVaultReconSubmit = 'ai-analysis-vault-recon-submit',
	/** Vault present-plan: system (static). */
	AiAnalysisVaultPresentPlanSystem = 'ai-analysis-vault-present-plan-system',
	/** Vault present-plan: user prompt with evidence list. */
	AiAnalysisVaultPresentPlan = 'ai-analysis-vault-present-plan',
	/** Vault report: system (static). */
	AiAnalysisVaultReportSystem = 'ai-analysis-vault-report-system',
	/** Vault report: user prompt with plan + evidence + context. */
	AiAnalysisVaultReport = 'ai-analysis-vault-report',
	/** Vault report executive summary: system (static). */
	AiAnalysisVaultReportSummarySystem = 'ai-analysis-vault-report-summary-system',
	/** Vault report executive summary: user prompt with blocks + evidence. Generated after blocks complete. */
	AiAnalysisVaultReportSummary = 'ai-analysis-vault-report-summary',
	/** Vault SDK playbook: system prompt for SDK vault search agent (tool instruction + type classification). */
	VaultSdkPlaybook = 'ai-analysis-vault-sdk-playbook',

	// Context building templates (internal use)
	ContextMemory = 'context-memory',
	UserProfileContext = 'user-profile-context',
	/** Extract user profile items from vault content (build user profile command) */
	ProfileFromVaultJson = 'profile-from-vault-json',
	/** Organize current user profile into clean markdown */
	UserProfileOrganizeMarkdown = 'user-profile-organize-markdown',
	MessageResources = 'message-resources',
}

/**
 * Search AI Analysis–specific prompt IDs. Each can have its own provider/model in promptModelMap.
 * Shown in a dedicated "Search AI Analysis" section with a "Set All" control.
 */
export const SEARCH_AI_ANALYSIS_PROMPT_IDS: readonly PromptId[] = [
	PromptId.AiAnalysisSessionSummary,
	PromptId.AiAnalysisSummary,
	PromptId.AiAnalysisOverviewMermaidRender,
	PromptId.AiAnalysisOverviewRegenerate,
	PromptId.AiAnalysisTitle,
	PromptId.AiAnalysisDocSimpleScope,
	PromptId.AiAnalysisDocSimpleSystem,
	PromptId.AiAnalysisSuggestFollowUpQuestions,
	PromptId.AiAnalysisQueryClassifier,
	PromptId.AiAnalysisSearchArchitect,
	PromptId.AiAnalysisFollowup,
	PromptId.AiAnalysisFollowupSystem,
	PromptId.AiAnalysisSaveFileName,
	PromptId.AiAnalysisSaveFolder,

	// Vault pipeline
	PromptId.AiAnalysisVaultClassify,
	PromptId.AiAnalysisVaultDecompose,
	PromptId.AiAnalysisVaultReconPlan,
	PromptId.AiAnalysisVaultReconSubmit,
	PromptId.AiAnalysisVaultPresentPlan,
	PromptId.AiAnalysisVaultReport,
	PromptId.AiAnalysisVaultReportSummary,
] as const;

/**
 * Indexing and Hub–related prompt IDs. Each can have its own provider/model in promptModelMap.
 * Shown in a dedicated "Indexing & Hub Prompts" section with a "Set All" control.
 */
export const INDEXING_AND_HUB_PROMPT_IDS: readonly PromptId[] = [
	PromptId.DocSummaryShort,
	PromptId.DocSummaryFull,
	PromptId.ImageDescription,
	PromptId.ImageSummary,
	PromptId.FolderProjectSummary,
	PromptId.DocTagGenerateJson,
	PromptId.HubDocSummary,
	PromptId.HubSemanticMerge,
	PromptId.HubDiscoveryFolderReconSubmit,
	PromptId.HubDiscoveryDocumentReconSubmit,
	PromptId.KnowledgeIntuitionPlan,
	PromptId.KnowledgeIntuitionSubmit,
] as const;

/**
 * Prompt IDs that allow model configuration in settings.
 * Only prompts listed here will appear in the Model Configuration UI.
 *
 * Search AI Analysis prompts are listed in {@link SEARCH_AI_ANALYSIS_PROMPT_IDS};
 * indexing/Hub prompts are listed in {@link INDEXING_AND_HUB_PROMPT_IDS}.
 *
 * Prompts not listed here (e.g., internal/system prompts) will always use the default model.
 */
export const CONFIGURABLE_PROMPT_IDS: readonly PromptId[] = [
	// Chat summary prompts - users may want different models for summaries
	PromptId.ConversationSummaryShort,
	PromptId.ConversationSummaryFull,
	PromptId.ProjectSummaryShort,
	PromptId.ProjectSummaryFull,

	// Search prompts - users may want specialized models for search
	// AiAnalysis* prompts are in SEARCH_AI_ANALYSIS_PROMPT_IDS, not here
	PromptId.SearchRerankRankGpt,

	// Application prompts - title generation may benefit from different models
	PromptId.ApplicationGenerateTitle,

	// Memory/Profile prompts
	PromptId.MemoryExtractCandidatesJson,

	// Prompt rewrite prompts
	PromptId.PromptQualityEvalJson,
	PromptId.PromptRewriteWithLibrary,

] as const;

/**
 * All prompt IDs exposed in Model Configuration UI (general + Search AI Analysis + Indexing & Hub).
 * Used for bulk reset and counts; arrays are disjoint.
 */
export const ALL_MODEL_CONFIG_PROMPT_IDS: readonly PromptId[] = [
	...CONFIGURABLE_PROMPT_IDS,
	...SEARCH_AI_ANALYSIS_PROMPT_IDS,
	...INDEXING_AND_HUB_PROMPT_IDS,
] as const;

/**
 * Check if a prompt ID allows model configuration (general, Search AI Analysis, or Indexing & Hub sections).
 */
export function isPromptModelConfigurable(promptId: PromptId): boolean {
	return (
		CONFIGURABLE_PROMPT_IDS.includes(promptId) ||
		SEARCH_AI_ANALYSIS_PROMPT_IDS.includes(promptId) ||
		INDEXING_AND_HUB_PROMPT_IDS.includes(promptId)
	);
}

export interface ErrorRetryInfo {
	/** The number of times the error has been retried. */
	attemptTimes?: number;
	/** The error messages from the last attempt. */
	lastAttemptErrorMessages?: string;
}

/**
 * Variable schemas for each prompt type.
 * Used for type-safe rendering.
 * // todo some prompts may have expected output format, we should add it to the interface. maybe turn into an agent
 */
export interface PromptVariables {
	[PromptId.ConversationSystem]: Record<string, never>;
	[PromptId.ConversationSummaryShort]: {
		messages: Array<{ role: string; content: string }>;
		projectContext?: string;
	};
	[PromptId.ConversationSummaryFull]: {
		messages: Array<{ role: string; content: string }>;
		projectContext?: string;
		shortSummary?: string;
	};
	[PromptId.ProjectSummaryShort]: {
		conversations: Array<{ title: string; shortSummary?: string }>;
		resources?: Array<{ title: string; source: string }>;
	};
	[PromptId.ProjectSummaryFull]: {
		conversations: Array<{ title: string; shortSummary?: string; fullSummary?: string }>;
		resources?: Array<{ title: string; source: string; shortSummary?: string }>;
		shortSummary?: string;
	};
	[PromptId.SearchRerankRankGpt]: {
		query: string;
		documents: Array<{ index: number; text: string; boostInfo?: string }>;
	};
	[PromptId.ApplicationGenerateTitle]: {
		messages: Array<{ role: string; content: string }>;
		contextInfo?: string;
	};
	[PromptId.MemoryExtractCandidatesJson]: {
		userMessage: string;
		assistantReply: string;
		context?: Record<string, string>;
	};
	[PromptId.PromptQualityEvalJson]: {
		prompt: string;
		taskHint?: string;
	};
	[PromptId.PromptRewriteWithLibrary]: {
		originalPrompt: string;
		qualityIssues: string[];
	};
	[PromptId.DocSummaryShort]: {
		content: string;
		title?: string;
		path?: string;
		/** Target length hint (words), for template `maxWords`. */
		maxWords?: string;
		/** Comma-separated TextRank terms. */
		textrankKeywords?: string;
		/** Numbered extractive sentences from TextRank. */
		textrankSentences?: string;
	};
	[PromptId.DocSummaryFull]: {
		content: string;
		title?: string;
		path?: string;
		targetWords?: string;
		shortSummary?: string;
		textrankKeywords?: string;
		textrankSentences?: string;
	};
	[PromptId.AiAnalysisSessionSummary]: {
		content: string;
		userQuery: string;
		wordCount: string;
	};
	[PromptId.ImageDescription]: Record<string, never>;
	[PromptId.ImageSummary]: {
		content: string;
		title?: string;
		path?: string;
	};
	[PromptId.FolderProjectSummary]: {
		documents: Array<{ title: string; summary?: string; path: string }>;
	};
	[PromptId.HubDocSummarySystem]: Record<string, never>;
	[PromptId.HubDocSummary]: {
		/** JSON string of hub candidate metadata (graph signals, routes, members). */
		hubMetadataJson: string;
		/** Draft hub body without YAML frontmatter (structure reference). */
		draftMarkdownBody: string;
		/** Truncated vault excerpts or placeholder when empty. */
		vaultExcerpts: string;
	};
	[PromptId.HubDiscoverRoundReviewSystem]: Record<string, never>;
	[PromptId.HubDiscoverRoundReview]: {
		/** JSON string of HubDiscoverRoundSummary (metrics + hub cards + gaps). */
		roundSummaryJson: string;
	};
	[PromptId.HubSemanticMergeSystem]: Record<string, never>;
	[PromptId.HubSemanticMerge]: {
		/** JSON array of hub cards for merge (stableKey, path, labels, signals). */
		hubCardsJson: string;
	};
	[PromptId.HubDiscoveryFolderReconSubmitSystem]: Record<string, never>;
	[PromptId.HubDiscoveryFolderReconSubmit]: {
		userGoal: string;
		iteration: number;
		agentPipelineBudgetJson: string;
		memoryJson: string;
		folderTreeMarkdown: string;
		actionPlanMarkdown: string;
		actionOutputMarkdown: string;
		toolResultsMarkdown: string;
	};
	[PromptId.HubDiscoveryDocumentReconSubmitSystem]: Record<string, never>;
	[PromptId.HubDiscoveryDocumentReconSubmit]: {
		userGoal: string;
		iteration: number;
		memoryJson: string;
		toolResultsMarkdown: string;
	};
	[PromptId.KnowledgeIntuitionPlanSystem]: Record<string, never>;
	[PromptId.KnowledgeIntuitionPlan]: {
		userGoal: string;
		vaultName: string;
		currentDateLabel: string;
		vaultSummaryMarkdown: string;
		baselineExcludedMarkdown: string;
		backboneMarkdownExcerpt: string;
		backboneEdgesMarkdown: string;
		folderSignalsMarkdown: string;
		documentShortlistMarkdown: string;
		folderTreeMarkdown: string;
	};
	[PromptId.KnowledgeIntuitionSubmitSystem]: Record<string, never>;
	[PromptId.KnowledgeIntuitionSubmit]: {
		userGoal: string;
		iteration: number;
		memoryJson: string;
		/** Deterministic counts for dynamic entry-point breadth. */
		vaultScaleHintMarkdown: string;
		folderTreeMarkdown: string;
		backboneEdgesJson: string;
		toolResultsMarkdown: string;
	};
	[PromptId.DocTagGenerateJson]: {
		content: string;
		title?: string;
		/** Comma-separated topic hints (optional). */
		existingTopicTags?: string;
		/** Comma-separated user #tags / frontmatter tags (hints only). */
		existingUserTags?: string;
		/** TextRank top terms (comma-separated). */
		textrankKeywords?: string;
		/** TextRank numbered sentences. */
		textrankSentences?: string;
		/** Bullet list: dimension → allowed functional tag ids. */
		functionalHintsTable: string;
		/** Comma-separated functional tag ids for the prompt body. */
		functionalTagList: string;
	};
	/** originalQuery, question, contextContent (caller builds based on section). */
	[PromptId.AiAnalysisFollowup]: { originalQuery: string; question: string; contextContent: string };
	/** System prompt for all follow-up chats; no variables. */
	[PromptId.AiAnalysisFollowupSystem]: Record<string, never>;
	[PromptId.AiAnalysisDocSimpleScope]: { scopeValue: string; userPrompt: string; fileContent: string };
	[PromptId.AiAnalysisDocSimpleSystem]: Record<string, never>;
	[PromptId.AiAnalysisSuggestFollowUpQuestionsSystem]: Record<string, never>;
	[PromptId.AiAnalysisSuggestFollowUpQuestions]: FollowUpQuestionVariables;
	[PromptId.AiAnalysisQueryClassifierSystem]: Record<string, never>;
	[PromptId.AiAnalysisQueryClassifier]: {
		userQuery: string;
		vaultSkeleton?: string;
		vaultDescription?: string;
		functionalTagsMapping?: string;
	};
	[PromptId.AiAnalysisSearchArchitectSystem]: Record<string, never>;
	[PromptId.AiAnalysisSearchArchitect]: { userQuery: string; dimensionsJson: string };

	[PromptId.AiAnalysisDimensionReconSystem]: Record<string, never>;
	[PromptId.AiAnalysisDimensionRecon]: Record<string, any>;
	[PromptId.AiAnalysisDimensionEvidenceSystem]: Record<string, never>;
	[PromptId.AiAnalysisDimensionEvidence]: Record<string, any>;
	[PromptId.AiAnalysisDimensionEvidenceBatch]: Record<string, any>;
	[PromptId.AiAnalysisTaskConsolidatorSystem]: Record<string, never>;
	[PromptId.AiAnalysisTaskConsolidator]: Record<string, any>;
	[PromptId.AiAnalysisGroupContextSystem]: Record<string, never>;
	[PromptId.AiAnalysisGroupContextSingle]: Record<string, any>;
	[PromptId.AiAnalysisOverviewLogicModelSystem]: Record<string, never>;
	[PromptId.AiAnalysisOverviewLogicModel]: Record<string, any>;
	[PromptId.AiAnalysisOverviewLogicModelFromReconSystem]: Record<string, never>;
	[PromptId.AiAnalysisOverviewLogicModelFromRecon]: Record<string, any>;
	[PromptId.AiAnalysisDashboardUpdateTopicsSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateTopics]: Record<string, any>;
	[PromptId.AiAnalysisDashboardUpdateBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateBlocks]: Record<string, any>;
	[PromptId.AiAnalysisReportPlanSystem]: Record<string, never>;
	[PromptId.AiAnalysisReportPlan]: Record<string, any>;
	[PromptId.AiAnalysisVisualBlueprintSystem]: Record<string, never>;
	[PromptId.AiAnalysisVisualBlueprint]: Record<string, any>;
	[PromptId.AiAnalysisReportBodyBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisReportBodyBlocks]: Record<string, any>;
	[PromptId.AiAnalysisReportAppendicesBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisReportAppendicesBlocks]: Record<string, any>;
	[PromptId.AiAnalysisReviewBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisReviewBlocks]: Record<string, any>;
	[PromptId.AiAnalysisDashboardUpdatePlanSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdatePlan]: Record<string, any>;
	[PromptId.AiAnalysisMermaidFixSystem]: Record<string, never>;
	[PromptId.AiAnalysisMermaidFix]: Record<string, any>;

	[PromptId.AiAnalysisTitle]: { query: string; summary?: string };
	[PromptId.AiAnalysisSummarySystem]: Record<string, never>;
	[PromptId.AiAnalysisSummary]: AiSummaryVariables & {
		verifiedFactSheet?: string;
		dashboardBlockIds?: string;
		userPersonaConfig?: UserPersonaConfig;
	};
	[PromptId.AiAnalysisOverviewRegenerate]: { originalQuery: string; currentResultSnapshot: string };
	[PromptId.AiAnalysisOverviewMermaidRenderSystem]: Record<string, never>;
	[PromptId.AiAnalysisOverviewMermaidRender]: { userQuery: string; logicModelJson: string };

	[PromptId.AiAnalysisSaveFileName]: { query: string; summary?: string };
	[PromptId.AiAnalysisSaveFolder]: { query: string; summary?: string; candidateFoldersFromSearch?: string; defaultSaveFolder?: string };
	[PromptId.ContextMemory]: {
		hasProject: boolean;
		projectName: string;
		projectSummary: string;
		projectResources: Array<{
			displayName: string;
			displaySummary: string;
		}>;
		hasConversation: boolean;
		conversationSummary: string;
		conversationTopics: string[];
		conversationResources: Array<{
			displayName: string;
			displaySummary: string;
		}>;
	};
	[PromptId.UserProfileContext]: {
		contextEntries: Array<{
			category: string;
			texts: string;
		}>;
	};
	[PromptId.ProfileFromVaultJson]: {
		vaultContent: string;
		existingProfileMarkdown?: string;
	};
	[PromptId.UserProfileOrganizeMarkdown]: {
		currentProfileMarkdown: string;
		newItemsMarkdown?: string;
	};
	[PromptId.MessageResources]: {
		resources: Array<{
			id: string;
		}>;
	};

	// Vault pipeline
	[PromptId.AiAnalysisVaultQueryUnderstandingSystem]: Record<string, never>;
	[PromptId.AiAnalysisVaultQueryUnderstanding]: {
		userQuery: string;
		historyContext?: string;
		folderContext?: string;
		searchContext?: string;
		globalIntuitionJson?: string;
		probeContext?: string;
	};
	[PromptId.AiAnalysisVaultClassifySystem]: Record<string, never>;
	[PromptId.AiAnalysisVaultClassify]: {
		userQuery: string;
		historyContext?: string;
		folderContext?: string;
		searchContext?: string;
		globalIntuitionJson?: string;
	};
	[PromptId.AiAnalysisVaultDecomposeSystem]: Record<string, never>;
	[PromptId.AiAnalysisVaultDecompose]: {
		userQuery: string;
		queryType: string;
		understanding: string;
		candidateAreas?: string;
		initialLeads?: string;
	};
	[PromptId.AiAnalysisVaultReconPlanSystem]: {
		toolSuggestions?: string;
	};
	[PromptId.AiAnalysisVaultReconPlan]: {
		userQuery: string;
		taskDescription: string;
		targetAreas?: string;
		initialLeads?: string;
	};
	[PromptId.AiAnalysisVaultReconSubmitSystem]: Record<string, never>;
	[PromptId.AiAnalysisVaultReconSubmit]: {
		userQuery: string;
		taskDescription: string;
		toolResultsMarkdown: string;
	};
	[PromptId.AiAnalysisVaultPresentPlanSystem]: Record<string, never>;
	[PromptId.AiAnalysisVaultPresentPlan]: {
		userQuery: string;
		evidenceCount: string;
		evidenceList: string;
		moreCount?: string;
	};
	[PromptId.AiAnalysisVaultReportSystem]: Record<string, never>;
	[PromptId.AiAnalysisVaultReport]: {
		userQuery: string;
		reportPlan: string;
		proposedSections?: string;
		evidenceCount: string;
		evidenceList: string;
		weavedContext?: string;
	};
	[PromptId.AiAnalysisVaultReportSummarySystem]: Record<string, never>;
	[PromptId.AiAnalysisVaultReportSummary]: {
		userQuery: string;
		reportPlan: string;
		blocksSummary: string;
		evidenceList: string;
	};
}

export type PromptInfo = PromptTemplate & { systemPromptId?: PromptId };
