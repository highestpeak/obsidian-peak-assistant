import type { AppHandle } from '@/core/ports/AppHandle';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { LLMUsage, LLMOutputControlSettings, LLMStreamEvent, ToolEvent } from '@/core/providers/types';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/core/config/settingsTypes';
import { getAIUploadFolder } from '@/core/config/folderPaths';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import { DEFAULT_SUMMARY } from '@/core/constant';
import { TemplateManager } from '@/core/template/TemplateManager';
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
import { PromptId } from '@/core/types/prompt';
import { ResourceSummaryService } from './context/ResourceSummaryService';
import { ContextPipeline } from './context/ContextPipeline';
import type { DebugRunHandle, DebugTracePort } from '@/core/debug-trace';
import { ChatProfile } from './context/profiles/ChatProfile';
import { SessionContextService } from '@/service/context/SessionContextService';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { ResourceLoaderManager } from '@/core/document/resource/helper/ResourceLoaderManager';
import type { AIServiceManager } from './service-manager';
import { createChatMessage } from '@/service/chat/utils/chat-message-builder';
import { generateContentPreview, generateAttachmentSummary } from '@/core/utils/message-preview-utils';
import { resolveModelCapabilities, type ModelCapabilities } from '@/core/providers/types';
import { detectTimezone } from '@/core/utils/date-utils';
import { uploadFilesToVault } from '@/core/storage/vault/vault-ops';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { resolveChatExecutionStrategy } from '@/service/chat/execution-strategy';
import type { ChatRuntimeStatePort } from '@/core/ports/ChatRuntimeStatePort';

interface ChatPreparationResult {
	modelId: string;
	provider: string;
	timezone: string;
	prompt: LLMRequestMessage[];
	outputControl?: LLMOutputControlSettings;
	modelCapabilities: ModelCapabilities;
	/**
	 * The chat debug run opened during prepare. `streamChat` finishes it
	 * once the assistant stream terminates so token usage and finishReason
	 * land on the same run as context.assemble spans.
	 */
	debugRun?: DebugRunHandle;
}

/**
 * Service for managing chat conversations.
 * Expects {@link AIServiceSettings} with a non-empty {@link AIServiceSettings.rootFolder} (same as {@link AIServiceManager}).
 */
export class ConversationService {
	private contextPipeline: ContextPipeline | null = null;
	private readonly resourceLoaderManager: ResourceLoaderManager;
	private debugTracePort: DebugTracePort | null = null;
	private lastDebugRunId: string | null = null;

	constructor(
		private readonly app: AppHandle,
		private readonly storage: ChatStorageService,
		private readonly promptService: PromptService,
		private readonly defaultModel: { provider: string; modelId: string },
		private readonly resourceSummaryService: ResourceSummaryService,
		private readonly aiServiceManager: AIServiceManager,
		private readonly settings: AIServiceSettings,
		private readonly chatState: ChatRuntimeStatePort,
		/** T11J B3: pluginId injected so we don't reach AppContext. */
		private readonly pluginId: string,
		private readonly profileService?: UserProfileService,
	) {
		const loaderMgr = DocumentLoaderManager.getInstance();
		this.resourceLoaderManager = new ResourceLoaderManager(loaderMgr.getVaultReader(), this.aiServiceManager, loaderMgr);
	}

	setContextPipeline(pipeline: ContextPipeline): void {
		this.contextPipeline = pipeline;
	}

	setDebugTracePort(port: DebugTracePort | null): void {
		this.debugTracePort = port;
	}

