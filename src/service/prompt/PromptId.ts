// Prompt content is loaded from templates/ via TemplateManager + TemplateRegistry (src/core/template).
import { DashboardBlockVariables } from '../agents/search-agent-helper/DashboardBlocksAgent';
import type { UserPersonaConfig } from '../agents/search-agent-helper/AgentContextManager';
import { TopicsUpdateVariables } from '../agents/search-agent-helper/TopicsUpdateAgent';
import { ReviewBlocksVariables } from '../agents/search-agent-helper/ReviewBlocksAgent';
import { FollowUpQuestionVariables } from '../agents/search-agent-helper/FollowUpQuestionAgent';
import { AiSummaryVariables } from '../agents/search-agent-helper/SummaryAgent';
import {
	ConsolidatedTaskWithId,
	DimensionChoice,
	type EvidencePack,
	type EvidenceTaskGroup,
	RawSearchReport,
	RawSearchReportWithDimension,
} from '@/core/schemas/agents/search-agent-schemas';
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
	/** Session history compression; preserves user background, pains, evidence paths. */
	AiAnalysisSessionSummary = 'ai-analysis-session-summary',
	// AI analysis dashboard update agent (update overviewMermaid/sources/topics/graph/blocks from memory evidence)
	AiAnalysisSummarySystem = 'ai-analysis-summary-system',
	AiAnalysisSummary = 'search-ai-summary',
	/** Regenerate overview from current result snapshot (UI only; not used by pipeline). */
	AiAnalysisOverviewRegenerate = 'ai-analysis-overview-regenerate',
	/** Phase 1 of weaveEvidence2MermaidOverview: logic model only (no Mermaid). */
	AiAnalysisOverviewLogicModelSystem = 'ai-analysis-overview-logic-model-system',
	AiAnalysisOverviewLogicModel = 'ai-analysis-overview-logic-model',
	/** Phase 2: render logic model → flowchart Mermaid. */
	AiAnalysisOverviewMermaidRenderSystem = 'ai-analysis-overview-mermaid-render-system',
	AiAnalysisOverviewMermaidRender = 'ai-analysis-overview-mermaid-render',
	AiAnalysisDashboardUpdateTopicsSystem = 'ai-analysis-dashboard-update-topics-system',
	AiAnalysisDashboardUpdateTopics = 'ai-analysis-dashboard-update-topics',
	AiAnalysisDashboardUpdateBlocksSystem = 'ai-analysis-dashboard-update-blocks-system',
	AiAnalysisDashboardUpdateBlocks = 'ai-analysis-dashboard-update-blocks',
	AiAnalysisReviewBlocksSystem = 'ai-analysis-review-blocks-system',
	AiAnalysisReviewBlocks = 'ai-analysis-review-blocks',
	/** Report plan: section-by-section consulting report outline (ReportPlanAgent). */
	AiAnalysisReportPlanSystem = 'ai-analysis-report-plan-system',
	AiAnalysisReportPlan = 'ai-analysis-report-plan',
	/** Visual blueprint: per-block visual prescription after report plan (VisualBlueprintAgent). */
	AiAnalysisVisualBlueprintSystem = 'ai-analysis-visual-blueprint-system',
	AiAnalysisVisualBlueprint = 'ai-analysis-visual-blueprint',
	/** Report body blocks: dashboard blocks for main report sections (ReportAgent phase4). */
	AiAnalysisReportBodyBlocksSystem = 'ai-analysis-report-body-blocks-system',
	AiAnalysisReportBodyBlocks = 'ai-analysis-report-body-blocks',
	/** Report appendices blocks: dashboard blocks for appendices (ReportAgent phase5). */
	AiAnalysisReportAppendicesBlocksSystem = 'ai-analysis-report-appendices-blocks-system',
	AiAnalysisReportAppendicesBlocks = 'ai-analysis-report-appendices-blocks',
	/** Fix invalid Mermaid code using parse error; used after overview validation fails. */
	AiAnalysisMermaidFixSystem = 'ai-analysis-mermaid-fix-system',
	AiAnalysisMermaidFix = 'ai-analysis-mermaid-fix',
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
	/** Dimension Recon Agent: breadth exploration, submit_rawsearch_report only. */
	AiAnalysisDimensionReconSystem = 'ai-analysis-dimension-recon-system',
	AiAnalysisDimensionRecon = 'ai-analysis-dimension-recon',
	/** Dimension Evidence Agent: precise collection from leads, submit_evidence_pack. */
	AiAnalysisDimensionEvidenceSystem = 'ai-analysis-dimension-evidence-system',
	AiAnalysisDimensionEvidence = 'ai-analysis-dimension-evidence',
	/** Task Consolidator: merge recon reports into evidence execution blueprint (JSON). */
	AiAnalysisTaskConsolidatorSystem = 'ai-analysis-task-consolidator-system',
	AiAnalysisTaskConsolidator = 'ai-analysis-task-consolidator',
	/** Group Context: system prompt for single-group topic_anchor + group_focus (used by GroupContextAgent). */
	AiAnalysisGroupContextSystem = 'ai-analysis-group-context-system',
	/** Single-group context: one group's enriched files → topic_anchor + group_focus. */
	AiAnalysisGroupContextSingle = 'ai-analysis-group-context-single',
	/** Batch evidence: multiple tasks (path + extraction_focus + dimensions) in one run; submit with completed_task_ids. */
	AiAnalysisDimensionEvidenceBatch = 'ai-analysis-dimension-evidence-batch',
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
	PromptId.AiAnalysisSessionSummary,
	PromptId.AiAnalysisSummary,
	PromptId.AiAnalysisOverviewLogicModel,
	PromptId.AiAnalysisOverviewMermaidRender,
	PromptId.AiAnalysisOverviewRegenerate,
	PromptId.AiAnalysisDashboardUpdateTopics,
	PromptId.AiAnalysisDashboardUpdateBlocks,
	PromptId.AiAnalysisReviewBlocks,
	PromptId.AiAnalysisReportPlan,
	PromptId.AiAnalysisVisualBlueprint,
	PromptId.AiAnalysisMermaidFix,
	PromptId.AiAnalysisTitle,
	PromptId.AiAnalysisDocSimpleScope,
	PromptId.AiAnalysisDocSimpleSystem,
	PromptId.AiAnalysisSuggestFollowUpQuestions,
	PromptId.AiAnalysisQueryClassifier,
	PromptId.AiAnalysisDimensionRecon,
	PromptId.AiAnalysisDimensionEvidence,
	PromptId.AiAnalysisDimensionEvidenceBatch,
	PromptId.AiAnalysisTaskConsolidator,
	PromptId.AiAnalysisGroupContextSingle,
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
	[PromptId.AiAnalysisQueryClassifierSystem]: Record<string, never>;
	[PromptId.AiAnalysisQueryClassifier]: {
		userQuery: string;
		vaultSkeleton?: string;
		vaultDescription?: string;
		functionalTagsMapping?: string;
	};
	[PromptId.AiAnalysisDimensionReconSystem]: Record<string, never>;
	[PromptId.AiAnalysisDimensionRecon]: { dimensionId: string; intent_description: string; userQuery: string; scopePath?: string; scopeAnchor?: string; vaultDescription?: string; vaultStructure?: string; vaultTopTags?: string; vaultCapabilities?: string };
	[PromptId.AiAnalysisDimensionEvidenceSystem]: Record<string, never>;
	[PromptId.AiAnalysisDimensionEvidence]: { userQuery: string; dimension: DimensionChoice; report: RawSearchReport };
	[PromptId.AiAnalysisTaskConsolidatorSystem]: Record<string, never>;
	[PromptId.AiAnalysisTaskConsolidator]: {
		userQuery: string;
		dimensions: Array<DimensionChoice>;
		reports: Array<RawSearchReportWithDimension>;
	};
	[PromptId.AiAnalysisGroupContextSystem]: Record<string, never>;
	/** Single-group: one group's files with dimension intents, priority, task_load. */
	[PromptId.AiAnalysisGroupContextSingle]: {
		userQuery: string;
		dimensions: Array<DimensionChoice>;
		groupIndex: number;
		files: Array<{
			path: string;
			extraction_focus: string;
			priority: string;
			task_load?: string | null;
			relevant_dimension_ids: Array<{ id: string; intent: string }>;
		}>;
	};
	[PromptId.AiAnalysisDimensionEvidenceBatch]: {
		userQuery: string;
		tasks: Array<ConsolidatedTaskWithId>;
		topicAnchor?: string;
		groupFocus?: string;
		/** Rendered shared-context markdown (folders, tags, intra-group graph). */
		groupSharedContext?: string;
		/** True when topicAnchor, groupFocus, or groupSharedContext is provided (for template conditional). */
		showSchedulerContext?: boolean;
	};

	[PromptId.AiAnalysisTitle]: { query: string; summary?: string };
	[PromptId.AiAnalysisSummarySystem]: Record<string, never>;
	[PromptId.AiAnalysisSummary]: AiSummaryVariables & {
		verifiedFactSheet?: string;
		dashboardBlockIds?: string;
		userPersonaConfig?: UserPersonaConfig;
	};
	[PromptId.AiAnalysisOverviewRegenerate]: { originalQuery: string; currentResultSnapshot: string };
	[PromptId.AiAnalysisOverviewLogicModelSystem]: Record<string, never>;
	[PromptId.AiAnalysisOverviewLogicModel]: { userQuery: string; evidencePacks: EvidencePack[]; repairHint?: string };
	[PromptId.AiAnalysisOverviewMermaidRenderSystem]: Record<string, never>;
	[PromptId.AiAnalysisOverviewMermaidRender]: { userQuery: string; logicModelJson: string };
	[PromptId.AiAnalysisDashboardUpdateTopicsSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateTopics]: TopicsUpdateVariables & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisDashboardUpdateBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateBlocks]: DashboardBlockVariables & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisReportPlanSystem]: Record<string, never>;
	[PromptId.AiAnalysisReportPlan]: {
		originalQuery: string;
		overviewMermaid?: string;
		verifiedFactSheet?: string[];
		evidenceTaskGroups?: EvidenceTaskGroup[];
	};
	[PromptId.AiAnalysisVisualBlueprintSystem]: Record<string, never>;
	[PromptId.AiAnalysisVisualBlueprint]: {
		originalQuery: string;
		overviewMermaid?: string;
		/** Lightweight facts context: keep as list; template decides count/sample rendering. */
		confirmedFacts?: string[];
		/** The first block slot to start prescribing (subsequent blocks come from tool output). */
		firstBlockId?: string;
		firstBlockRequirements?: string;
	};
	[PromptId.AiAnalysisReportBodyBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisReportBodyBlocks]: DashboardBlockVariables & ErrorRetryInfo & { toolFormatGuidance?: string; userPersonaConfig?: UserPersonaConfig };
	[PromptId.AiAnalysisReportAppendicesBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisReportAppendicesBlocks]: DashboardBlockVariables & ErrorRetryInfo & { toolFormatGuidance?: string; userPersonaConfig?: UserPersonaConfig };
	[PromptId.AiAnalysisReviewBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisReviewBlocks]: ReviewBlocksVariables & ErrorRetryInfo & { toolFormatGuidance?: string };
	[PromptId.AiAnalysisMermaidFixSystem]: Record<string, never>;
	[PromptId.AiAnalysisMermaidFix]: { invalidCode: string; validationError: string };

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
