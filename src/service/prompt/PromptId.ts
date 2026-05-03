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

	/** One-sentence short summary (preferred for indexing). */
	DocSummaryShort = 'doc-summary-short',
	/** Long-form summary; may use short summary + TextRank anchors. */
	DocSummaryFull = 'doc-summary-full',
	ImageDescription = 'image-description',
	ImageSummary = 'image-summary',
	/** Topic + functional + context tags and optional vault document-type classification (same JSON). */
	DocTagGenerateJson = 'doc-tag-generate-json',
	/** System: Hub navigation note JSON fill (maintenance). Paired with {@link HubDocSummary}. */
	HubDocSummarySystem = 'hub-doc-summary-system',
	/** User: Hub metadata + draft markdown + vault excerpts → JSON for hub_doc sections. */
	HubDocSummary = 'hub-doc-summary',
	/** System: Hub semantic merge (duplicate / same-topic folds). */
	HubSemanticMergeSystem = 'hub-semantic-merge-system',
	/** User: Hub card JSON → merge groups (does not invent stableKeys). */
	HubSemanticMerge = 'hub-semantic-merge',

	/** Pattern discovery agent: analyze query history → new query templates. */
	PatternDiscovery = 'pattern-discovery',

	/** System: Knowledge intuition — plan step (tools optional). */
	KnowledgeIntuitionPlanSystem = 'knowledge-intuition-plan-system',
	/** User: backbone + folder digest + document shortlist for intuition planning. */
	KnowledgeIntuitionPlan = 'knowledge-intuition-plan',
	/** User: memory + tool results for intuition submit. */
	KnowledgeIntuitionSubmit = 'knowledge-intuition-submit',

	// Search prompts
	/** Regenerate overview from current result snapshot (UI only; not used by pipeline). */
	AiAnalysisOverviewRegenerate = 'ai-analysis-overview-regenerate',
	// AI analysis title (generated at end of analysis; used for save/recent/folder suggestion)
	AiAnalysisTitle = 'ai-analysis-title',
	/** Doc Simple mode: scope prefix (current file only + full coverage). */
	AiAnalysisDocSimpleScope = 'ai-analysis-doc-simple-scope',
	/** Doc Simple mode: system prompt for single-file Q&A agent. */
	AiAnalysisDocSimpleSystem = 'ai-analysis-doc-simple-system',
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
	/** Vault report executive summary: system (static). */
	AiAnalysisVaultReportSummarySystem = 'ai-analysis-vault-report-summary-system',
	/** Vault report executive summary: user prompt with blocks + evidence. Generated after blocks complete. */
	AiAnalysisVaultReportSummary = 'ai-analysis-vault-report-summary',
	/** Per-section report generation: system (static). */
	AiAnalysisReportSectionSystem = 'ai-analysis-report-section-system',
	/** Per-section report generation: user prompt with evidence + section spec. */
	AiAnalysisReportSection = 'ai-analysis-report-section',
	/** Vault SDK playbook: system prompt for SDK vault search agent (tool instruction + type classification). */
	VaultSdkPlaybook = 'ai-analysis-vault-sdk-playbook',
	/** Continue analysis: system prompt for follow-up rounds. */
	AiAnalysisContinueSystem = 'ai-analysis-continue-system',
	/** Continue analysis: user prompt with previous round context. */
	AiAnalysisContinue = 'ai-analysis-continue',
	/** Synthesize all rounds: system prompt for merging rounds into unified report. */
	AiAnalysisSynthesizeSystem = 'ai-analysis-synthesize-system',
	/** Synthesize all rounds: user prompt with all round data. */
	AiAnalysisSynthesize = 'ai-analysis-synthesize',

	// Context building templates (internal use)
	ContextMemory = 'context-memory',
	UserProfileContext = 'user-profile-context',
	/** Extract user profile items from vault content (build user profile command) */
	ProfileFromVaultJson = 'profile-from-vault-json',
	/** Organize current user profile into clean markdown */
	UserProfileOrganizeMarkdown = 'user-profile-organize-markdown',
	MessageResources = 'message-resources',

	// Copilot Document Intelligence
	DocPolish = 'doc-polish',
	DocPolishSystem = 'doc-polish-system',
	DocReview = 'doc-review',
	DocReviewSystem = 'doc-review-system',
	DocSuggestLinks = 'doc-suggest-links',
	DocSuggestLinksSystem = 'doc-suggest-links-system',
	DocSplitSuggestion = 'doc-split-suggestion',
	DocSplitSuggestionSystem = 'doc-split-suggestion-system',
	DocSuggestTags = 'doc-suggest-tags',
	DocSuggestTagsSystem = 'doc-suggest-tags-system',

	// Ambient context / session intelligence
	WorkingThemeInference = 'working-theme-inference',
	WorkingContextRender = 'working-context-render',
	ActivityIndexRender = 'activity-index-render',
	MessageChunkSummarize = 'message-chunk-summarize',
}

/**
 * Search AI Analysis–specific prompt IDs. Each can have its own provider/model in promptModelMap.
 * Shown in a dedicated "Search AI Analysis" section with a "Set All" control.
 */
