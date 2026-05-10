import { App } from 'obsidian';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { LLMUsage, LLMOutputControlSettings, LLMStreamEvent, ToolEvent } from '@/core/providers/types';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS, getAIUploadFolder } from '@/app/settings/types';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { DEFAULT_SUMMARY, PLAN_MODE_SYSTEM_PROMPT } from '@/core/constant';
import { EventBus, MessageSentEvent, ConversationCreatedEvent, ConversationUpdatedEvent } from '@/core/eventBus';
import { LLMRequestMessage } from '@/core/providers/types';
import {
	ChatContextWindow,
	ChatConversation,
	ChatConversationMeta,
	ChatMessage,
	ChatProject,
	ChatProjectMeta,
	ChatResourceRef,
} from './types';
import type { ConversationType } from './conversation-types';
import { PromptService } from '@/service/prompt/PromptService';
import { UserProfileService } from '@/service/chat/context/UserProfileService';
import { PromptId } from '@/service/prompt/PromptId';
import { ResourceSummaryService } from './context/ResourceSummaryService';
import { ContextBuilder } from './context/ContextBuilder';
import { ContextPipeline } from './context/ContextPipeline';
import { ChatProfile } from './context/profiles/ChatProfile';
import { SessionContextService } from '@/service/context/SessionContextService';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { ResourceLoaderManager } from '@/core/document/resource/helper/ResourceLoaderManager';
import type { AIServiceManager } from './service-manager';
import { createChatMessage } from '@/service/chat/utils/chat-message-builder';
import { generateContentPreview, generateAttachmentSummary } from '@/core/utils/message-preview-utils';
import { resolveModelCapabilities, type ModelCapabilities } from '@/core/providers/types';
import { detectTimezone } from '@/core/utils/date-utils';
import { uploadFilesToVault } from '@/core/utils/vault-utils';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { AppContext } from '@/app/context/AppContext';
import { buildChatTools } from '@/service/chat/tools/chatToolBuilder';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';

interface ChatPreparationResult {
	modelId: string;
	provider: string;
	timezone: string;
	prompt: LLMRequestMessage[];
	outputControl?: LLMOutputControlSettings;
	modelCapabilities: ModelCapabilities;
}

/**
 * Service for managing chat conversations.
 * Expects {@link AIServiceSettings} with a non-empty {@link AIServiceSettings.rootFolder} (same as {@link AIServiceManager}).
 */
export class ConversationService {
	private readonly contextBuilder: ContextBuilder;
	private contextPipeline: ContextPipeline | null = null;
	private readonly resourceLoaderManager: ResourceLoaderManager;

	constructor(
		private readonly app: App,
		private readonly storage: ChatStorageService,
		private readonly promptService: PromptService,
		private readonly defaultModel: { provider: string; modelId: string },
		private readonly resourceSummaryService: ResourceSummaryService,
		private readonly aiServiceManager: AIServiceManager,
		private readonly settings: AIServiceSettings,
		private readonly profileService?: UserProfileService,
	) {
		this.resourceLoaderManager = new ResourceLoaderManager(this.app, this.aiServiceManager, DocumentLoaderManager.getInstance());
		// Initialize context builder
		this.contextBuilder = new ContextBuilder(
			this.promptService,
			this.resourceSummaryService,
			this.profileService,
		);
	}

	setContextPipeline(pipeline: ContextPipeline): void {
		this.contextPipeline = pipeline;
	}

	async listConversations(projectId: string | null, limit?: number, offset?: number): Promise<ChatConversation[]> {
		return this.storage.listConversations(projectId, limit, offset);
	}

	async countConversations(projectId: string | null): Promise<number> {
		return this.storage.countConversations(projectId);
	}

	async deleteConversation(conversationId: string): Promise<void> {
		return this.storage.deleteConversation(conversationId);
	}

	async createConversation(params: {
		title: string;
		project?: ChatProjectMeta | null;
		initialMessages?: ChatMessage[];
		modelId?: string;
		provider?: string;
		conversationType?: ConversationType;
	}): Promise<ChatConversation> {
		const timestamp = Date.now();
		const meta: ChatConversationMeta = {
			id: generateUuidWithoutHyphens(),
			title: params.title,
			projectId: params.project?.id,
			createdAtTimestamp: timestamp,
			updatedAtTimestamp: timestamp,
			activeModel: params.modelId || this.defaultModel.modelId,
			activeProvider: params.provider || this.defaultModel.provider,
			tokenUsageTotal: 0,
			conversationType: params.conversationType,
		};

		const conversation = await this.storage.saveConversation(
			params.project ?? null, meta, undefined, params.initialMessages ?? [],
		);
		EventBus.getInstance(this.app).dispatch(new ConversationCreatedEvent({
			conversationId: conversation.meta.id, projectId: conversation.meta.projectId ?? null,
		}));

		return conversation;
	}