	/**
	 * The runId of the most recent chat turn's debug trace (if enabled and a
	 * turn completed). UI surfaces reach for this when the user clicks
	 * "Copy debug trace" on the latest assistant message.
	 */
	getLastDebugRunId(): string | null {
		return this.lastDebugRunId;
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

		const uploadFolder = getAIUploadFolder(this.settings.rootFolder);

		// Upload files to vault
		const uploadedPaths = await uploadFilesToVault(files, uploadFolder, this.app);

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
			// 2026-07 F.B follow-up (Debt-2): `/plan ` prefix opts a single message
			// into planning mode without touching the persisted conversationType or
			// the runtime chatMode. The prefix is stripped before the message
			// reaches the LLM. Users get planning UX ("please think about it as a
			// plan, list steps, surface uncertainty") without a routing branch.
			const planIntent = detectPlanIntent(params.userContent);
			const effectiveParams = planIntent
				? { ...params, userContent: stripPlanPrefix(params.userContent) }
				: params;
			const preparationGenerator = self.prepareChatRequest(effectiveParams);
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

			// 2026-07-05 chat-unified-mode (Track B): resolve execution shape
			// through a single helper. The UI no longer presents Chat / Agent /
			// Plan as peer modes — every fresh conversation runs the default
			// assistant profile with tool access decided by capabilities +
			// toggles + permissions. The legacy `chatMode` on the UI store is
			// only kept for history restore; `service-conversation` never
			// reads it back. `/plan ` slash-prefix (planIntent) and restored
			// `conversationType.kind === 'plan'` are the ONLY paths into the
			// planning system prompt.
			const strategy = resolveChatExecutionStrategy({
				planIntent,
				legacyConversationTypeKind: params.conversation.meta.conversationType?.kind ?? null,
				toolDeps: {
					app: self.app,
					pluginId: self.pluginId,
					enableWebSearch: self.chatState.isWebSearchEnabled(),
				},
				modelCapabilities: prepared.modelCapabilities,
			});

			// Plan mode: prepend planning-focused system prompt
			if (strategy.usePlanSystemPrompt) {
				// T11Y-6: PLAN_MODE_SYSTEM_PROMPT body lives at templates/prompts/plan-mode-system.md.
				const tm = TemplateManager.getInstance();
				if (!tm) throw new Error('TemplateManager not bound — cannot render plan-mode system prompt.');
				const planSystemPrompt = await tm.render(PromptId.PlanModeSystem, {});
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

			// Debug: profile / settings snapshot before the model call, so a
			// reader can exactly reproduce the turn (which profile, which
			// tools, plan mode, output control). Recorded on the run summary
			// rather than as a span so it stays out of the span tree.
			if (prepared.debugRun) {
				prepared.debugRun.mergeSummary({
					profileId: profile.id,
					profileKind: profile.kind,
					profileBaseUrl: profile.baseUrl,
					usePlanSystemPrompt: strategy.usePlanSystemPrompt,
					toolCount: Object.keys(strategy.tools).length,
					toolNames: Object.keys(strategy.tools),
					maxSteps: strategy.maxSteps,
					// outputControl carries user-visible knobs (temperature,
					// maxTokens...) — dump keys only so we don't leak values
					// the user may have customised in a sensitive way.
					outputControlKeys: prepared.outputControl
						? Object.keys(prepared.outputControl)
						: [],
				});
			}

			const { vercelStreamChat } = await import('@/core/providers/vercel');
			const streamGen = vercelStreamChat(profile, convModelId || profile.primaryModel, {
				messages: prepared.prompt,
				outputControl: prepared.outputControl,
				tools: Object.keys(strategy.tools).length > 0 ? strategy.tools : undefined,
				maxSteps: strategy.maxSteps,
			});
			// Debug: sniff finishReason + usage as they pass through, then
			// finish the chat run so a copy trace reflects the full turn.
			let lastFinishReason: string | undefined;
			let lastUsage: LLMUsage | undefined;
			let assistantTextLength = 0;
			try {
				for await (const evt of streamGen) {
					if (evt && typeof evt === 'object') {
						const anyEvt = evt as { type?: string; finishReason?: string; usage?: LLMUsage; text?: string };
						if (anyEvt.type === 'text-delta' && typeof anyEvt.text === 'string') {
							assistantTextLength += anyEvt.text.length;
						}
						if (anyEvt.finishReason) lastFinishReason = anyEvt.finishReason;
						if (anyEvt.usage) lastUsage = anyEvt.usage;
					}
					yield evt;
				}
				if (prepared.debugRun) {
					prepared.debugRun.mergeSummary({
						assistantTextLength,
						...(lastFinishReason ? { finishReason: lastFinishReason } : {}),
						...(lastUsage?.totalTokens !== undefined
							? { totalTokens: lastUsage.totalTokens }
							: {}),
						...(lastUsage?.promptTokens !== undefined
							? { promptTokens: lastUsage.promptTokens }
							: {}),
						...(lastUsage?.completionTokens !== undefined
							? { completionTokens: lastUsage.completionTokens }
							: {}),
					});
					prepared.debugRun.finish('completed');
				}
			} catch (err) {
				if (prepared.debugRun) prepared.debugRun.finish('failed');
				throw err;
			}
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
		if (!this.contextPipeline) {
			throw new Error('ConversationService.contextPipeline not wired. AIServiceManager must call setContextPipeline() before prepareChat().');
		}
		// Debug: open a chat.turn run before context assemble. The run stays
		// open through streaming and is finished by streamChat once the model
		// response completes so token usage / finishReason land on the same
		// run as the context stack.
		const debugRun = this.debugTracePort?.isEnabled()
			? this.debugTracePort.startRun({
					surface: 'chat',
					capabilityId: 'chat.turn',
				})
			: null;
		if (debugRun) {
			// First-class user.message span so the receipt reader doesn't have
			// to dig through slot excerpts to find what the user asked. The
			// recorder redacts payloads according to mode; excerpt is always
			// safe.
			const userSpan = debugRun.startSpan({
				kind: 'custom',
				name: 'user.message',
			});
			userSpan.setInput({
				raw: userContent,
				contentType: 'text/markdown',
			});
			userSpan.setParams({
				attachmentCount: attachments?.length ?? 0,
				messageHistoryCount: conversation.messages.length,
			});
			userSpan.finish();
		}
		let contextGenerator: AsyncGenerator<LLMStreamEvent, LLMRequestMessage[], void>;
		try {
			contextGenerator = this.contextPipeline.assemble(
				ChatProfile,
				buildCtx,
				modelCapabilities,
				debugRun ?? undefined,
			);
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

			if (debugRun) {
				debugRun.mergeSummary({
					modelId,
					provider,
					userContentLength: userContent.length,
					messageCountBefore: conversation.messages.length,
				});
				this.lastDebugRunId = debugRun.runId;
			}

			return {
				modelId,
				provider,
				timezone,
				prompt: prompt,
				outputControl,
				modelCapabilities,
				debugRun: debugRun ?? undefined,
			};
		} catch (err) {
			if (debugRun) {
				debugRun.finish('failed');
				this.lastDebugRunId = debugRun.runId;
			}
			throw err;
		}
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

	/**
	 * Move a conversation into (or out of) a project.
	 */
	async moveToProject(params: {
		conversationId: string;
		projectId?: string;
	}): Promise<void> {
		await this.storage.upsertConversationMeta(params.conversationId, {
			projectId: params.projectId || undefined,
			updatedAtTimestamp: Date.now(),
		});
		const updatedConversation = await this.storage.readConversation(params.conversationId, false);
		if (updatedConversation) {
			EventBus.getInstance(this.app).dispatch(new ConversationUpdatedEvent({ conversation: updatedConversation }));
		}
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

	/**
	 * Persist generated follow-up question chips for an assistant message.
	 * Called after the assistant stream completes and the followup generation
	 * round-trip finishes — keeps the chips alive across conversation reloads
	 * so MessageSuggestedNext never re-generates.
	 */
	async updateMessageSuggestedFollowups(messageId: string, followups: string[]): Promise<void> {
		await this.storage.updateMessageSuggestedFollowups(messageId, followups);
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

/**
 * Debt-2 (2026-07): per-message `/plan ` prefix detection.
 *
 * Users get planning UX without a persistent mode. Detection is intentionally
 * strict — leading whitespace tolerated, then a literal `/plan` followed by a
 * space or newline. `/plan-x` or `/planner` do not match.
 */
const PLAN_PREFIX_REGEX = /^\s*\/plan(?=[ \t\r\n])/i;

function detectPlanIntent(userContent: string): boolean {
	if (typeof userContent !== 'string' || userContent.length === 0) return false;
	return PLAN_PREFIX_REGEX.test(userContent);
}

function stripPlanPrefix(userContent: string): string {
	const trimmedLeading = userContent.replace(/^\s+/, '');
	const remainder = trimmedLeading.replace(/^\/plan[ \t\r\n]+/i, '');
	return remainder;
}