export const SEARCH_AI_ANALYSIS_PROMPT_IDS: readonly PromptId[] = [
	PromptId.AiAnalysisOverviewRegenerate,
	PromptId.AiAnalysisTitle,
	PromptId.AiAnalysisDocSimpleScope,
	PromptId.AiAnalysisDocSimpleSystem,
	PromptId.AiAnalysisFollowup,
	PromptId.AiAnalysisFollowupSystem,
	PromptId.AiAnalysisSaveFileName,
	PromptId.AiAnalysisSaveFolder,

	// Vault pipeline
	PromptId.AiAnalysisVaultReportSummary,
	PromptId.AiAnalysisReportSection,
	PromptId.AiAnalysisMermaidFix,
	PromptId.AiAnalysisContinueSystem,
	PromptId.AiAnalysisContinue,
	PromptId.AiAnalysisSynthesize,
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
	PromptId.DocTagGenerateJson,
	PromptId.HubDocSummary,
	PromptId.HubSemanticMerge,
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
	[PromptId.ImageDescription]: Record<string, never>;
	[PromptId.ImageSummary]: {
		content: string;
		title?: string;
		path?: string;
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
	[PromptId.HubSemanticMergeSystem]: Record<string, never>;
	[PromptId.HubSemanticMerge]: {
		/** JSON array of hub cards for merge (stableKey, path, labels, signals). */
		hubCardsJson: string;
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

	[PromptId.AiAnalysisMermaidFixSystem]: Record<string, never>;
	[PromptId.AiAnalysisMermaidFix]: {
		brokenMermaid: string;
		errorMessage: string;
	};

	[PromptId.AiAnalysisTitle]: { query: string; summary?: string };
	[PromptId.AiAnalysisOverviewRegenerate]: { originalQuery: string; currentResultSnapshot: string };

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
	[PromptId.AiAnalysisVaultReportSummarySystem]: Record<string, never>;
	[PromptId.AiAnalysisVaultReportSummary]: {
		userQuery: string;
		reportPlan: string;
		blocksSummary: string;
		evidenceList: string;
	};
	[PromptId.AiAnalysisContinueSystem]: Record<string, never>;
	[PromptId.AiAnalysisContinue]: {
		originalQuery: string;
		rounds: Array<{
			query: string;
			summary: string;
			sections: Array<{ title: string; content: string }>;
			annotations: Array<{ sectionTitle: string; selectedText?: string; comment: string; type: string }>;
		}>;
		sources: Array<{ path: string; relevance?: string }>;
		graphSummary?: { nodeCount: number; keyRelationships: string[] } | null;
		followUpQuery: string;
	};
	[PromptId.AiAnalysisSynthesizeSystem]: Record<string, never>;
	[PromptId.AiAnalysisSynthesize]: {
		rounds: Array<{
			query: string;
			summary: string;
			sections: Array<{ title: string; content: string }>;
			annotations: Array<{ type: string; sectionTitle: string; comment: string }>;
		}>;
	};
	[PromptId.AiAnalysisReportSectionSystem]: Record<string, never>;
	[PromptId.AiAnalysisReportSection]: {
		userQuery: string;
		reportOverview: string;
		sectionTitle: string;
		contentType: string;
		visualType: string;
		sectionBrief: string;
		otherSections: string;
		evidenceContent: string;
		userPrompt?: string;
		missionRole: string;
		userNotes?: string;
	};

	// Pattern discovery
	[PromptId.PatternDiscovery]: {
		availableVariables: string;
		availableConditions: string;
		queriesJson: string;
		existingPatternsJson: string;
		vaultStructureJson: string;
	};
	[PromptId.DocPolish]: {
		content: string;
		title?: string;
		scope: 'full' | 'selection';
		instruction?: string;
	};
	[PromptId.DocPolishSystem]: Record<string, never>;
	[PromptId.DocReview]: {
		content: string;
		title?: string;
		scope: 'full' | 'selection';
	};
	[PromptId.DocReviewSystem]: Record<string, never>;
	[PromptId.DocSuggestLinks]: {
		content: string;
		title?: string;
		existingLinks: string;
	};
	[PromptId.DocSuggestLinksSystem]: Record<string, never>;
	[PromptId.DocSplitSuggestion]: {
		content: string;
		title?: string;
		wordCount: number;
	};
	[PromptId.DocSplitSuggestionSystem]: Record<string, never>;

	// Ambient context / session intelligence
	[PromptId.WorkingThemeInference]: {
		activities: Array<{ type: string; summary: string; timestamp: number }>;
	};
	[PromptId.WorkingContextRender]: {
		theme: string;
		recentActivities: Array<{ summary: string; timeAgo: string }>;
		activeFile: { path: string; title: string } | null;
	};
	[PromptId.ActivityIndexRender]: {
		activities: Array<{ id: string; timeAgo: string; summary: string }>;
		counts: Record<string, number>;
	};
	[PromptId.MessageChunkSummarize]: {
		messages: Array<{ role: string; content: string }>;
	};
}

export type PromptInfo = PromptTemplate & { systemPromptId?: PromptId };