	async uploadFilesAndCreateResources(files: File[]): Promise<ChatResourceRef[]> {
		if (!files || files.length === 0) {
			return [];
		}

		const uploadFolder = getAIUploadFolder();

		// Upload files to vault
		const uploadedPaths = await uploadFilesToVault(files, uploadFolder);

		// Create resource references for uploaded files
		const resources: ChatResourceRef[] = uploadedPaths.map((filePath) => {
			const resourceRef = this.resourceSummaryService!.createResourceRef(filePath);
			resourceRef.summaryNotePath = this.resourceSummaryService!.getResourceSummaryPath(resourceRef.id);
			return resourceRef;
		});

		return resources;
	}

	streamChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
	}): AsyncGenerator<LLMStreamEvent> {
		const self = this;
		return (async function* (): AsyncGenerator<LLMStreamEvent> {
			const preparationGenerator = self.prepareChatRequest(params);
			// Manually iterate through the generator to get both events and final result
			let prepared: ChatPreparationResult | undefined;
			let result: IteratorResult<LLMStreamEvent, ChatPreparationResult>;
			while (!(result = await preparationGenerator.next()).done) {
				// Yield all intermediate events
				if (result.value) {
					yield result.value;
				}
			}
			// Get the final return value
			prepared = result.value;

			// Prefer active chat config if it matches the conversation's provider;
			// fall back to scanning all profiles (handles per-conversation model overrides)
			const registry = ProfileRegistry.getInstance();
			const convProvider = prepared.provider;
			const convModelId = prepared.modelId;
			const chatConfig = registry.getActiveChatConfig();
			const profile = chatConfig?.profile.kind === convProvider
				? chatConfig.profile
				: registry.getAllProfiles().find(p => p.kind === convProvider && p.enabled !== false && p.apiKey);

			if (!profile) {
				throw new Error(`No active profile found for provider "${convProvider}". Please configure it in Settings → Profiles.`);
			}

			// Resolve conversation mode from UI store (runtime mode) or conversation metadata
			const runtimeMode = useChatViewStore.getState().chatMode;
			const convTypeKind = params.conversation.meta.conversationType?.kind;
			const effectiveMode = runtimeMode ?? convTypeKind ?? 'chat';

			// Build tools based on mode + UI toggles + model capabilities
			// Chat mode: no tools (pure conversation)
			// Agent mode: full tool access
			// Plan mode: no tools (planning focus), but prepend planning system prompt
			let tools: Record<string, any> = {};
			let maxSteps = 1;

			if (effectiveMode === 'agent') {
				const { enableWebSearch } = useChatViewStore.getState();
				const ctx = AppContext.getInstance();
				const built = buildChatTools(
					{ app: ctx.app, pluginId: ctx.plugin.manifest.id, enableWebSearch },
					prepared.modelCapabilities,
				);
				tools = built.tools;
				maxSteps = built.maxSteps;
			}
			// chat and plan modes: no tools

			// Plan mode: prepend planning-focused system prompt
			if (effectiveMode === 'plan') {
				const planSystemPrompt = PLAN_MODE_SYSTEM_PROMPT;
				// Find the system message and prepend planning instructions
				const systemIdx = prepared.prompt.findIndex(m => m.role === 'system');
				if (systemIdx >= 0) {
					const existing = prepared.prompt[systemIdx];
					const existingText = existing.content
						.map((c: any) => c.text ?? '')
						.join('');
					prepared.prompt[systemIdx] = {
						role: 'system',
						content: [{ type: 'text', text: planSystemPrompt + '\n\n' + existingText }],
					};
				} else {
					prepared.prompt.unshift({
						role: 'system',
						content: [{ type: 'text', text: planSystemPrompt }],
					});
				}
			}

			const { vercelStreamChat } = await import('@/core/providers/vercel');
			yield* vercelStreamChat(profile, convModelId || profile.primaryModel, {
				messages: prepared.prompt,
				outputControl: prepared.outputControl,
				tools: Object.keys(tools).length > 0 ? tools : undefined,
				maxSteps,
			});
		})();
	}

	private async *prepareChatRequest(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
	}): AsyncGenerator<LLMStreamEvent, ChatPreparationResult, void> {
		const { conversation, project, userContent, attachments } = params;
		const modelId = conversation.meta.activeModel || this.defaultModel.modelId;
		const provider = conversation.meta.activeProvider || this.defaultModel.provider;
		// Get model capabilities and attachment handling mode
		const currentModel = await this.aiServiceManager.getModelInfo(modelId, provider);
		const modelCapabilities = resolveModelCapabilities(currentModel);

		const timezone = detectTimezone();
		const originalUserMessage = createChatMessage('user', userContent, modelId, provider, timezone);

		// Convert legacy attachments to resources if provided
		const attachmentHandlingMode = conversation.meta.attachmentHandlingOverride
			?? this.settings?.attachmentHandlingDefault
			?? DEFAULT_AI_SERVICE_SETTINGS.attachmentHandlingDefault;
		if (attachments && attachments.length > 0) {
			const resources = [];
			for (const attachment of attachments) {
				const resourceRef = this.resourceSummaryService!.createResourceRef(attachment);
				const summaryPath = this.resourceSummaryService!.getResourceSummaryPath(resourceRef.id);
				resourceRef.summaryNotePath = summaryPath;

				// Check if we should generate summary or use direct mode
				if (attachmentHandlingMode !== 'direct') {
					// Degrade mode or non-vision: ensure resource summary exists
					yield { type: 'tool-call', toolName: ToolEvent.GENERATE_SUMMARY, input: attachment };
					await this.ensureResourceSummary(attachment, resourceRef);
					yield { type: 'tool-result', toolName: ToolEvent.GENERATE_SUMMARY, input: attachment };
				}

				resources.push(resourceRef);
			}
			originalUserMessage.resources = resources;
		}

		// Build prompt from context and user input
		const historyMessage = [...conversation.messages, originalUserMessage];
		const buildCtx = {
			sessionContext: SessionContextService.getInstance(),
			conversation,
			project: project ?? undefined,
			messages: historyMessage,
			app: this.app,
			modelCapabilities,
			attachmentHandlingMode,
		};
		const contextGenerator = this.contextPipeline
			? this.contextPipeline.assemble(ChatProfile, buildCtx, modelCapabilities)
			: this.contextBuilder.buildContextMessages({
				conversation,
				project,
				messages: historyMessage,
				modelCapabilities,
				attachmentHandlingMode,
				app: this.app,
			});
		// Consume progress events
		let result: IteratorResult<LLMStreamEvent, LLMRequestMessage[]>;
		while (!(result = await contextGenerator.next()).done) {
			// Yield all intermediate events
			if (result.value) {
				yield result.value;
			}
		}
		const prompt = result.value;

		const outputControl = conversation.meta.outputControlOverride
			?? this.settings?.defaultOutputControl
			?? DEFAULT_AI_SERVICE_SETTINGS.defaultOutputControl;

		return {
			modelId,
			provider,
			timezone,
			prompt: prompt,
			outputControl,
			modelCapabilities,
		};
	}

	async updateConversationContext(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		context: ChatContextWindow;
		messageIndex: number; // Message index when context was updated
	}): Promise<ChatConversation> {
		const { conversation, project, context, messageIndex } = params;
		// Update context but keep messages unchanged
		const updatedMeta: ChatConversationMeta = {
			...conversation.meta,
			updatedAtTimestamp: Date.now(),
			contextLastUpdatedTimestamp: Date.now(),
			contextLastMessageIndex: messageIndex,
		};
		return await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			context
		);
	}

	async updateConversationModel(params: {
		conversationId: string;
		modelId: string;
		provider: string;
	}): Promise<void> {
		await this.storage.upsertConversationMeta(params.conversationId, {
			activeModel: params.modelId,
			activeProvider: params.provider,
			updatedAtTimestamp: Date.now(),
		});
	}

	async updateConversationOutputControl(params: {
		conversationId: string;
		outputControlOverride?: LLMOutputControlSettings;
	}): Promise<void> {
		await this.storage.upsertConversationMeta(params.conversationId, {
			outputControlOverride: params.outputControlOverride && Object.keys(params.outputControlOverride).length > 0 ? params.outputControlOverride : undefined,
			updatedAtTimestamp: Date.now(),
		});
	}

	async updateConversationAttachmentHandling(params: {
		conversationId: string;
		attachmentHandlingOverride?: 'direct' | 'degrade_to_text';
	}): Promise<void> {
		await this.storage.upsertConversationMeta(params.conversationId, {
			attachmentHandlingOverride: params.attachmentHandlingOverride,
			updatedAtTimestamp: Date.now(),
		});
		const updatedConversation = await this.storage.readConversation(params.conversationId, false);
		if (updatedConversation) {
			EventBus.getInstance(this.app).dispatch(new ConversationUpdatedEvent({ conversation: updatedConversation }));
		}
	}

	async updateConversationCustomSystemPrompt(params: {
		conversationId: string;
		customSystemPrompt?: string;
	}): Promise<void> {
		await this.storage.upsertConversationMeta(params.conversationId, {
			customSystemPrompt: params.customSystemPrompt || undefined,
			updatedAtTimestamp: Date.now(),
		});
		const updatedConversation = await this.storage.readConversation(params.conversationId, false);
		if (updatedConversation) {
			EventBus.getInstance(this.app).dispatch(new ConversationUpdatedEvent({ conversation: updatedConversation }));
		}
	}

	/**
	 * Branch (fork) a conversation from a specific message.
	 * Creates a new conversation with all messages up to and including the given messageId.
	 */
	async branchFromMessage(params: {
		sourceConversation: ChatConversation;
		messageId: string;
		project?: ChatProjectMeta | null;
	}): Promise<ChatConversation> {
		const { sourceConversation, messageId, project } = params;
		const messageIndex = sourceConversation.messages.findIndex(m => m.id === messageId);
		if (messageIndex === -1) {
			throw new Error(`Message not found: ${messageId}`);
		}

		// Copy all messages up to and including the target message
		const branchedMessages = sourceConversation.messages.slice(0, messageIndex + 1).map(m => ({
			...m,
			id: generateUuidWithoutHyphens(), // New IDs for the copied messages
		}));

		const branchTitle = `Branch: ${sourceConversation.meta.title}`;

		return this.createConversation({
			title: branchTitle,
			project,
			initialMessages: branchedMessages,
			modelId: sourceConversation.meta.activeModel,
			provider: sourceConversation.meta.activeProvider,
			conversationType: sourceConversation.meta.conversationType,
		});
	}

	async updateConversationFocusFolder(params: {
		conversationId: string;
		focusFolder?: string;
	}): Promise<void> {
		await this.storage.upsertConversationMeta(params.conversationId, {
			focusFolder: params.focusFolder || undefined,
			updatedAtTimestamp: Date.now(),
		});
		const updatedConversation = await this.storage.readConversation(params.conversationId, false);
		if (updatedConversation) {
			EventBus.getInstance(this.app).dispatch(new ConversationUpdatedEvent({ conversation: updatedConversation }));
		}
	}

	async updateConversationTitle(params: {
		conversationId: string;
		title: string;
		titleManuallyEdited?: boolean;
		titleAutoUpdated?: boolean;
	}): Promise<void> {
		const { conversationId, title, titleManuallyEdited = true, titleAutoUpdated = false } = params;
		const newFileRelPath = await this.storage.renameConversationFile(conversationId, title);
		await this.storage.upsertConversationMeta(conversationId, {
			id: conversationId, title, titleManuallyEdited, titleAutoUpdated, fileRelPath: newFileRelPath,
		});
		const updatedConversation = await this.storage.readConversation(conversationId, false);
		if (updatedConversation) {
			EventBus.getInstance(this.app).dispatch(new ConversationUpdatedEvent({ conversation: updatedConversation }));
		}
	}

	async toggleStar(params: {
		messageId: string;
		conversationId: string;
		starred: boolean;
	}): Promise<void> {
		const { messageId, starred, conversationId } = params;

		let contentPreview: string | null = null;
		let attachmentSummary: string | null = null;

		// When starring, load message content to generate preview
		if (starred) {
			const conversation = await this.storage.readConversation(conversationId, true);
			if (conversation) {
				const message = conversation.messages.find((m) => m.id === messageId);
				if (message) {
					// Generate preview and summary
					contentPreview = generateContentPreview(message.content);
					attachmentSummary = generateAttachmentSummary(message.resources);
				}
			}
		}

		// Update starred status with preview data
		await this.storage.updateMessageStarred(messageId, starred, contentPreview, attachmentSummary);
	}

	async listStarredMessagesByProject(projectId: string): Promise<{
		messages: ChatMessage[];
		messageToConversationId: Map<string, string>;
	}> {
		return this.storage.listStarredMessagesByProject(projectId);
	}

	async addMessage(params: {
		conversationId: string;
		message: ChatMessage;
		model: string;
		provider: string;
		usage: LLMUsage;
	}): Promise<void> {
		const { conversationId, message, model, provider, usage } = params;

		await this.storage.saveNewMessage(conversationId, message);
		const updatedMeta = await this.storage.upsertConversationMeta(conversationId, {
			activeModel: model,
			activeProvider: provider,
			tokenUsageTotal: usage?.totalTokens ?? 0,
		});
		if (!updatedMeta) {
			throw new Error(`Failed to update conversation meta: ${conversationId}`);
		}

		EventBus.getInstance(this.app).dispatch(new MessageSentEvent({ conversationId, projectId: null }));
	}

	async generateConversationTitle(messages: ChatMessage[], context: ChatContextWindow): Promise<string | null> {
		if (messages.length === 0) {
			return null;
		}

		try {
			const messagesForPrompt = messages.slice(0, 5).map((m) => ({ role: m.role, content: m.content }));
			const contextInfo = context.shortSummary && context.shortSummary !== DEFAULT_SUMMARY
				? `Context: ${context.shortSummary}` : undefined;

			const title = await this.promptService.chatWithPrompt(
				PromptId.ApplicationGenerateTitle, { messages: messagesForPrompt, contextInfo }
			);
			const cleanedTitle = title.replace(/^["']|["']$/g, '').trim().substring(0, 50);
			return cleanedTitle || null;
		} catch (error) {
			console.warn('[ConversationService] Failed to generate title:', error);
			return null;
		}
	}

	async buildContextWindow(
		messages: ChatMessage[],
		project?: ChatProject | null,
	): Promise<ChatContextWindow> {
		if (messages.length === 0) {
			return {
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow: [],
				shortSummary: DEFAULT_SUMMARY,
			};
		}

		const recent = messages.slice(-10);
		const recentMessagesWindow = [{ fromMessageId: recent[0].id, toMessageId: recent[recent.length - 1].id }];

		try {
			const messagesForSummary = recent.map((m) => ({ role: m.role, content: m.content }));
			const projectContext = project
				? `Project: ${project.meta.name}${project.context?.shortSummary ? `\n${project.context.shortSummary}` : ''}`
				: undefined;

			const shortSummary = await this.promptService.chatWithPrompt(
				PromptId.ConversationSummaryShort, { messages: messagesForSummary, projectContext },
			) || DEFAULT_SUMMARY;

			const fullSummary = messages.length > 5
				? await this.promptService.chatWithPrompt(
					PromptId.ConversationSummaryFull, { messages: messagesForSummary, projectContext, shortSummary },
				) : undefined;

			return { lastUpdatedTimestamp: Date.now(), recentMessagesWindow, shortSummary, fullSummary };
		} catch (error) {
			console.warn('[ConversationService] Failed to generate summary:', error);
			return {
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow,
				shortSummary: DEFAULT_SUMMARY,
			};
		}
	}

	private async ensureResourceSummary(sourcePath: string, resourceRef: ChatResourceRef): Promise<void> {
		if (!this.resourceSummaryService) return;
		const existing = await this.resourceSummaryService.readResourceSummary(resourceRef.id);
		if (existing?.meta.shortSummary || existing?.meta.fullSummary) return;

		const base = { resourceId: resourceRef.id, source: resourceRef.source, kind: resourceRef.kind };
		try {
			const summary = await this.resourceLoaderManager.getSummary(sourcePath, resourceRef.kind)
				|| { shortSummary: `Resource: ${sourcePath}` };
			await this.resourceSummaryService.saveResourceSummary({ ...base, shortSummary: summary.shortSummary, fullSummary: summary.fullSummary });
		} catch (error) {
			console.warn(`[ConversationService] Failed to generate resource summary for ${sourcePath}:`, error);
			const errorSummary = `GenSummaryFailed.[${error instanceof Error ? error.message : String(error)}][${new Date().toISOString()}]`;
			await this.resourceSummaryService.saveResourceSummary({ ...base, shortSummary: errorSummary });
		}
	}

}
