// Prompt content is loaded from templates/ via TemplateManager + TemplateRegistry (src/core/template).
import { SystemInfo } from '../tools/system-info';
import { AnalysisMode } from '../agents/AISearchAgent';
import { MindFlowVariables } from '../agents/search-agent-helper/MindFlowAgent';
import { FinalRefineContext, FinalSourcesScoreRefineContext } from '../agents/search-agent-helper/FinalRefineAgent';
import { DashboardUpdateContext } from '../agents/search-agent-helper/DashboardAgent';
import { DashboardBlockVariables } from '../agents/search-agent-helper/DashboardBlocksAgent';
import { TopicsUpdateVariables } from '../agents/search-agent-helper/TopicsUpdateAgent';
import { ReviewBlocksVariables } from '../agents/search-agent-helper/ReviewBlocksAgent';
import { FollowUpQuestionVariables } from '../agents/search-agent-helper/FollowUpQuestionAgent';
import { AiSummaryVariables } from '../agents/search-agent-helper/SummaryAgent';
import { MermaidOverviewVariables } from '../agents/search-agent-helper/MermaidOverviewAgent';
import { RawSearchVariables } from '../agents/search-agent-helper/RawSearchAgent';
import { KnowledgeAgentVariables } from '../agents/search-agent-helper/KnowledgeAgent';

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

	// Document analysis prompts (for future use)
	DocSummary = 'doc-summary',
	ImageDescription = 'image-description',
	ImageSummary = 'image-summary',
	FolderProjectSummary = 'folder-project-summary',
	// Classify document type: principle, profile, index, daily, project, note, or other
	DocTypeClassifyJson = 'doc-type-classify-json',
	DocTagGenerateJson = 'doc-tag-generate-json',

	// Search prompts
	/** System prompt for RawSearch (butcher: evidence pack rules). */
	RawAiSearchSystem = 'ai-analysis-agent-raw-search-system',
	/** User prompt for RawSearch (search_task, task_context, existing_facts). */
	RawAiSearch = 'ai-analysis-agent-raw-search',
	/** Session history compression; preserves user background, pains, evidence paths. */
	AiAnalysisSessionSummary = 'ai-analysis-session-summary',
	// AI analysis dashboard update agent (update overviewMermaid/sources/topics/graph/blocks from memory evidence)
	AiAnalysisSummarySystem = 'ai-analysis-summary-system',
	AiAnalysisSummary = 'search-ai-summary',
	AiAnalysisOverviewMermaidSystem = 'ai-analysis-overview-mermaid-system',
	AiAnalysisOverviewMermaid = 'ai-analysis-overview-mermaid',
	AiAnalysisDashboardUpdateTopicsSystem = 'ai-analysis-dashboard-update-topics-system',
	AiAnalysisDashboardUpdateTopics = 'ai-analysis-dashboard-update-topics',
	AiAnalysisDashboardUpdateBlocksSystem = 'ai-analysis-dashboard-update-blocks-system',
	AiAnalysisDashboardUpdateBlocks = 'ai-analysis-dashboard-update-blocks',
	AiAnalysisReviewBlocksSystem = 'ai-analysis-review-blocks-system',
	AiAnalysisReviewBlocks = 'ai-analysis-review-blocks',
	AiAnalysisDashboardUpdatePlanSystem = 'ai-analysis-dashboard-update-plan-system',
	AiAnalysisDashboardUpdatePlan = 'ai-analysis-dashboard-update-plan',
	AiAnalysisMindflowAgentSystem = 'ai-analysis-mindflow-agent-system',
	AiAnalysisMindflowAgent = 'ai-analysis-mindflow-agent',
	/** KnowledgeAgent: compress evidence into Knowledge Panel (clusters, conflicts, open_questions). */
	AiAnalysisKnowledgeAgentSystem = 'ai-analysis-knowledge-agent-system',
	AiAnalysisKnowledgeAgent = 'ai-analysis-knowledge-agent',
	/** Fix invalid Mermaid code using parse error; used after validation fails in MindFlow/Overview. */
	AiAnalysisMermaidFixSystem = 'ai-analysis-mermaid-fix-system',
	AiAnalysisMermaidFix = 'ai-analysis-mermaid-fix',
	AiAnalysisFinalRefineSystem = 'ai-analysis-final-refine-system',
	AiAnalysisFinalRefine = 'ai-analysis-final-refine',
	AiAnalysisFinalRefineSourcesSystem = 'ai-analysis-final-refine-sources-system',
	AiAnalysisFinalRefineSources = 'ai-analysis-final-refine-sources',
	AiAnalysisFinalRefineSourceScoresSystem = 'ai-analysis-final-refine-source-scores-system',
	AiAnalysisFinalRefineSourceScores = 'ai-analysis-final-refine-source-scores',
	// AI analysis title (generated at end of analysis; used for save/recent/folder suggestion)
	AiAnalysisTitle = 'ai-analysis-title',
	/** Doc Simple mode: scope prefix (current file only + full coverage). */
	AiAnalysisDocSimpleScope = 'ai-analysis-doc-simple-scope',
	/** Doc Simple mode: system prompt for single-file Q&A agent. */
	AiAnalysisDocSimpleSystem = 'ai-analysis-doc-simple-system',
	AiAnalysisSuggestFollowUpQuestionsSystem = 'ai-analysis-suggest-follow-up-questions-system',
	/** Suggest follow-up questions from full session context (not from topics). */
	AiAnalysisSuggestFollowUpQuestions = 'ai-analysis-suggest-follow-up-questions',
	/** Unified follow-up user prompt (Summary, Graph, Sources, Blocks, Full). Caller builds contextContent. */
	AiAnalysisFollowup = 'ai-analysis-followup',
	/** System prompt for all follow-up chats (Topic, Continue, Graph, Blocks, Sources). */
	AiAnalysisFollowupSystem = 'ai-analysis-followup-system',
	// AI analysis save dialog (filename/folder suggestions)
	AiAnalysisSaveFileName = 'ai-analysis-save-filename',
	AiAnalysisSaveFolder = 'ai-analysis-save-folder',

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
	PromptId.RawAiSearch,
	PromptId.AiAnalysisSessionSummary,
	PromptId.AiAnalysisSummary,
	PromptId.AiAnalysisOverviewMermaid,
	PromptId.AiAnalysisDashboardUpdateTopics,
	PromptId.AiAnalysisDashboardUpdateBlocks,
	PromptId.AiAnalysisReviewBlocks,
	PromptId.AiAnalysisDashboardUpdatePlan,
	PromptId.AiAnalysisMindflowAgent,
	PromptId.AiAnalysisKnowledgeAgent,
	PromptId.AiAnalysisMermaidFix,
	PromptId.AiAnalysisFinalRefine,
	PromptId.AiAnalysisTitle,
	PromptId.AiAnalysisDocSimpleScope,
	PromptId.AiAnalysisDocSimpleSystem,
	PromptId.AiAnalysisSuggestFollowUpQuestions,
	PromptId.AiAnalysisFollowup,
	PromptId.AiAnalysisFollowupSystem,
	PromptId.AiAnalysisFinalRefineSources,
	PromptId.AiAnalysisFinalRefineSourceScores,

	PromptId.AiAnalysisSaveFileName,
	PromptId.AiAnalysisSaveFolder,
] as const;

