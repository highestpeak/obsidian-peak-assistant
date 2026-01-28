// Import all prompt templates
import * as conversationSystem from './templates/conversation-system';
import * as conversationSummaryShort from './templates/conversation-summary-short';
import * as conversationSummaryFull from './templates/conversation-summary-full';
import * as projectSummaryShort from './templates/project-summary-short';
import * as projectSummaryFull from './templates/project-summary-full';
import * as searchAiSummary from './templates/search-ai-summary';
import * as searchTopicExtractJson from './templates/search-topic-extract-json';
import * as searchRerankRankGpt from './templates/search-rerank-rank-gpt';
import * as aiSearchSystem from './templates/ai-search-system';
import * as thoughtAgentSystem from './templates/thought-agent-system';
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
import * as docTypeClassifyJson from './templates/doc-type-classify-json';
import * as docTagGenerateJson from './templates/doc-tag-generate-json';
import * as contextMemory from './templates/context-memory';
import * as userProfileContext from './templates/user-profile-context';
import * as messageResources from './templates/message-resources';
import { SystemInfo } from '../tools/system-info';
import { SearchAgentResult, AgentMemory, AISearchAgentOptions } from '../agents/AISearchAgent';

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
function createTemplate(module: { template: string; expectsJson?: boolean; jsonConstraint?: string }): PromptTemplate {
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

	// Search prompts
	SearchAiSummary = 'search-ai-summary',
	SearchTopicExtractJson = 'search-topic-extract-json',
	SearchRerankRankGpt = 'search-rerank-rank-gpt',
	AiSearchSystem = 'ai-search-system',
	ThoughtAgentSystem = 'thought-agent-system',

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

	// Context building templates (internal use)
	ContextMemory = 'context-memory',
	UserProfileContext = 'user-profile-context',
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
	PromptId.SearchAiSummary,
	PromptId.SearchTopicExtractJson,
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
	[PromptId.SearchAiSummary]: {
		agentResult: SearchAgentResult;
		agentMemory: AgentMemory;
		options: AISearchAgentOptions;
		/** Pre-rendered text from latestMessages for template use */
		latestMessagesText?: string;
	};
	[PromptId.SearchTopicExtractJson]: {
		query: string;
		summary: string;
		sources: Array<{ title: string; path: string }>;
		graphContext?: string;
	};
	[PromptId.SearchRerankRankGpt]: {
		query: string;
		documents: Array<{ index: number; text: string; boostInfo?: string }>;
	};
	[PromptId.AiSearchSystem]: SystemInfo;
	[PromptId.ThoughtAgentSystem]: Record<string, never>;
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
	[PromptId.MessageResources]: {
		resources: Array<{
			id: string;
		}>;
	};
}

/**
 * Central prompt registry.
 * All prompts are loaded from individual template files in the templates/ directory.
 */
export const PROMPT_REGISTRY: Record<PromptId, PromptTemplate> = {
	[PromptId.ConversationSystem]: createTemplate(conversationSystem),
	[PromptId.ConversationSummaryShort]: createTemplate(conversationSummaryShort),
	[PromptId.ConversationSummaryFull]: createTemplate(conversationSummaryFull),
	[PromptId.ProjectSummaryShort]: createTemplate(projectSummaryShort),
	[PromptId.ProjectSummaryFull]: createTemplate(projectSummaryFull),
	[PromptId.SearchAiSummary]: createTemplate(searchAiSummary),
	[PromptId.SearchTopicExtractJson]: createTemplate(searchTopicExtractJson),
	[PromptId.SearchRerankRankGpt]: createTemplate(searchRerankRankGpt),
	[PromptId.AiSearchSystem]: createTemplate(aiSearchSystem),
	[PromptId.ThoughtAgentSystem]: createTemplate(thoughtAgentSystem),
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
	[PromptId.DocTypeClassifyJson]: createTemplate(docTypeClassifyJson),
	[PromptId.DocTagGenerateJson]: createTemplate(docTagGenerateJson),
	[PromptId.ContextMemory]: createTemplate(contextMemory),
	[PromptId.UserProfileContext]: createTemplate(userProfileContext),
	[PromptId.MessageResources]: createTemplate(messageResources),
};
