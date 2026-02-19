// Import all prompt templates
import * as conversationSystem from './templates/conversation-system';
import * as conversationSummaryShort from './templates/conversation-summary-short';
import * as conversationSummaryFull from './templates/conversation-summary-full';
import * as projectSummaryShort from './templates/project-summary-short';
import * as projectSummaryFull from './templates/project-summary-full';
import * as searchRerankRankGpt from './templates/search-rerank-rank-gpt';
import * as aiSearchSystem from './templates/ai-analysis-agent-raw-search-system';
import * as thoughtAgentSystem from './templates/ai-analysis-agent-thought-system';
import * as sourcesUpdateAgentSystem from './templates/sources-update-agent-system';
import * as topicsUpdateAgentSystem from './templates/topics-update-agent-system';
import * as graphUpdateAgentSystem from './templates/graph-update-agent-system';
import * as applicationGenerateTitle from './templates/application-generate-title';
import * as memoryExtractCandidatesJson from './templates/memory-extract-candidates-json';
import * as memoryUpdateBulletList from './templates/memory-update-bullet-list';
import * as userProfileUpdateJson from './templates/user-profile-update-json';
import * as instructionUpdate from './templates/instruction-update';
import * as promptQualityEvalJson from './templates/prompt-quality-eval-json';
import * as promptRewriteWithLibrary from './templates/prompt-rewrite-with-library';
import * as docSummary from './templates/doc-summary';
import * as aiAnalysisSessionSummary from './templates/ai-analysis-session-summary';
import * as imageSummary from './templates/image-summary';
import * as imageDescription from './templates/image-description';
import * as folderProjectSummary from './templates/folder-project-summary';
import * as aiAnalysisFollowup from './templates/ai-analysis-followup';
import * as aiAnalysisFollowupSystem from './templates/ai-analysis-followup-system';
import * as aiAnalysisSummarySystem from './templates/ai-analysis-dashboard-result-summary-system';
import * as aiAnalysisSummary from './templates/ai-analysis-dashboard-result-summary';
import * as aiAnalysisDiagnosisJson from './templates/ai-analysis-diagnosis-json';
import * as aiAnalysisDashboardUpdateSourcesSystem from './templates/ai-analysis-dashboard-update-sources-system';
import * as aiAnalysisDashboardUpdateSources from './templates/ai-analysis-dashboard-update-sources';
import * as aiAnalysisDashboardUpdateTopics from './templates/ai-analysis-dashboard-update-topics';
import * as aiAnalysisDashboardUpdateTopicsSystem from './templates/ai-analysis-dashboard-update-topics-system';
import * as aiAnalysisOverviewMermaidSystem from './templates/ai-analysis-dashboard-overview-mermaid-system';
import * as aiAnalysisOverviewMermaid from './templates/ai-analysis-dashboard-overview-mermaid';
import * as aiAnalysisDashboardUpdateGraph from './templates/ai-analysis-dashboard-update-graph';
import * as aiAnalysisDashboardUpdateGraphSystem from './templates/ai-analysis-dashboard-update-graph-system';
import * as aiAnalysisDashboardUpdateBlocks from './templates/ai-analysis-dashboard-update-blocks';
import * as aiAnalysisDashboardUpdateBlocksSystem from './templates/ai-analysis-dashboard-update-blocks-system';
import * as aiAnalysisReviewBlocks from './templates/ai-analysis-review-blocks';
import * as aiAnalysisReviewBlocksSystem from './templates/ai-analysis-review-blocks-system';
import * as aiAnalysisDashboardUpdatePlan from './templates/ai-analysis-dashboard-update-plan';
import * as aiAnalysisDashboardUpdatePlanSystem from './templates/ai-analysis-dashboard-update-plan-system';
import * as aiAnalysisFinalRefine from './templates/ai-analysis-final-refine';
import * as aiAnalysisFinalRefineSystem from './templates/ai-analysis-final-refine-system';
import * as aiAnalysisFinalRefineSources from './templates/ai-analysis-final-refine-sources';
import * as aiAnalysisFinalRefineSourcesSystem from './templates/ai-analysis-final-refine-sources-system';
import * as aiAnalysisFinalRefineGraph from './templates/ai-analysis-final-refine-graph';
import * as aiAnalysisFinalRefineGraphSystem from './templates/ai-analysis-final-refine-graph-system';
import * as aiAnalysisSaveFilename from './templates/ai-analysis-save-filename';
import * as aiAnalysisDocSimpleScope from './templates/ai-analysis-doc-simple-scope';
import * as aiAnalysisDocSimpleSystem from './templates/ai-analysis-doc-simple-system';
import * as aiAnalysisSuggestFollowUpQuestionsSystem from './templates/ai-analysis-suggest-follow-up-questions-system';
import * as aiAnalysisSuggestFollowUpQuestions from './templates/ai-analysis-suggest-follow-up-questions';
import * as aiAnalysisSaveFolder from './templates/ai-analysis-save-folder';
import * as aiAnalysisTitle from './templates/ai-analysis-dashboard-title';
import * as docTypeClassifyJson from './templates/doc-type-classify-json';
import * as docTagGenerateJson from './templates/doc-tag-generate-json';
import * as contextMemory from './templates/context-memory';
import * as userProfileContext from './templates/user-profile-context';
import * as profileFromVaultJson from './templates/profile-from-vault-json';
import * as userProfileOrganizeMarkdown from './templates/user-profile-organize-markdown';
import * as messageResources from './templates/message-resources';
import { SystemInfo } from '../tools/system-info';
import { AnalysisMode, AISearchUpdateContext } from '../agents/AISearchAgent';

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
 * Helper to create PromptTemplate from module exports.
 */