/**
 * Prompt IDs that allow model configuration in settings.
 * Only prompts listed here will appear in the Model Configuration UI.
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

	// Document analysis prompts - users may want different models for different document types
	PromptId.DocSummary,
	PromptId.ImageDescription,
	PromptId.ImageSummary,
	PromptId.FolderProjectSummary,
	// Classify document type: principle, profile, index, daily, project, note, or other
	PromptId.DocTypeClassifyJson,
	PromptId.DocTagGenerateJson,

] as const;

/**
 * Check if a prompt ID allows model configuration.
 */
export function isPromptModelConfigurable(promptId: PromptId): boolean {
	return CONFIGURABLE_PROMPT_IDS.includes(promptId);
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
	[PromptId.RawAiSearchSystem]: SystemInfo;
	[PromptId.RawAiSearch]: RawSearchVariables & ErrorRetryInfo;
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
	[PromptId.DocSummary]: {
		content: string;
		title?: string;
		path?: string;
		wordCount?: string;
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
	[PromptId.DocTypeClassifyJson]: {
		content: string;
		title?: string;
		path?: string;
	};
	[PromptId.DocTagGenerateJson]: {
		content: string;
		title?: string;
		existingTags?: string[];
	};
	/** originalQuery, question, contextContent (caller builds based on section). */
	[PromptId.AiAnalysisFollowup]: { originalQuery: string; question: string; contextContent: string };
	/** System prompt for all follow-up chats; no variables. */
	[PromptId.AiAnalysisFollowupSystem]: Record<string, never>;
	[PromptId.AiAnalysisDocSimpleScope]: { scopeValue: string; userPrompt: string; fileContent: string };
	[PromptId.AiAnalysisDocSimpleSystem]: Record<string, never>;
	[PromptId.AiAnalysisSuggestFollowUpQuestionsSystem]: Record<string, never>;
	[PromptId.AiAnalysisSuggestFollowUpQuestions]: FollowUpQuestionVariables;

	[PromptId.AiAnalysisTitle]: { query: string; summary?: string };
	[PromptId.AiAnalysisSummarySystem]: Record<string, never>;
	[PromptId.AiAnalysisSummary]: AiSummaryVariables & {
		retrievedSessionContext?: string;
		verifiedFactSheet?: string;
		sourceMap?: string;
		lastDecision?: string;
		dashboardBlockIds?: string;
	};
	[PromptId.AiAnalysisOverviewMermaidSystem]: Record<string, never>;
	[PromptId.AiAnalysisOverviewMermaid]: MermaidOverviewVariables & ErrorRetryInfo;
	[PromptId.AiAnalysisDashboardUpdateTopicsSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateTopics]: TopicsUpdateVariables & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisDashboardUpdateBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateBlocks]: DashboardBlockVariables & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisDashboardUpdatePlanSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdatePlan]: DashboardUpdateContext;
	[PromptId.AiAnalysisReviewBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisReviewBlocks]: ReviewBlocksVariables & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisMindflowAgentSystem]: Record<string, never>;
	[PromptId.AiAnalysisMindflowAgent]: MindFlowVariables & ErrorRetryInfo;
	[PromptId.AiAnalysisKnowledgeAgentSystem]: Record<string, never>;
	[PromptId.AiAnalysisKnowledgeAgent]: KnowledgeAgentVariables;
	[PromptId.AiAnalysisMermaidFixSystem]: Record<string, never>;
	[PromptId.AiAnalysisMermaidFix]: { invalidCode: string; validationError: string };
	[PromptId.AiAnalysisFinalRefineSystem]: Record<string, never>;
	[PromptId.AiAnalysisFinalRefine]: FinalRefineContext & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisFinalRefineSourcesSystem]: Record<string, never>;
	[PromptId.AiAnalysisFinalRefineSources]: FinalRefineContext & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisFinalRefineSourceScoresSystem]: Record<string, never>;
	[PromptId.AiAnalysisFinalRefineSourceScores]: FinalRefineContext;

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
}

export type PromptInfo = PromptTemplate & { systemPromptId?: PromptId };
