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
import type { ChatArtifactReceipt, ChatAssistantDefinition, ModelSelection, TurnExecutionReceipt } from '@/core/types/chat-studio';
import type { VaultRetrievalPort } from '@/core/ports/VaultRetrievalPort';
import type { SourceReceiptCollector } from './tools/sourceReceiptCollector';
import { PromptService } from '@/service/prompt/PromptService';
import { UserProfileService } from '@/service/chat/context/UserProfileService';
import { PromptId } from '@/core/types/prompt';
import { ResourceSummaryService } from './context/ResourceSummaryService';
import { ContextPipeline } from './context/ContextPipeline';
import type { DebugRun, DebugRunHandle, DebugTracePort } from '@/core/debug-trace';
import { ChatProfile } from './context/profiles/ChatProfile';
import { SessionContextService } from '@/service/context/SessionContextService';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { ResourceLoaderManager } from '@/core/document/resource/helper/ResourceLoaderManager';
import type { AIServiceManager } from './service-manager';
import { createChatMessage } from '@/service/chat/utils/chat-message-builder';
import { filterActiveVariants, planRetryVariant } from '@/core/types/chat-message-variants';
import { generateContentPreview, generateAttachmentSummary } from '@/core/utils/message-preview-utils';
import { resolveModelCapabilities, type ModelCapabilities } from '@/core/providers/types';
import { detectTimezone } from '@/core/utils/date-utils';
import { uploadFilesToVault } from '@/core/storage/vault/vault-ops';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { resolveChatExecutionStrategy } from '@/service/chat/execution-strategy';
import { harnessStreamChat, type HarnessChatStreamResult } from '@/service/chat/harnessChatRunner';
import { loadChatRuntimeConfig } from '@/service/chat/chatRuntimeConfig';
import type { ChatRuntimeStatePort } from '@/core/ports/ChatRuntimeStatePort';
import type { MCPClientManager } from '@/service/mcp/MCPClientManager';
import type { ToolAvailability } from '@/service/chat/tools/toolAvailability';
import { resolveToolAvailability } from '@/service/chat/tools/toolAvailability';
import type { MediaGenerationService } from '@/service/media/MediaGenerationService';
import type { MediaUnderstandingRuntime } from '@/service/media/MediaUnderstandingRuntime';
import type { ArtifactProducerService } from '@/service/chat/artifacts/artifactProducers';
import { mediaGenerationServiceAsProbe } from '@/service/chat/tools/mediaGenerationProbe';
import { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';
import type {
	PermissionAskRequest,
	PermissionAskResolution,
} from '@/service/agents/harness/loop/types';
import {
	buildAssistantPermissionRules,
	filterToolsByAssistantPolicy,
	mergeAssistantKnowledgeRefs,
	resolveAssistantForConversation,
	resolveAssistantPermissionMode,
	resolveEffectiveModel,
	type EffectiveModelResolution,
	type ResolvedAssistant,
} from '@/service/chat/assistant/assistantResolver';
import { EphemeralAssistantRegistry } from '@/service/chat/assistant/EphemeralAssistantRegistry';
import {
	loadModelRoutingConfig,
	routeAutoModel,
	type AutoRoutingSignals,
} from '@/service/chat/modelRouter';

/**
 * B2 (plan §5.3.5): what the outer `streamChat` returns. Extends the harness
 * result with the resolved effective model + resolution source so the UI can
 * write an honest `TurnExecutionReceipt.effectiveModel` (which the pre-B2
 * path picked from `conversation.meta.activeModel` — wrong whenever the
 * assistant's preferredModel or Auto default overrode the conversation
 * value).
 */
export interface ChatStreamTurnResult extends HarnessChatStreamResult {
	effectiveModel: {
		provider: string;
		modelId: string;
		profileId?: string;
	};
	assistantId?: string;
	modelSource: EffectiveModelResolution['source'];
	assistantPreferredUnavailable?: boolean;
	/** COMP-05: honest routing reason when Auto routed this turn. */
	routeReason?: string;
	/** COMP-05: required capabilities the router used, for the receipt. */
	requiredCapabilities?: string[];
}

interface ChatPreparationResult {
	modelId: string;
	provider: string;
	timezone: string;
	prompt: LLMRequestMessage[];
	outputControl?: LLMOutputControlSettings;
	modelCapabilities: ModelCapabilities;
	/**
	 * B2 (plan §5.3): the resolved assistant snapshot for this turn (null =
	 * Default). Forwarded from `streamChat` so post-prepare stages
	 * (tool-policy filter, permission rules, receipt) all read one source.
	 */
	resolvedAssistant: ResolvedAssistant | null;
	/**
	 * B2 (plan §5.3.5): honest record of which step of the model precedence
	 * chain served this turn. `streamChat` surfaces it on the debug run
	 * summary so a reader can see "assistant-preferred" or a fallback
	 * decision without re-running the resolver.
	 */
	modelResolution: EffectiveModelResolution;
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
	private vaultRetrievalPort: VaultRetrievalPort | null = null;
	/**
	 * MCP client manager (B1 §5.2 R3). Injected by the app layer (main.ts)
	 * after `AppRuntimeRegistry.setMcpClientManager` runs. Null = no MCP
	 * tools appear in the chat tool set at all — availability records show
	 * zero MCP entries, not "disconnected", so the UI knows MCP is absent
	 * entirely (not merely unreachable).
	 */
	private mcpClientManager: MCPClientManager | null = null;
	/**
	 * Live permission-ask resolver (B1 §5.2 R4). App layer binds this via
	 * `setPermissionAskResolver`. Absent → any `ask` decision defaults to
	 * deny (matches PermissionGuard contract; see AgentLoop docs). Chat UI
	 * (useStreamChat) supplies the real resolver.
	 */
	private permissionAskResolver:
		| ((request: PermissionAskRequest) => Promise<PermissionAskResolution> | PermissionAskResolution)
		| null = null;
	/**
	 * MediaGenerationService (D1 §R1). App-layer composes and injects
	 * this after sqlite init (mirrors `setMcpClientManager`). Null until
	 * bound → `media_generate` tool is reported unconfigured and NOT
	 * registered as a ToolDef.
	 */
	private mediaGenerationService: MediaGenerationService | null = null;
	/** Zero-gap Track D (2026-07-21): app-owned artifact_create producer. */
	private artifactProducer: ArtifactProducerService | null = null;
	/**
	 * Zero-gap Track C1 (2026-07-21): media understanding runtime. App-layer
	 * composes and injects (mirrors `setMediaGenerationService`). Null until
	 * bound → audio/video attachments degrade to `attachment-only` and the
	 * Composer gate warns the user.
	 */
	private mediaUnderstandingRuntime: MediaUnderstandingRuntime | null = null;
	/**
	 * Ephemeral assistant overrides (Assistant Builder Preview, 2026-07-21).
	 * When the user hits "Preview in current conversation" in the builder,
	 * we bind an unsaved `ChatAssistantDefinition` draft to a conversation
	 * id here. The resolver checks this map BEFORE hitting the persistent
	 * `AssistantService`, so the draft's instructions / toolPolicy /
	 * knowledgeRefs / preferredModel take effect on the next turn without
	 * writing to disk. Cleared on `saveEphemeralClear` (Save flow) or when
	 * the user cancels preview; plugin reload wipes the map naturally.
	 */
	private readonly ephemeralAssistants = new EphemeralAssistantRegistry();

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
	 * Wire the real Vault retrieval port (app layer, after SearchClient init).
	 * While null, Vault Search is UNAVAILABLE: no tool is built and the UI
	 * must reflect that (chat-studio RUN-01).
	 */
	setVaultRetrievalPort(port: VaultRetrievalPort | null): void {
		this.vaultRetrievalPort = port;
	}

	isVaultSearchAvailable(): boolean {
		return this.vaultRetrievalPort !== null;
	}

	/**
	 * Wire the MCP client manager (B1 §5.2 R3). Called from `main.ts` once
	 * `AppRuntimeRegistry` has bound the manager. Passing `null` clears the
	 * binding (used on plugin unload / reload).
	 */
	setMcpClientManager(manager: MCPClientManager | null): void {
		this.mcpClientManager = manager;
	}

	/**
	 * Wire the MediaGenerationService (D1 §R1). Called from `main.ts`
	 * after `composeMediaGenerationService()` builds the concrete
	 * service. `null` clears the binding (hot-reload). This is the ONLY
	 * runtime the Chat tool builder consults for `media_generate`.
	 */
	setMediaGenerationService(service: MediaGenerationService | null): void {
		this.mediaGenerationService = service;
	}

	getMediaGenerationService(): MediaGenerationService | null {
		return this.mediaGenerationService;
	}

	/**
	 * Zero-gap Track D (2026-07-21): wire the app-owned ArtifactProducerService
	 * so the Chat tool builder can register `artifact_create`. Same discipline
	 * as `setMediaGenerationService`: constructor-injected at app boot; no
	 * service-side singleton.
	 */
	setArtifactProducer(service: ArtifactProducerService | null): void {
		this.artifactProducer = service;
	}

	getArtifactProducer(): ArtifactProducerService | null {
		return this.artifactProducer;
	}

	/**
	 * Zero-gap Track C1 (2026-07-21): wire the app-owned media understanding
	 * runtime. Composer / upload path both call `getMediaUnderstandingRuntime()`
	 * to decide whether audio/video attachments become real understanding
	 * or degrade honestly to "attachment saved but not understood".
	 */
	setMediaUnderstandingRuntime(runtime: MediaUnderstandingRuntime | null): void {
		this.mediaUnderstandingRuntime = runtime;
	}

	getMediaUnderstandingRuntime(): MediaUnderstandingRuntime | null {
		return this.mediaUnderstandingRuntime;
	}

	/**
	 * Bind an unsaved assistant draft to a conversation for try-before-save
	 * preview (Assistant Builder Preview, 2026-07-21). The resolver will pick
	 * this up on the next turn without consulting the persistent
	 * `AssistantService`, so the draft's instructions / toolPolicy /
	 * knowledgeRefs / preferredModel take effect immediately. Pass `null` to
	 * clear the override and fall back to the persisted assistantId.
	 *
	 * Ephemeral state is intentionally in-memory only — reload / plugin
	 * unload wipes the map. Save-in-builder clears the override and writes
	 * through to durable storage in one step.
	 */
	setEphemeralAssistant(
		conversationId: string,
		definition: ChatAssistantDefinition | null,
	): void {
		this.ephemeralAssistants.set(conversationId, definition);
	}

	/** Return the ephemeral override for a conversation, or null when none. */
	getEphemeralAssistant(conversationId: string): ChatAssistantDefinition | null {
		return this.ephemeralAssistants.get(conversationId);
	}

	/**
	 * Bind the runtime permission-ask resolver (B1 §5.2 R4). The Chat UI
	 * layer (useStreamChat) supplies a function that pops the inline
	 * confirmation card, awaits the user's allow/deny click, and returns
	 * the corresponding decision. `null` clears the binding (used across
	 * hot reloads).
	 */
	setPermissionAskResolver(
		resolver:
			| ((request: PermissionAskRequest) => Promise<PermissionAskResolution> | PermissionAskResolution)
			| null,
	): void {
		this.permissionAskResolver = resolver;
	}

	/**
	 * Availability snapshot for the current chat context (plan §5.2 R1). Pure
	 * read: does not build ToolDefs, does not touch the harness. Composer /
	 * Sources popover / error UI can call this to render the same state
	 * machine the Chat runtime uses. Availability is composed from live UI
	 * toggles + wired ports + connected MCP servers — everything else lands
	 * as `unconfigured` / `unsupported` / `disconnected`.
	 */
	getToolAvailability(input: {
		enableVaultSearch: boolean;
		enableWebSearch: boolean;
		vaultScopeFolder?: string;
	}): ToolAvailability[] {
		return resolveToolAvailability({
			enableVaultSearch: input.enableVaultSearch,
			enableWebSearch: input.enableWebSearch,
			vaultRetrieval: this.vaultRetrievalPort,
			profileRegistry: ProfileRegistry.getInstance(),
			mcpClientManager: this.mcpClientManager,
			mediaGenerationProbe: this.mediaGenerationService
				? mediaGenerationServiceAsProbe(() => this.mediaGenerationService)
				: null,
		});
	}

	/**
	 * The runId of the most recent chat turn's debug trace (if enabled and a
	 * turn completed). UI surfaces reach for this when the user clicks
	 * "Copy debug trace" on the latest assistant message.
	 */
	getLastDebugRunId(): string | null {
		return this.lastDebugRunId;
	}

	/**
	 * Read the span-level diagnostic trace for a specific assistant turn.
	 *
	 * The recorder is intentionally in-memory and retention-bounded, so callers
	 * must treat an absent run as a normal "trace expired / tracing disabled"
	 * state. Keeping this lookup on ConversationService preserves the app-owned
	 * DebugTracePort boundary instead of letting React reach into the recorder.
	 */
	getDebugRun(runId: string): DebugRun | undefined {
		return this.debugTracePort?.getRun(runId);
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
		/**
		 * Branch lineage (chat-studio §7.7). When provided by
		 * `branchFromMessage`, persists a parent link so the UI can render a
		 * "Branched from …" chip and jump back to the source turn.
		 */
		parentConversationId?: string;
		parentMessageId?: string;
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
			parentConversationId: params.parentConversationId,
			parentMessageId: params.parentMessageId,
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

	/**
	 * Chat turn stream. Drives the unified Harness `runAgentLoop` (A3,
	 * plan §5.1). Yields UI-shaped `LLMStreamEvent`s; the terminal
	 * `HarnessChatStreamResult` (runId + status + totals) is delivered as
	 * the generator's return value so callers can persist a run-scoped
	 * `TurnExecutionReceipt`.
	 */
	streamChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
		/** Per-turn actual-source receipt accumulator (chat-studio RUN-02). */
		receipts?: SourceReceiptCollector;
		/**
		 * A3: propagate the caller's abort signal all the way to the
		 * provider fetch. When aborted mid-stream the loop settles with
		 * status='cancelled'; the receipt distinguishes cancel vs timeout
		 * at the useChatSubmit layer using `AbortSignal.reason`.
		 */
		abortSignal?: AbortSignal;
		/**
		 * B1 §5.2 R4: per-turn permission-ask resolver. Chat UI supplies
		 * this so an ask event pops the inline confirmation card and
		 * awaits the user's allow/deny click. Overrides any long-lived
		 * resolver bound via `setPermissionAskResolver`. Absent → ask
		 * decisions fall back to deny (safe default).
		 */
		resolvePermissionAsk?: (
			request: PermissionAskRequest,
		) => Promise<PermissionAskResolution> | PermissionAskResolution;
		/**
		 * D1 §R2: assistant message id the caller (Chat UI) has already
		 * generated for the streaming bubble. Threaded into every ToolDef
		 * closure (e.g. `media_generate`) so persisted receipts anchor to
		 * the same message the UI renders. Absent → tool receipts still
		 * persist but with an empty messageId (matches command-mode
		 * fallback) and would not appear inside the message thread.
		 */
		assistantMessageId?: string;
		/**
		 * Zero-gap Track D (2026-07-21): per-turn receipt observer. Chat UI
		 * supplies this so every ChatArtifactReceipt produced by tools this
		 * turn (media_generate, artifact_create) is collected in-order and
		 * finalized into TurnExecutionReceipt.artifactIds when the stream
		 * completes. Absent → no accumulation; the receipt still persists
		 * through its own sink but the turn receipt shows artifactIds:[].
		 */
		onArtifactReceipt?: (receipt: ChatArtifactReceipt) => void;
	}): AsyncGenerator<LLMStreamEvent, ChatStreamTurnResult | undefined, void> {
		const self = this;
		if (params.project && params.receipts) params.receipts.markProjectIncluded();
		return (async function* (): AsyncGenerator<LLMStreamEvent, ChatStreamTurnResult | undefined, void> {
			// 2026-07 F.B follow-up (Debt-2): `/plan ` prefix opts a single message
			// into planning mode without touching the persisted conversationType or
			// the runtime chatMode. The prefix is stripped before the message
			// reaches the LLM. Users get planning UX ("please think about it as a
			// plan, list steps, surface uncertainty") without a routing branch.
			const planIntent = detectPlanIntent(params.userContent);
			const effectiveParams = planIntent
				? { ...params, userContent: stripPlanPrefix(params.userContent) }
				: params;
			// B2 (plan §5.3.1): resolve the bound assistant ONCE per turn.
			// Downstream consumers (context slot, tool-policy filter,
			// permission rules, effective-model chain, receipt) all read
			// this single snapshot instead of re-querying AssistantService.
			// Failures degrade to Default (null) — never break a turn.
			// 2026-07-21: Assistant Builder Preview — an in-memory ephemeral
			// override wins over the persisted binding, so the draft's
			// instructions / toolPolicy / knowledgeRefs / preferredModel
			// take effect for this turn without persisting.
			const ephemeralDraft = self.ephemeralAssistants.get(
				effectiveParams.conversation.meta.id,
			) ?? null;
			const resolvedAssistant: ResolvedAssistant | null = ephemeralDraft
				? {
					definition: ephemeralDraft,
					knowledgeRefs: ephemeralDraft.knowledgeRefs ?? [],
					toolPolicy: ephemeralDraft.toolPolicy,
					preferredModel: ephemeralDraft.preferredModel,
				}
				: await resolveAssistantForConversation(
					self.aiServiceManager.assistant,
					effectiveParams.conversation,
				);
			const preparationGenerator = self.prepareChatRequest({
				...effectiveParams,
				resolvedAssistant,
			});
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

			// B2 (plan §5.3.5): the effective-model resolver in
			// prepareChatRequest already picked provider/modelId per the
			// precedence chain. When it also resolved a concrete profileId
			// (fixed selection OR assistant-preferred OR active Chat auto),
			// use that profile directly instead of re-inferring by provider
			// kind — the assistant author may have picked a specific profile
			// (e.g. one of two openai profiles with different keys), and
			// scanning by kind would grab the wrong one.
			const registry = ProfileRegistry.getInstance();
			const convProvider = prepared.provider;
			const convModelId = prepared.modelId;
			const chatConfig = registry.getActiveChatConfig();
			let profile = prepared.modelResolution.profileId
				? registry.getProfileById(prepared.modelResolution.profileId)
				: null;
			if (!profile || profile.enabled === false) {
				profile = chatConfig?.profile.kind === convProvider
					? chatConfig.profile
					: registry.getAllProfiles().find(p => p.kind === convProvider && p.enabled !== false && p.apiKey)
						?? null;
			}

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
			// A3: budget + step counts flow in from
			// `templates/config/chat-runtime.json` — no more hardcoded 3/1.
			const runtimeConfig = await loadChatRuntimeConfig();
			// Zero-gap §4 A1 — precompute the set of receipt ids the user has
			// already surfaced in this conversation. Any id the model tries
			// to use that is NOT in this set (or is a random vault path we
			// cannot verify) is rejected inside the media_generate tool.
			// Vault paths are accepted when they end in an allowed image
			// extension (`MediaReferenceResolver` validates MIME later).
			const allowedReceiptIds = new Set<string>();
			try {
				const receipts = await self.storage.listArtifactReceiptsByConversation(
					params.conversation.meta.id,
				);
				for (const r of receipts) allowedReceiptIds.add(r.artifactId);
			} catch {
				/* on failure, receipt path stays empty — vault path still works */
			}
			const strategyRaw = resolveChatExecutionStrategy({
				planIntent,
				legacyConversationTypeKind: params.conversation.meta.conversationType?.kind ?? null,
				toolDeps: {
					app: self.app,
					pluginId: self.pluginId,
					enableWebSearch: self.chatState.isWebSearchEnabled(),
					enableVaultSearch: self.chatState.isVaultSearchEnabled(),
					vaultRetrieval: self.vaultRetrievalPort,
					vaultScopeFolder: params.conversation.meta.focusFolder,
					receipts: params.receipts,
					resolveAllowedMediaReference: (id: string) => {
						if (!id || typeof id !== 'string') return null;
						if (allowedReceiptIds.has(id)) {
							return { sourceType: 'receipt', ref: id };
						}
						// Vault path: only accept known image extensions so a
						// stray text file cannot be handed to a paid endpoint.
						const ext = (id.split('.').pop() ?? '').toLowerCase();
						if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
							return { sourceType: 'vault', ref: id };
						}
						return null;
					},
					// B1 §5.2 R3: MCP tools flow into the same tool set as
					// vault/web. The Chat AgentLoop treats them exactly like
					// any other ToolDef; PermissionGuard gates them because
					// the adapter marks them `kind:'edit'`.
					mcpClientManager: self.mcpClientManager,
					// D1 §R1/R2: expose the app-owned MediaGenerationService
					// + its sync availability probe so `media_generate` can
					// register as a real Chat tool with truthful anchors.
					mediaGenerationService: self.mediaGenerationService,
					mediaGenerationProbe: self.mediaGenerationService
						? mediaGenerationServiceAsProbe(() => self.mediaGenerationService)
						: null,
					// Zero-gap Track D (2026-07-21): expose the app-owned
					// ArtifactProducerService + turn-scoped receipt observer
					// so `artifact_create` is a real Chat tool and every
					// receipt lands in TurnExecutionReceipt.artifactIds.
					artifactProducer: self.artifactProducer,
					onArtifactReceipt: params.onArtifactReceipt,
					conversationId: params.conversation.meta.id,
					assistantMessageId: params.assistantMessageId,
					projectId: params.conversation.meta.projectId,
				},
				modelCapabilities: prepared.modelCapabilities,
				runtimeConfig,
			});
			// B2 (plan §5.3.4): apply Assistant toolPolicy on top of the B1
			// availability output. Deny wins unconditionally and removes the
			// ToolDef from the list; allow becomes a PermissionGuard rule so
			// the ask path is silent for whitelisted tools; approval maps to
			// the guard's mode.
			const strategy = {
				...strategyRaw,
				tools: filterToolsByAssistantPolicy(
					strategyRaw.tools,
					prepared.resolvedAssistant?.toolPolicy,
				),
			};

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
					toolCount: strategy.tools.length,
					toolNames: strategy.tools.map((t) => t.name),
					maxSteps: strategy.maxSteps,
					// outputControl carries user-visible knobs (temperature,
					// maxTokens...) — dump keys only so we don't leak values
					// the user may have customised in a sensitive way.
					outputControlKeys: prepared.outputControl
						? Object.keys(prepared.outputControl)
						: [],
					// B2 (plan §5.3): honesty about which assistant + which
					// step of the model precedence chain served this turn.
					assistantId: prepared.resolvedAssistant?.definition.id,
					assistantName: prepared.resolvedAssistant?.definition.name,
					modelSource: prepared.modelResolution.source,
					routeReason: prepared.modelResolution.routeReason,
					requiredCapabilities: prepared.modelResolution.requiredCapabilities,
					assistantPreferredUnavailable:
						prepared.modelResolution.assistantPreferredUnavailable === true,
					assistantToolPolicyDeny:
						prepared.resolvedAssistant?.toolPolicy.deny ?? [],
					assistantToolPolicyAllow:
						prepared.resolvedAssistant?.toolPolicy.allow ?? [],
					assistantToolPolicyApproval:
						prepared.resolvedAssistant?.toolPolicy.approval,
				});
			}

			// A3: single unified runId across debug run + AgentLoop + turn
			// receipt (§5.1 R2). Prefer the debug run's id when tracing is
			// enabled so `Copy trace` continues to work; otherwise mint a
			// fresh uuid so the receipt's `runId` field is never empty.
			const runId = prepared.debugRun?.runId ?? generateUuidWithoutHyphens();

			// A3: drive the unified Harness runtime. `harnessStreamChat`
			// yields UI-shaped LLMStreamEvents (text/tool/complete/error) so
			// useStreamChat's existing consumer needs no shape change. The
			// terminal `HarnessChatStreamResult` is delivered as the inner
			// generator's return value; we surface it through our own return
			// so useChatSubmit can persist runId + status on the receipt.
			// B1 §5.2 R4 + B2 §5.3.4: PermissionGuard mode + rules come from
			// the Assistant toolPolicy (or the pre-B2 `ask` default when no
			// assistant is bound). Deny rules ship even though the ToolDef
			// list is already filtered — defense in depth against a prompt-
			// injection scenario where a denied tool name reappears mid-run
			// (see PermissionGuard §3.7 deny-first invariant).
			const assistantToolPolicy = prepared.resolvedAssistant?.toolPolicy ?? null;
			const permission = new PermissionGuard({
				mode: resolveAssistantPermissionMode(assistantToolPolicy),
				rules: buildAssistantPermissionRules(assistantToolPolicy),
			});
			const harnessGen = harnessStreamChat({
				profile,
				modelId: convModelId || profile.primaryModel,
				messages: prepared.prompt,
				tools: strategy.tools,
				loopId: runId,
				budget: {
					maxSteps: strategy.maxSteps,
					maxTokens: runtimeConfig.budget.maxTokens,
					maxToolCalls: runtimeConfig.budget.maxToolCalls,
				},
				outputControl: prepared.outputControl,
				abortSignal: params.abortSignal,
				permission,
				resolvePermissionAsk:
					params.resolvePermissionAsk ?? self.permissionAskResolver ?? undefined,
			});

			let lastFinishReason: string | undefined;
			let lastUsage: LLMUsage | undefined;
			let assistantTextLength = 0;
			let harnessResult: HarnessChatStreamResult | undefined;
			try {
				// Manually iterate so we can capture the AgentLoop's return
				// value (runId / status / totals) after the last yield.
				let step: IteratorResult<LLMStreamEvent, HarnessChatStreamResult>;
				while (!(step = await harnessGen.next()).done) {
					const evt = step.value;
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
				harnessResult = step.value;
				if (prepared.debugRun) {
					prepared.debugRun.mergeSummary({
						assistantTextLength,
						...(lastFinishReason ? { finishReason: lastFinishReason } : {}),
						...(lastUsage?.totalTokens !== undefined
							? { totalTokens: lastUsage.totalTokens }
							: {}),
						...(lastUsage?.inputTokens !== undefined
							? { promptTokens: lastUsage.inputTokens }
							: {}),
						...(lastUsage?.outputTokens !== undefined
							? { completionTokens: lastUsage.outputTokens }
							: {}),
						...(harnessResult
							? {
									harnessStatus: harnessResult.status,
									harnessFinishReason: harnessResult.finishReason,
									totalToolCalls: harnessResult.totalToolCalls,
								}
							: {}),
					});
					prepared.debugRun.finish(
						harnessResult?.status === 'failed'
							? 'failed'
							: harnessResult?.status === 'cancelled'
								? 'cancelled'
								: 'completed',
					);
				}
				if (!harnessResult) return undefined;
				return {
					...harnessResult,
					// B2 (plan §5.3.5): honest effectiveModel + resolution
					// source. useChatSubmit uses this to write the receipt
					// instead of guessing from conversation.meta.
					effectiveModel: {
						provider: prepared.provider,
						modelId: prepared.modelId,
						profileId: prepared.modelResolution.profileId || undefined,
					},
					assistantId: prepared.resolvedAssistant?.definition.id,
					modelSource: prepared.modelResolution.source,
					...(prepared.modelResolution.routeReason
						? { routeReason: prepared.modelResolution.routeReason }
						: {}),
					...(prepared.modelResolution.requiredCapabilities
						? { requiredCapabilities: prepared.modelResolution.requiredCapabilities }
						: {}),
					...(prepared.modelResolution.assistantPreferredUnavailable
						? { assistantPreferredUnavailable: true }
						: {}),
				};
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
		receipts?: SourceReceiptCollector;
		resolvedAssistant?: ResolvedAssistant | null;
	}): AsyncGenerator<LLMStreamEvent, ChatPreparationResult, void> {
		const { conversation, project, userContent, receipts } = params;
		const resolvedAssistant = params.resolvedAssistant ?? null;
		// B2 (plan §5.3.5): apply the model precedence chain BEFORE resolving
		// capabilities so the correct catalog entry lands in modelCapabilities
		// and the debug run summary records the effective model.
		//   1. conversation.modelSelection (mode='fixed')
		//   2. assistant.preferredModel
		//   3. Auto default = active Chat profile → settings.defaultModel
		const conversationSelection = conversation.meta.modelSelection;
		const profileRegistry = ProfileRegistry.getInstance();
		let modelResolution = resolveEffectiveModel({
			fixedSelection:
				conversationSelection?.mode === 'fixed'
					? {
							profileId: conversationSelection.profileId,
							modelId: conversationSelection.modelId,
							provider: conversation.meta.activeProvider,
						}
					: null,
			legacyActive: {
				modelId: conversation.meta.activeModel || undefined,
				provider: conversation.meta.activeProvider || undefined,
			},
			assistantPreferred: resolvedAssistant?.preferredModel ?? null,
			defaultModel: this.defaultModel,
			profileRegistry,
		});

		// COMP-05 (chat-studio §8.5, 2026-07-21): the conversation is explicitly
		// Auto. resolveEffectiveModel already honored a resolvable
		// assistant.preferredModel; anything that landed on `auto-default` here
		// means the runtime must ACTUALLY pick a model based on this turn's
		// signals — not fall through to `settings.defaultModel`. Route it. If
		// routing yields zero candidates surface a hard error so the UI shows
		// an actionable configuration problem instead of silently misrouting.
		//
		// Fixed selections and assistant-preferred selections are honored
		// unchanged (this branch is skipped when the selection was fixed).
		if (
			conversationSelection?.mode === 'auto' &&
			modelResolution.source === 'auto-default'
		) {
			const signals: AutoRoutingSignals = deriveAutoRoutingSignals({
				conversation,
				resolvedAssistant,
				userAttachments: params.attachments,
				chatState: this.chatState,
				vaultAvailable: this.vaultRetrievalPort !== null,
				webSearchProfilePresent: profileRegistry.getActiveWebSearchProfile() !== null,
			});
			const routingConfig = await loadModelRoutingConfig();
			const outcome = routeAutoModel({
				profiles: profileRegistry.getAllProfiles(),
				signals,
				config: routingConfig,
			});
			if (outcome.ok) {
				modelResolution = {
					modelId: outcome.value.modelId,
					provider: outcome.value.profileKind,
					profileId: outcome.value.profileId,
					source: 'auto-routed',
					routeReason: outcome.value.routeReason,
					requiredCapabilities: outcome.value.requiredCapabilities,
					...(modelResolution.assistantPreferredUnavailable
						? { assistantPreferredUnavailable: true }
						: {}),
				};
			} else {
				// Hard configuration error — do NOT silently pick a random
				// model. Chat UI turns this into an inline banner (Composer
				// error card) so the user knows exactly what to configure.
				throw new Error(
					`[modelRouter] ${outcome.error.message}`,
				);
			}
		}

		const modelId = modelResolution.modelId || this.defaultModel.modelId;
		const provider = modelResolution.provider || this.defaultModel.provider;

		// B2 (plan §5.3.3): fold assistant knowledgeRefs into the same
		// explicit-ref/attachment pipe the Composer already uses. `vault-file`
		// and `url` kinds convert to attachment strings; folder kind is dropped
		// with a warning (no bulk loader today). Missing vault files are
		// skipped and recorded so the receipt reflects what really made it in.
		const attachments = mergeAssistantKnowledgeRefs({
			userAttachments: params.attachments,
			resolvedAssistant,
			app: this.app,
			receipts,
		});

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

		// Build prompt from context and user input. MSG-08: retry produces
		// alternative variants of the same assistant answer; only the active
		// variant participates in the LLM-visible history so retried siblings
		// never double-appear in the prompt.
		const historyMessage = [...filterActiveVariants(conversation.messages), originalUserMessage];
		const buildCtx = {
			sessionContext: SessionContextService.getInstance(),
			conversation,
			project: project ?? undefined,
			messages: historyMessage,
			app: this.app,
			modelCapabilities,
			attachmentHandlingMode,
			// B2 (plan §5.3.2): expose the resolved assistant to AssistantSlot
			// (and any future slot that wants to read persona metadata) via
			// the SlotBuildContext instead of a service singleton.
			resolvedAssistant,
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
				resolvedAssistant,
				modelResolution,
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

	/**
	 * Persist the explicit ModelSelection (chat-studio §8.5 / RUN gate 2).
	 * `auto` clears the legacy concrete-model mirror so a reload cannot
	 * misread the conversation as fixed; `fixed` mirrors modelId/provider into
	 * the legacy columns for backward compatibility with old readers.
	 */
	async updateConversationModelSelection(params: {
		conversationId: string;
		selection: ModelSelection;
		/** provider kind for the legacy mirror when selection is fixed */
		legacyProvider?: string;
	}): Promise<void> {
		const sel = params.selection;
		await this.storage.upsertConversationMeta(params.conversationId, {
			modelSelection: sel,
			activeModel: sel.mode === 'fixed' ? sel.modelId : '',
			activeProvider: sel.mode === 'fixed' ? (params.legacyProvider ?? sel.profileId) : '',
			updatedAtTimestamp: Date.now(),
		});
	}

	/** Persist the conversation-level Assistant binding (chat-studio §8.6). */
	async updateConversationAssistant(params: {
		conversationId: string;
		assistantId?: string;
	}): Promise<void> {
		await this.storage.upsertConversationMeta(params.conversationId, {
			assistantId: params.assistantId || undefined,
			updatedAtTimestamp: Date.now(),
		});
		const updatedConversation = await this.storage.readConversation(params.conversationId, false);
		if (updatedConversation) {
			EventBus.getInstance(this.app).dispatch(new ConversationUpdatedEvent({ conversation: updatedConversation }));
		}
	}

	/** Pin/unpin a conversation in the left column (chat-studio §6.3). */
	async setConversationPinned(conversationId: string, pinned: boolean): Promise<void> {
		await this.storage.setConversationPinned(conversationId, pinned);
		const updatedConversation = await this.storage.readConversation(conversationId, false);
		if (updatedConversation) {
			EventBus.getInstance(this.app).dispatch(new ConversationUpdatedEvent({ conversation: updatedConversation }));
		}
	}

	/** Archive/restore a conversation (file stays in place; hidden from lists). */
	async setConversationArchived(conversationId: string, archived: boolean): Promise<void> {
		await this.storage.setConversationArchived(conversationId, archived);
		const updatedConversation = await this.storage.readConversation(conversationId, false);
		if (updatedConversation) {
			EventBus.getInstance(this.app).dispatch(new ConversationUpdatedEvent({ conversation: updatedConversation }));
		}
	}

	/** Fast meta-only recent conversation listing across all projects. */
	async listRecentConversationMetas(limit?: number): Promise<ChatConversationMeta[]> {
		return this.storage.listRecentConversationMetas(limit);
	}

	// Turn receipts (chat-studio §12.1) ---------------------------------------

	async saveTurnReceipt(receipt: TurnExecutionReceipt): Promise<void> {
		await this.storage.saveTurnReceipt(receipt);
	}

	async readTurnReceiptByMessage(messageId: string): Promise<TurnExecutionReceipt | null> {
		return this.storage.readTurnReceiptByMessage(messageId);
	}

	async listTurnReceipts(conversationId: string): Promise<TurnExecutionReceipt[]> {
		return this.storage.listTurnReceipts(conversationId);
	}

	// Artifact receipts (chat-studio §12.2) ------------------------------------

	async saveArtifactReceipt(receipt: ChatArtifactReceipt): Promise<void> {
		await this.storage.saveArtifactReceipt(receipt);
	}

	async listArtifactReceiptsByMessage(messageId: string): Promise<ChatArtifactReceipt[]> {
		return this.storage.listArtifactReceiptsByMessage(messageId);
	}

	async listArtifactReceiptsByConversation(conversationId: string): Promise<ChatArtifactReceipt[]> {
		return this.storage.listArtifactReceiptsByConversation(conversationId);
	}

	async listArtifactReceiptsByProject(projectId: string): Promise<ChatArtifactReceipt[]> {
		return this.storage.listArtifactReceiptsByProject(projectId);
	}

	/** Zero-gap Track D (2026-07-21): kind-scoped receipts (used by the reminder scheduler). */
	async listArtifactReceiptsByKind(kind: string): Promise<ChatArtifactReceipt[]> {
		return this.storage.listArtifactReceiptsByKind(kind);
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

		// Copy all messages up to and including the target message. Every
		// message gets a fresh id so the branch evolves independently — but
		// we tag the FIRST message with `branchFromMessageId` = the source
		// message it was branched from. UI can render "Branched from …" on
		// that anchor and jump back to the parent conversation. Variant
		// bookkeeping is stripped from copies (a branch starts a fresh
		// timeline; the parent's variant history stays on the parent).
		const sourceMessages = sourceConversation.messages.slice(0, messageIndex + 1);
		const branchedMessages: ChatMessage[] = sourceMessages.map((m, index) => {
			const cloned: ChatMessage = {
				...m,
				id: generateUuidWithoutHyphens(),
				variantGroupId: undefined,
				variantIndex: undefined,
				isActiveVariant: undefined,
			};
			if (index === sourceMessages.length - 1) {
				cloned.branchFromMessageId = messageId;
			}
			return cloned;
		});

		const branchTitle = `Branch: ${sourceConversation.meta.title}`;

		return this.createConversation({
			title: branchTitle,
			project,
			initialMessages: branchedMessages,
			modelId: sourceConversation.meta.activeModel,
			provider: sourceConversation.meta.activeProvider,
			conversationType: sourceConversation.meta.conversationType,
			parentConversationId: sourceConversation.meta.id,
			parentMessageId: messageId,
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

	/**
	 * Prepare a retry-as-variant sibling for an existing assistant message
	 * (chat-studio §7.7 — MSG-08). Marks the old assistant answer as an
	 * inactive variant, retro-assigning a `variantGroupId` if this is the
	 * first retry, and returns the `variantGroupId` + next `variantIndex`
	 * the caller must stamp onto the freshly streamed assistant message
	 * BEFORE persisting it via `addMessage`.
	 *
	 * UI (`useStreamChat`) drives the stream; this method owns the storage
	 * side of the variant bookkeeping so the invariant "exactly one active
	 * variant per group" is enforced in one place.
	 */
	async prepareRetryVariant(params: {
		conversationId: string;
		previousAssistantMessageId: string;
	}): Promise<{ variantGroupId: string; variantIndex: number }> {
		const { conversationId, previousAssistantMessageId } = params;
		const conversation = await this.storage.readConversation(conversationId, true);
		if (!conversation) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}
		const plan = planRetryVariant(
			conversation.messages,
			previousAssistantMessageId,
			() => generateUuidWithoutHyphens(),
		);
		// Persist every group member's flipped state so the invariant survives
		// a reload. In the common "first retry" case only one previous row
		// needs an update, but a re-retry may touch several.
		for (const m of plan.updatedMessages) {
			if (m.variantGroupId !== plan.newVariantFields.variantGroupId) continue;
			await this.storage.updateMessageVariantMeta(m.id, {
				variantGroupId: m.variantGroupId,
				variantIndex: m.variantIndex,
				isActiveVariant: m.isActiveVariant,
			});
		}
		return {
			variantGroupId: plan.newVariantFields.variantGroupId,
			variantIndex: plan.newVariantFields.variantIndex,
		};
	}

	/**
	 * Switch which variant is active inside a group (chat-studio §7.7 —
	 * MSG-08). Persists the flip to sqlite so the LLM history assembly and
	 * the reload path both see the same active-variant path.
	 */
	async setActiveVariant(params: {
		conversationId: string;
		variantGroupId: string;
		activeMessageId: string;
	}): Promise<void> {
		const { conversationId, variantGroupId, activeMessageId } = params;
		const conversation = await this.storage.readConversation(conversationId, true);
		if (!conversation) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}
		for (const m of conversation.messages) {
			if (m.variantGroupId !== variantGroupId) continue;
			const nextActive = m.id === activeMessageId;
			if (m.isActiveVariant === nextActive) continue;
			await this.storage.updateMessageVariantMeta(m.id, {
				variantGroupId: m.variantGroupId,
				variantIndex: m.variantIndex,
				isActiveVariant: nextActive,
			});
		}
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
			// MSG-08: title generation is an LLM call — apply the active-
			// variant filter so retried siblings do not double-appear in the
			// prompt and skew the title toward the discarded answer.
			const activeMessages = filterActiveVariants(messages);
			const messagesForPrompt = activeMessages.slice(0, 5).map((m) => ({ role: m.role, content: m.content }));
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

		// MSG-08: summarisation is an LLM call — feed only the active-
		// variant history so a discarded retry sibling does not skew the
		// short/full summary written back onto the conversation.
		const activeMessages = filterActiveVariants(messages);
		const recent = activeMessages.slice(-10);
		if (recent.length === 0) {
			return {
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow: [],
				shortSummary: DEFAULT_SUMMARY,
			};
		}
		const recentMessagesWindow = [{ fromMessageId: recent[0].id, toMessageId: recent[recent.length - 1].id }];

		try {
			const messagesForSummary = recent.map((m) => ({ role: m.role, content: m.content }));
			const projectContext = project
				? `Project: ${project.meta.name}${project.context?.shortSummary ? `\n${project.context.shortSummary}` : ''}`
				: undefined;

			const shortSummary = await this.promptService.chatWithPrompt(
				PromptId.ConversationSummaryShort, { messages: messagesForSummary, projectContext },
			) || DEFAULT_SUMMARY;

			const fullSummary = activeMessages.length > 5
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

		// Zero-gap C1 — audio / video attachments route through the media
		// understanding runtime FIRST. When we can produce a transcript the
		// text becomes the fullSummary directly (nothing else knows how to
		// turn `.mp3`/`.mp4` into content the LLM will read). When we can't
		// we fall back to the generic loader so the user still sees a
		// filename entry, and we stamp `understandingSource='attachment-only'`
		// so the UI can flag it.
		const kind = classifyUnderstandingKind(sourcePath);
		if ((kind === 'audio' || kind === 'video') && this.mediaUnderstandingRuntime) {
			const runtime = this.mediaUnderstandingRuntime;
			try {
				const bytes = await this.readAttachmentBytes(sourcePath);
				const mimeType = guessMimeByExt(sourcePath) ?? (kind === 'audio' ? 'audio/mpeg' : 'video/mp4');
				const outcome = await runtime.understand({
					bytes,
					mediaKind: kind,
					mimeType,
					filenameHint: sourcePath.split(/[\\/]/).pop(),
				});
				resourceRef.understandingSource = outcome.source;
				resourceRef.understandingProvider = outcome.provider;
				resourceRef.understandingModel = outcome.modelId;
				if (outcome.error) resourceRef.understandingReason = outcome.error;
				if (outcome.transcript) {
					await this.resourceSummaryService.saveResourceSummary({
						...base,
						shortSummary: `${kind} transcript (${outcome.provider}/${outcome.modelId}): ${truncateForShort(outcome.transcript)}`,
						fullSummary: outcome.transcript,
					});
					return;
				}
				if (outcome.source === 'native-video-input') {
					// Model will read the video directly; no summary text, but
					// record a placeholder so the summary service does not
					// re-run this decision on every turn.
					await this.resourceSummaryService.saveResourceSummary({
						...base,
						shortSummary: `Video sent directly to model (${resourceRef.source})`,
					});
					return;
				}
				// attachment-only — fall through to generic loader so the user
				// at least gets a "Resource: <path>" summary entry.
			} catch (err) {
				console.warn(`[ConversationService] Media understanding failed for ${sourcePath}:`, err);
				resourceRef.understandingSource = 'attachment-only';
				resourceRef.understandingReason = err instanceof Error ? err.message : String(err);
				// fall through
			}
		}

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

	/**
	 * Vault-binary read for the understanding runtime. Kept private so
	 * callers do not accidentally read arbitrary paths from disk. When the
	 * `app` handle doesn't expose the adapter (tests) we throw so the
	 * runtime falls back to `attachment-only`.
	 */
	private async readAttachmentBytes(vaultPath: string): Promise<Uint8Array> {
		const adapter = (this.app as any)?.vault?.adapter;
		if (!adapter || typeof adapter.readBinary !== 'function') {
			throw new Error('Vault adapter unavailable for binary read');
		}
		const buffer: ArrayBuffer = await adapter.readBinary(vaultPath);
		return new Uint8Array(buffer);
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

// ── Auto-model routing signal derivation ─────────────────────────────────────

/**
 * Classify an attachment path/uri by extension for Auto routing purposes.
 * Matches the extension lists used elsewhere (ImageDocumentLoader,
 * MediaReferenceResolver). Case-insensitive.
 */
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif']);
const PDF_EXTS = new Set(['pdf']);
// Zero-gap C1 — extensions the MediaUnderstandingRuntime knows how to route.
// `audio` extensions go straight to the transcription adapter; `video`
// extensions either ride the model's native video capability or fall back to
// the WebAudio extractor when the model can't.
const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'oga', 'opus']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi', 'ogv']);
const MIME_BY_EXT: Record<string, string> = {
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	m4a: 'audio/mp4',
	aac: 'audio/aac',
	ogg: 'audio/ogg',
	oga: 'audio/ogg',
	flac: 'audio/flac',
	opus: 'audio/ogg',
	mp4: 'video/mp4',
	mov: 'video/quicktime',
	webm: 'video/webm',
	mkv: 'video/x-matroska',
	m4v: 'video/mp4',
	avi: 'video/x-msvideo',
	ogv: 'video/ogg',
};

function extensionOf(pathOrUri: string): string {
	const dot = pathOrUri.lastIndexOf('.');
	if (dot < 0) return '';
	return pathOrUri.slice(dot + 1).toLowerCase().split(/[?#]/)[0];
}

/** Classify an attachment path by extension for understanding routing. */
export function classifyUnderstandingKind(pathOrUri: string): 'audio' | 'video' | 'other' {
	const ext = extensionOf(pathOrUri);
	if (AUDIO_EXTS.has(ext)) return 'audio';
	if (VIDEO_EXTS.has(ext)) return 'video';
	return 'other';
}

export function guessMimeByExt(pathOrUri: string): string | undefined {
	return MIME_BY_EXT[extensionOf(pathOrUri)];
}

const SHORT_SUMMARY_MAX_CHARS = 220;
function truncateForShort(text: string): string {
	const trimmed = text.trim().replace(/\s+/g, ' ');
	if (trimmed.length <= SHORT_SUMMARY_MAX_CHARS) return trimmed;
	return `${trimmed.slice(0, SHORT_SUMMARY_MAX_CHARS - 1)}…`;
}

function classifyAttachment(pathOrUri: string): 'image' | 'pdf' | 'other' {
	const dot = pathOrUri.lastIndexOf('.');
	if (dot < 0) return 'other';
	const ext = pathOrUri.slice(dot + 1).toLowerCase().split(/[?#]/)[0];
	if (IMAGE_EXTS.has(ext)) return 'image';
	if (PDF_EXTS.has(ext)) return 'pdf';
	return 'other';
}

/**
 * Turn per-turn context into the {@link AutoRoutingSignals} shape.
 *
 * "Tools needed" is intentionally coarse — if either search toggle is on or
 * MCP servers exist we assume the model may need `tools` capability. The
 * final tool set is decided later (execution-strategy), but Auto routing
 * happens BEFORE that so we use runtime toggles + wired ports as the
 * conservative proxy. A false positive here means Auto avoids no-tool
 * models on turns that could have used them; a false negative would send
 * the run to a no-tool model and break tool calls silently — worse tradeoff.
 */
function deriveAutoRoutingSignals(input: {
	conversation: ChatConversation;
	resolvedAssistant: ResolvedAssistant | null;
	userAttachments?: string[];
	chatState: ChatRuntimeStatePort;
	vaultAvailable: boolean;
	webSearchProfilePresent: boolean;
}): AutoRoutingSignals {
	let imageCount = 0;
	let pdfCount = 0;
	for (const uri of input.userAttachments ?? []) {
		const kind = classifyAttachment(uri);
		if (kind === 'image') imageCount++;
		else if (kind === 'pdf') pdfCount++;
	}
	// Assistant knowledgeRefs also enter the attachment pipe — count them too
	// so an Assistant that carries an image ref pushes Auto toward vision.
	for (const ref of input.resolvedAssistant?.knowledgeRefs ?? []) {
		if (ref.kind === 'vault-file' || ref.kind === 'url') {
			const kind = classifyAttachment(ref.uri);
			if (kind === 'image') imageCount++;
			else if (kind === 'pdf') pdfCount++;
		}
	}
	const vaultOn = input.chatState.isVaultSearchEnabled() && input.vaultAvailable;
	const webOn = input.chatState.isWebSearchEnabled() && input.webSearchProfilePresent;
	// MCP tools are gated separately at execution-strategy; treat any MCP
	// binding on the assistant policy allow list as a hint that tools are
	// needed. Empty deny/allow assistant policy means "default" — still let
	// vault/web toggles decide.
	const assistantWantsTools =
		(input.resolvedAssistant?.toolPolicy.allow.length ?? 0) > 0;
	const toolsNeeded = vaultOn || webOn || assistantWantsTools;
	// Rough input token estimate: recent history text lengths. We deliberately
	// don't pull the assembled prompt (that runs LATER in prepareChatRequest)
	// — the estimate is only for long-context tiering, not accuracy.
	let charBudget = 0;
	for (const m of input.conversation.messages.slice(-20)) {
		if (typeof m.content === 'string') charBudget += m.content.length;
	}
	// ~4 chars/token as a generic English-heavy proxy; +25% headroom for
	// system prompt / context slots that will land later.
	const estimatedInputTokens = Math.floor((charBudget / 4) * 1.25) || undefined;
	return {
		imageAttachmentCount: imageCount,
		pdfAttachmentCount: pdfCount,
		toolsNeeded,
		estimatedInputTokens,
		assistantPreferred: input.resolvedAssistant?.preferredModel ?? null,
	};
}