function createTemplate(module: { template: string; expectsJson?: boolean; jsonConstraint?: string; }): PromptTemplate {
	return {
		template: module.template,
		expectsJson: module.expectsJson,
		jsonConstraint: module.jsonConstraint,
	};
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

	/** Dimension update agents: turn Thought agent text into operations JSON (one prompt per dimension) */
	SourcesUpdateAgentSystem = 'sources-update-agent-system',
	TopicsUpdateAgentSystem = 'topics-update-agent-system',
	GraphUpdateAgentSystem = 'graph-update-agent-system',

	// Application prompts (title generation)
	ApplicationGenerateTitle = 'application-generate-title',

	// Memory/Profile prompts
	MemoryExtractCandidatesJson = 'memory-extract-candidates-json',
	MemoryUpdateBulletList = 'memory-update-bullet-list',
	UserProfileUpdateJson = 'user-profile-update-json',
	InstructionUpdate = 'instruction-update',

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
	RawAiSearch = 'ai-search-system',
	ThoughtAgent = 'thought-agent-system',
	/** Session history compression for ThoughtAgent; preserves user background, pains, evidence paths. */
	AiAnalysisSessionSummary = 'ai-analysis-session-summary',
	// AI analysis dashboard update agent (update overviewMermaid/sources/topics/graph/blocks from memory evidence)
	AiAnalysisSummarySystem = 'ai-analysis-summary-system',
	AiAnalysisSummary = 'search-ai-summary',
	/** Step-A of summary chaining: structured diagnosis JSON for Step-B synthesis. */
	AiAnalysisDiagnosisJson = 'ai-analysis-diagnosis-json',
	AiAnalysisOverviewMermaidSystem = 'ai-analysis-overview-mermaid-system',
	AiAnalysisOverviewMermaid = 'ai-analysis-overview-mermaid',
	AiAnalysisDashboardUpdateSourcesSystem = 'ai-analysis-dashboard-update-sources-system',
	AiAnalysisDashboardUpdateSources = 'ai-analysis-dashboard-update-sources',
	AiAnalysisDashboardUpdateTopicsSystem = 'ai-analysis-dashboard-update-topics-system',
	AiAnalysisDashboardUpdateTopics = 'ai-analysis-dashboard-update-topics',
	AiAnalysisDashboardUpdateGraphSystem = 'ai-analysis-dashboard-update-graph-system',
	AiAnalysisDashboardUpdateGraph = 'ai-analysis-dashboard-update-graph',
	AiAnalysisDashboardUpdateBlocksSystem = 'ai-analysis-dashboard-update-blocks-system',
	AiAnalysisDashboardUpdateBlocks = 'ai-analysis-dashboard-update-blocks',
	AiAnalysisReviewBlocksSystem = 'ai-analysis-review-blocks-system',
	AiAnalysisReviewBlocks = 'ai-analysis-review-blocks',
	AiAnalysisDashboardUpdatePlanSystem = 'ai-analysis-dashboard-update-plan-system',
	AiAnalysisDashboardUpdatePlan = 'ai-analysis-dashboard-update-plan',
	AiAnalysisFinalRefineSystem = 'ai-analysis-final-refine-system',
	AiAnalysisFinalRefine = 'ai-analysis-final-refine',
	AiAnalysisFinalRefineSourcesSystem = 'ai-analysis-final-refine-sources-system',
	AiAnalysisFinalRefineSources = 'ai-analysis-final-refine-sources',
	AiAnalysisFinalRefineGraphSystem = 'ai-analysis-final-refine-graph-system',
	AiAnalysisFinalRefineGraph = 'ai-analysis-final-refine-graph',
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
	PromptId.ThoughtAgent,
	PromptId.AiAnalysisSessionSummary,
	PromptId.AiAnalysisSummary,
	PromptId.AiAnalysisDiagnosisJson,
	PromptId.AiAnalysisOverviewMermaid,
	PromptId.AiAnalysisDashboardUpdateSources,
	PromptId.AiAnalysisDashboardUpdateTopics,
	PromptId.AiAnalysisDashboardUpdateGraph,
	PromptId.AiAnalysisDashboardUpdateBlocks,
	PromptId.AiAnalysisReviewBlocks,
	PromptId.AiAnalysisDashboardUpdatePlan,
	PromptId.AiAnalysisFinalRefine,
	PromptId.AiAnalysisTitle,
	PromptId.AiAnalysisDocSimpleScope,
	PromptId.AiAnalysisDocSimpleSystem,
	PromptId.AiAnalysisSuggestFollowUpQuestions,
	PromptId.AiAnalysisFollowup,
	PromptId.AiAnalysisFollowupSystem,

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
	PromptId.MemoryUpdateBulletList,
	PromptId.UserProfileUpdateJson,
	PromptId.InstructionUpdate,

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
	[PromptId.RawAiSearch]: SystemInfo;
	[PromptId.ThoughtAgent]: { analysisMode?: AnalysisMode; simpleMode?: boolean };
	[PromptId.SourcesUpdateAgentSystem]: { text: string; lastError?: string };
	[PromptId.TopicsUpdateAgentSystem]: { text: string; lastError?: string };
	[PromptId.GraphUpdateAgentSystem]: { text: string; lastError?: string };
	[PromptId.ApplicationGenerateTitle]: {
		messages: Array<{ role: string; content: string }>;
		contextInfo?: string;
	};
	[PromptId.MemoryExtractCandidatesJson]: {
		userMessage: string;
		assistantReply: string;
		context?: Record<string, string>;
	};
	[PromptId.MemoryUpdateBulletList]: {
		newStatement: string;
		existingMemories: string[];
	};
	[PromptId.UserProfileUpdateJson]: {
		recentConversations: Array<{ summary: string; topics?: string[] }>;
		existingProfile?: string;
	};
	[PromptId.InstructionUpdate]: {
		profile: string;
		recentSummary: string;
		existingInstructions?: string;
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
	[PromptId.AiAnalysisTitle]: { query: string; summary?: string };
	[PromptId.AiAnalysisDocSimpleScope]: { scopeValue: string; userPrompt: string; fileContent: string };
	[PromptId.AiAnalysisDocSimpleSystem]: Record<string, never>;
	[PromptId.AiAnalysisSuggestFollowUpQuestionsSystem]: Record<string, never>;
	[PromptId.AiAnalysisSuggestFollowUpQuestions]: { sessionContext: string };

	[PromptId.AiAnalysisSummarySystem]: Record<string, never>;
	[PromptId.AiAnalysisSummary]: AISearchUpdateContext & { diagnosisJson?: string };
	[PromptId.AiAnalysisDiagnosisJson]: { originalQuery: string; recentEvidenceHint: string; currentResultSnapshot: string };
	[PromptId.AiAnalysisOverviewMermaidSystem]: Record<string, never>;
	[PromptId.AiAnalysisOverviewMermaid]: AISearchUpdateContext & ErrorRetryInfo;
	[PromptId.AiAnalysisDashboardUpdateSourcesSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateSources]: AISearchUpdateContext & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisDashboardUpdateTopicsSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateTopics]: AISearchUpdateContext & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisDashboardUpdateGraphSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateGraph]: AISearchUpdateContext & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisDashboardUpdateBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateBlocks]: AISearchUpdateContext & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisReviewBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisReviewBlocks]: AISearchUpdateContext & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisDashboardUpdatePlanSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdatePlan]: AISearchUpdateContext;
	[PromptId.AiAnalysisFinalRefineSystem]: Record<string, never>;
	[PromptId.AiAnalysisFinalRefine]: AISearchUpdateContext & { toolFormatGuidance?: string; refineMode?: 'sources_only' | 'graph_only' | 'full' };
	[PromptId.AiAnalysisFinalRefineSourcesSystem]: Record<string, never>;
	[PromptId.AiAnalysisFinalRefineSources]: AISearchUpdateContext & { toolFormatGuidance?: string; sourcesBatch?: { start: number; end: number; indexPlusOne: number; total: number } };
	[PromptId.AiAnalysisFinalRefineGraphSystem]: Record<string, never>;
	[PromptId.AiAnalysisFinalRefineGraph]: AISearchUpdateContext & { toolFormatGuidance?: string };

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

