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
import * as imageSummary from './templates/image-summary';
import * as imageDescription from './templates/image-description';
import * as folderProjectSummary from './templates/folder-project-summary';
import * as aiAnalysisFollowupSummary from './templates/ai-analysis-followup-summary';
import * as aiAnalysisFollowupGraph from './templates/ai-analysis-followup-graph';
import * as aiAnalysisFollowupSources from './templates/ai-analysis-followup-sources';
import * as aiAnalysisFollowupBlocks from './templates/ai-analysis-followup-blocks';
import * as aiAnalysisFollowupFull from './templates/ai-analysis-followup-full';
import * as aiAnalysisSummarySystem from './templates/ai-analysis-dashboard-result-summary-system';
import * as aiAnalysisSummary from './templates/ai-analysis-dashboard-result-summary';
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
import * as aiAnalysisSaveFilename from './templates/ai-analysis-save-filename';
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
import { DashboardUpdateContext } from '../agents/AISearchAgent';

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
	/** System prompt for the prompt if this template is a user prompt. */
	// todo 分离系统提示和用户提示，让用户提示可以更灵活地使用系统提示。这样用户可以灵活配置，我们仅仅需要改一下 prompt service 的 render 即可
	//  这么做是因为很多时候系统提示是更宪法级的 用户提示会包括很多当前上下文信息
	//  有时候本 prpmpt 本身就是 system prompt 那么这个字段就是空
	// systemPrompt?: string;
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
	AiSearchSystem = 'ai-search-system',
	ThoughtAgentSystem = 'thought-agent-system',
	// AI analysis dashboard update agent (update overviewMermaid/sources/topics/graph/blocks from memory evidence)
	AiAnalysisSummarySystem = 'ai-analysis-summary-system',
	AiAnalysisSummary = 'search-ai-summary',
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
	// AI analysis title (generated at end of analysis; used for save/recent/folder suggestion)
	AiAnalysisTitle = 'ai-analysis-title',
	// AI analysis inline follow-up prompts
	AiAnalysisFollowupSummary = 'ai-analysis-followup-summary',
	AiAnalysisFollowupGraph = 'ai-analysis-followup-graph',
	AiAnalysisFollowupSources = 'ai-analysis-followup-sources',
	AiAnalysisFollowupBlocks = 'ai-analysis-followup-blocks',
	AiAnalysisFollowupFull = 'ai-analysis-followup-full',
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
	PromptId.AiAnalysisSummary,
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

	// AI analysis follow-up prompts
	PromptId.AiAnalysisFollowupSummary,
	PromptId.AiAnalysisFollowupGraph,
	PromptId.AiAnalysisFollowupSources,
	PromptId.AiAnalysisFollowupBlocks,
	PromptId.AiAnalysisFollowupFull,
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
	[PromptId.AiSearchSystem]: SystemInfo;
	[PromptId.ThoughtAgentSystem]: { analysisMode?: 'simple' | 'full'; simpleMode?: boolean };
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
	[PromptId.AiAnalysisFollowupSummary]: { question: string; summary: string; originalQuery?: string };
	[PromptId.AiAnalysisFollowupGraph]: { question: string; nodeLabels: string; nodeCount: number; edgeCount: number; originalQuery?: string; mainSummary?: string };
	[PromptId.AiAnalysisFollowupSources]: { question: string; sourcesList: string; originalQuery?: string; mainSummary?: string };
	[PromptId.AiAnalysisFollowupBlocks]: { question: string; blocksText: string; originalQuery?: string; mainSummary?: string };
	[PromptId.AiAnalysisFollowupFull]: { question: string; summary: string; originalQuery?: string };
	[PromptId.AiAnalysisTitle]: { query: string; summary?: string };

	[PromptId.AiAnalysisSummarySystem]: Record<string, never>;
	[PromptId.AiAnalysisSummary]: DashboardUpdateContext;
	[PromptId.AiAnalysisOverviewMermaidSystem]: Record<string, never>;
	[PromptId.AiAnalysisOverviewMermaid]: DashboardUpdateContext & ErrorRetryInfo;
	[PromptId.AiAnalysisDashboardUpdateSourcesSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateSources]: DashboardUpdateContext & ErrorRetryInfo;
	[PromptId.AiAnalysisDashboardUpdateTopicsSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateTopics]: DashboardUpdateContext & ErrorRetryInfo;
	[PromptId.AiAnalysisDashboardUpdateGraphSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateGraph]: DashboardUpdateContext & ErrorRetryInfo;
	[PromptId.AiAnalysisDashboardUpdateBlocksSystem]: Record<string, never>;
	[PromptId.AiAnalysisDashboardUpdateBlocks]: DashboardUpdateContext & ErrorRetryInfo;

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
	[PromptId.AiSearchSystem]: createTemplate(aiSearchSystem),
	[PromptId.ThoughtAgentSystem]: createTemplate(thoughtAgentSystem),
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
	[PromptId.ImageDescription]: createTemplate(imageDescription),
	[PromptId.ImageSummary]: createTemplate(imageSummary),
	[PromptId.FolderProjectSummary]: createTemplate(folderProjectSummary),
	[PromptId.AiAnalysisFollowupSummary]: createTemplate(aiAnalysisFollowupSummary),
	[PromptId.AiAnalysisFollowupGraph]: createTemplate(aiAnalysisFollowupGraph),
	[PromptId.AiAnalysisFollowupSources]: createTemplate(aiAnalysisFollowupSources),
	[PromptId.AiAnalysisFollowupBlocks]: createTemplate(aiAnalysisFollowupBlocks),
	[PromptId.AiAnalysisFollowupFull]: createTemplate(aiAnalysisFollowupFull),
	[PromptId.AiAnalysisTitle]: createTemplate(aiAnalysisTitle),

	[PromptId.AiAnalysisSummarySystem]: createTemplate(aiAnalysisSummarySystem),
	[PromptId.AiAnalysisSummary]: {
		...createTemplate(aiAnalysisSummary),
		systemPromptId: PromptId.AiAnalysisSummarySystem,
	},

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