export type PromptInfo = PromptTemplate & { systemPromptId?: PromptId }

/**
 * Central prompt registry.
 * All prompts are loaded from individual template files in the templates/ directory.
 */
export const PROMPT_REGISTRY: Record<PromptId, PromptInfo> = {
	[PromptId.ConversationSystem]: createTemplate(conversationSystem),
	[PromptId.ConversationSummaryShort]: createTemplate(conversationSummaryShort),
	[PromptId.ConversationSummaryFull]: createTemplate(conversationSummaryFull),
	[PromptId.ProjectSummaryShort]: createTemplate(projectSummaryShort),
	[PromptId.ProjectSummaryFull]: createTemplate(projectSummaryFull),
	[PromptId.SearchRerankRankGpt]: createTemplate(searchRerankRankGpt),
	[PromptId.RawAiSearch]: createTemplate(aiSearchSystem),
	[PromptId.ThoughtAgent]: createTemplate(thoughtAgentSystem),
	[PromptId.SourcesUpdateAgentSystem]: createTemplate(sourcesUpdateAgentSystem),
	[PromptId.TopicsUpdateAgentSystem]: createTemplate(topicsUpdateAgentSystem),
	[PromptId.GraphUpdateAgentSystem]: createTemplate(graphUpdateAgentSystem),
	[PromptId.ApplicationGenerateTitle]: createTemplate(applicationGenerateTitle),
	[PromptId.MemoryExtractCandidatesJson]: createTemplate(memoryExtractCandidatesJson),
	[PromptId.MemoryUpdateBulletList]: createTemplate(memoryUpdateBulletList),
	[PromptId.UserProfileUpdateJson]: createTemplate(userProfileUpdateJson),
	[PromptId.InstructionUpdate]: createTemplate(instructionUpdate),
	[PromptId.PromptQualityEvalJson]: createTemplate(promptQualityEvalJson),
	[PromptId.PromptRewriteWithLibrary]: createTemplate(promptRewriteWithLibrary),
	[PromptId.DocSummary]: createTemplate(docSummary),
	[PromptId.AiAnalysisSessionSummary]: createTemplate(aiAnalysisSessionSummary),
	[PromptId.ImageDescription]: createTemplate(imageDescription),
	[PromptId.ImageSummary]: createTemplate(imageSummary),
	[PromptId.FolderProjectSummary]: createTemplate(folderProjectSummary),
	[PromptId.AiAnalysisFollowup]: createTemplate(aiAnalysisFollowup),
	[PromptId.AiAnalysisFollowupSystem]: createTemplate(aiAnalysisFollowupSystem),
	[PromptId.AiAnalysisTitle]: createTemplate(aiAnalysisTitle),
	[PromptId.AiAnalysisDocSimpleScope]: createTemplate(aiAnalysisDocSimpleScope),
	[PromptId.AiAnalysisDocSimpleSystem]: createTemplate(aiAnalysisDocSimpleSystem),
	[PromptId.AiAnalysisSuggestFollowUpQuestionsSystem]: createTemplate(aiAnalysisSuggestFollowUpQuestionsSystem),
	[PromptId.AiAnalysisSuggestFollowUpQuestions]: {
		...createTemplate(aiAnalysisSuggestFollowUpQuestions),
		systemPromptId: PromptId.AiAnalysisSuggestFollowUpQuestionsSystem,
	},

	[PromptId.AiAnalysisSummarySystem]: createTemplate(aiAnalysisSummarySystem),
	[PromptId.AiAnalysisSummary]: {
		...createTemplate(aiAnalysisSummary),
		systemPromptId: PromptId.AiAnalysisSummarySystem,
	},
	[PromptId.AiAnalysisDiagnosisJson]: createTemplate(aiAnalysisDiagnosisJson),

	[PromptId.AiAnalysisOverviewMermaidSystem]: createTemplate(aiAnalysisOverviewMermaidSystem),
	[PromptId.AiAnalysisOverviewMermaid]: {
		...createTemplate(aiAnalysisOverviewMermaid),
		systemPromptId: PromptId.AiAnalysisOverviewMermaidSystem,
	},

	[PromptId.AiAnalysisDashboardUpdateSourcesSystem]: createTemplate(aiAnalysisDashboardUpdateSourcesSystem),
	[PromptId.AiAnalysisDashboardUpdateSources]: {
		...createTemplate(aiAnalysisDashboardUpdateSources),
		systemPromptId: PromptId.AiAnalysisDashboardUpdateSourcesSystem,
	},

	[PromptId.AiAnalysisDashboardUpdateTopicsSystem]: createTemplate(aiAnalysisDashboardUpdateTopicsSystem),
	[PromptId.AiAnalysisDashboardUpdateTopics]: {
		...createTemplate(aiAnalysisDashboardUpdateTopics),
		systemPromptId: PromptId.AiAnalysisDashboardUpdateTopicsSystem,
	},

	[PromptId.AiAnalysisDashboardUpdateGraphSystem]: createTemplate(aiAnalysisDashboardUpdateGraphSystem),
	[PromptId.AiAnalysisDashboardUpdateGraph]: {
		...createTemplate(aiAnalysisDashboardUpdateGraph),
		systemPromptId: PromptId.AiAnalysisDashboardUpdateGraphSystem,
	},

	[PromptId.AiAnalysisDashboardUpdateBlocksSystem]: createTemplate(aiAnalysisDashboardUpdateBlocksSystem),
	[PromptId.AiAnalysisDashboardUpdateBlocks]: {
		...createTemplate(aiAnalysisDashboardUpdateBlocks),
		systemPromptId: PromptId.AiAnalysisDashboardUpdateBlocksSystem,
	},
	[PromptId.AiAnalysisReviewBlocksSystem]: createTemplate(aiAnalysisReviewBlocksSystem),
	[PromptId.AiAnalysisReviewBlocks]: {
		...createTemplate(aiAnalysisReviewBlocks),
		systemPromptId: PromptId.AiAnalysisReviewBlocksSystem,
	},
	[PromptId.AiAnalysisDashboardUpdatePlanSystem]: createTemplate(aiAnalysisDashboardUpdatePlanSystem),
	[PromptId.AiAnalysisDashboardUpdatePlan]: {
		...createTemplate(aiAnalysisDashboardUpdatePlan),
		systemPromptId: PromptId.AiAnalysisDashboardUpdatePlanSystem,
	},
	[PromptId.AiAnalysisFinalRefineSystem]: createTemplate(aiAnalysisFinalRefineSystem),
	[PromptId.AiAnalysisFinalRefine]: {
		...createTemplate(aiAnalysisFinalRefine),
		systemPromptId: PromptId.AiAnalysisFinalRefineSystem,
	},
	[PromptId.AiAnalysisFinalRefineSourcesSystem]: createTemplate(aiAnalysisFinalRefineSourcesSystem),
	[PromptId.AiAnalysisFinalRefineSources]: {
		...createTemplate(aiAnalysisFinalRefineSources),
		systemPromptId: PromptId.AiAnalysisFinalRefineSourcesSystem,
	},
	[PromptId.AiAnalysisFinalRefineGraphSystem]: createTemplate(aiAnalysisFinalRefineGraphSystem),
	[PromptId.AiAnalysisFinalRefineGraph]: {
		...createTemplate(aiAnalysisFinalRefineGraph),
		systemPromptId: PromptId.AiAnalysisFinalRefineGraphSystem,
	},

	[PromptId.AiAnalysisSaveFileName]: createTemplate(aiAnalysisSaveFilename),
	[PromptId.AiAnalysisSaveFolder]: createTemplate(aiAnalysisSaveFolder),
	[PromptId.DocTypeClassifyJson]: createTemplate(docTypeClassifyJson),
	[PromptId.DocTagGenerateJson]: createTemplate(docTagGenerateJson),
	[PromptId.ContextMemory]: createTemplate(contextMemory),
	[PromptId.UserProfileContext]: createTemplate(userProfileContext),
	[PromptId.ProfileFromVaultJson]: createTemplate(profileFromVaultJson),
	[PromptId.UserProfileOrganizeMarkdown]: createTemplate(userProfileOrganizeMarkdown),
	[PromptId.MessageResources]: createTemplate(messageResources),
};
