/**
 * chatStudioStrings — typed defaults + TemplateManager loader for Chat Studio
 * (chat-studio §12.4).
 *
 * Source of truth: `templates/config/chat-studio.json` (editable without
 * recompiling). The JSON import is the compiled fallback so the UI renders
 * when the template manager is unavailable. Business logic must read labels,
 * starters, and density thresholds from here — never inline literals.
 */

import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';
import chatStudioDefaults from '../../../../templates/config/chat-studio.json';

export interface ChatStudioStarter {
	id: string;
	label: string;
	/** Text placed into the editable draft — starters never auto-send. */
	draft: string;
	/** Lucide icon key (config-driven). See STARTER_ICONS map in ChatStartState.tsx. */
	icon: string;
}

export interface ChatStudioComposerContextLayerStrings {
	title: string;
	description: string;
	source: string;
	reason: string;
	treatment: string;
}

export interface ChatStudioComposerContextStrings {
	compactExpandLabel: string;
	compactContextItemsTemplate: string;
	railTitle: string;
	railSummaryTemplate: string;
	railCountTemplate: string;
	popoverTitle: string;
	popoverSubtitle: string;
	nextMessageTab: string;
	lastReceiptTab: string;
	phaseExpected: string;
	phaseFrozen: string;
	phaseReceipt: string;
	metricsTemplate: string;
	autoBudget: string;
	technicalDetails: string;
	required: string;
	optional: string;
	included: string;
	empty: string;
	previewOnly: string;
	exactContent: string;
	notRecorded: string;
	requestScopeTitle: string;
	requestScopeSubtitle: string;
	requestScopeEmpty: string;
	contentPreview: string;
	openFullContent: string;
	closeDetailLabel: string;
	shownRangeTemplate: string;
	completeContent: string;
	backToStack: string;
	searchPlaceholder: string;
	searchIdle: string;
	searchResultsTemplate: string;
	wrap: string;
	unwrap: string;
	copyExact: string;
	copied: string;
	charactersTemplate: string;
	tokensTemplate: string;
	sourceLabel: string;
	whyIncludedLabel: string;
	budgetLabel: string;
	treatmentLabel: string;
	technicalTemplate: string;
	noReceipt: string;
	receiptTitle: string;
	receiptSubtitle: string;
	receiptStatus: string;
	receiptModel: string;
	receiptAssistant: string;
	receiptWorkflow: string;
	receiptRequestedSources: string;
	receiptActualSources: string;
	receiptArtifacts: string;
	receiptNone: string;
	receiptProject: string;
	receiptVault: string;
	receiptWeb: string;
	receiptExplicit: string;
	receiptSlotNotice: string;
	excludedTitle: string;
	excludedSubtitle: string;
	excludedVaultTitle: string;
	excludedVaultDetail: string;
	excludedWebTitle: string;
	excludedWebDetail: string;
	excludedVariantsTitle: string;
	excludedVariantsDetail: string;
	excludedBranchTitle: string;
	excludedBranchDetail: string;
	systemBaseNotice: string;
	customPromptLabel: string;
	focusFolderLabel: string;
	sourceScopeLabel: string;
	projectSourceLabel: string;
	vaultSourceLabel: string;
	webSourceLabel: string;
	explicitRefsLabel: string;
	activeFileLabel: string;
	workingThemeLabel: string;
	recentActivityLabel: string;
	projectDescriptionLabel: string;
	projectInstructionsLabel: string;
	projectSummaryLabel: string;
	conversationSummaryLabel: string;
	conversationTopicsLabel: string;
	userRoleLabel: string;
	assistantRoleLabel: string;
	analysisFallbackTitle: string;
	resourceFallbackTitle: string;
	emptyContent: string;
	requestProject: string;
	requestVault: string;
	requestWeb: string;
	requestExplicitRef: string;
	requestAttachment: string;
	requestDraft: string;
	requestAssistantKnowledge: string;
	assistantFrameTemplate: string;
	layers: {
		'system-prompt': ChatStudioComposerContextLayerStrings;
		assistant: ChatStudioComposerContextLayerStrings;
		'recent-messages': ChatStudioComposerContextLayerStrings;
		'working-context': ChatStudioComposerContextLayerStrings;
		'conv-summary': ChatStudioComposerContextLayerStrings;
		'activity-index': ChatStudioComposerContextLayerStrings;
		'user-profile': ChatStudioComposerContextLayerStrings;
		'prev-analysis': ChatStudioComposerContextLayerStrings;
		'resource-index': ChatStudioComposerContextLayerStrings;
	};
}

export interface ChatStudioStrings {
	greeting: {
		newChat: string;
		project: string;
		emptyThread: string;
		newChatSubtitle: string;
		projectSubtitle: string;
	};
	starters: {
		newChat: ChatStudioStarter[];
		project: ChatStudioStarter[];
	};
	leftColumn: {
		newChatLabel: string;
		searchVaultLabel: string;
		pinnedHeader: string;
		projectsHeader: string;
		recentHeader: string;
		viewAllLabel: string;
		groupToday: string;
		groupYesterday: string;
		groupThisWeek: string;
		groupEarlier: string;
		typeFilterAll: string;
		typeChat: string;
		typeAgent: string;
		typePlan: string;
		typeCanvas: string;
		typeTemplate: string;
		typeCustom: string;
		pickerPlaceholder: string;
		pickerEmpty: string;
		menuPin: string;
		menuUnpin: string;
		menuRename: string;
		menuMoveToProject: string;
		menuRemoveFromProject: string;
		menuOpenSource: string;
		menuArchive: string;
		menuRestore: string;
		menuDelete: string;
		menuNewConversation: string;
		menuOpenFolder: string;
		deleteConfirmTitle: string;
		deleteConfirmBody: string;
		deleteProjectConfirmTitle: string;
		deleteProjectConfirmBody: string;
		// Left-column visual-replication additions (2026-07-17)
		untitledLabel: string;
		seeMoreLabel: string;
		newProjectLabel: string;
		createProjectTitle: string;
		projectNamePlaceholder: string;
		createProjectHint: string;
		createProjectSubmit: string;
		conversationTitlePlaceholder: string;
		moveToProjectSuccessPrefix: string;
		moveFailedLabel: string;
		recentEmpty: string;
		rowMenuLabel: string;
		projectMenuLabel: string;
		/** aria-labels — the literal `{name}` is replaced in code. */
		ariaCollapseProject: string;
		ariaExpandProject: string;
		ariaOpenProject: string;
	};
	/** Shell chrome (drawer toggles + column resize handles). */
	shell: {
		openLeftDrawerLabel: string;
		closeLeftDrawerLabel: string;
		resizeLeftLabel: string;
		resizeRightLabel: string;
	};
	composer: {
		placeholder: string;
		openAIGraphsLabel: string;
		attachFilesLabel: string;
		attachFilesDescription: string;
		attachVaultDocLabel: string;
		attachVaultDocDescription: string;
		attachLinkLabel: string;
		attachLinkDescription: string;
		attachLinkPlaceholder: string;
		attachMenuLabel: string;
		generateImageLabel: string;
		generateImageDescription: string;
		generateImageUnavailableLabel: string;
		generateImagePromptPlaceholder: string;
		generateImageQuantityLabel: string;
		generateImageAspectRatioLabel: string;
		generateImageRouteLabel: string;
		generateImageRouteAutoOption: string;
		generateImageRouteNativeOption: string;
		generateImageRouteFalOption: string;
		generateImageCostHintPrefix: string;
		generateImageCostHintLoading: string;
		generateImageCostHintUnavailable: string;
		generateImageCostHintConfidenceEstimated: string;
		generateImageCostHintConfidenceReported: string;
		generateImageConfirmDisabledPreflightReason: string;
		/**
		 * E2 R1#2: pre-disclosure shown next to the Composer cost hint for
		 * video / music. Both kinds require an on-receipt cost gate before
		 * the provider is charged; telling the user *here* prevents the
		 * "wait, I clicked Send and now there's ANOTHER button?" surprise
		 * flagged by D2 concern 4.
		 */
		generateImageCostHintConfirmHintVideo: string;
		generateImageCostHintConfirmHintMusic: string;
		generateImageRouteNativeUnavailableReason: string;
		generateImageRouteFalUnavailableReason: string;
		/** Task E1 §R2 — Composer "+" menu Configure button label
		 *  (rendered next to the route select when a route is unavailable). */
		generateImageRouteConfigureLabel: string;
		generateImageInsertLabel: string;
		generateImageInsertTemplate: string;
		generateVideoLabel: string;
		generateVideoDescription: string;
		generateVideoUnavailableLabel: string;
		generateVideoUnavailableReason: string;
		generateVideoPromptPlaceholder: string;
		generateVideoInsertTemplate: string;
		generateMusicLabel: string;
		generateMusicDescription: string;
		generateMusicUnavailableLabel: string;
		generateMusicUnavailableReason: string;
		generateMusicPromptPlaceholder: string;
		generateMusicInsertTemplate: string;
		generateDurationLabel: string;
		/**
		 * Edit-image form (zero-gap §4 A1). Panel that lets the user pick a
		 * base image (+ optional additional refs and mask) from the current
		 * conversation and dispatch `MediaGenerationService.produce` with
		 * `operation:'edit'`. Refs are chosen from the user's own history —
		 * never inferred by the LLM.
		 */
		editImageLabel: string;
		editImageDescription: string;
		editImageUnavailableLabel: string;
		editImagePromptPlaceholder: string;
		editImageBaseSectionLabel: string;
		editImageMaskSectionLabel: string;
		editImagePresetLabel: string;
		editImagePresetDefaultOption: string;
		editImagePresetFillOption: string;
		editImagePresetNativeOption: string;
		editImagePresetFillDisabledReason: string;
		editImageMaskNoneOption: string;
		editImageNoImagesHint: string;
		editImageInsertLabel: string;
		editImageRunningLabel: string;
		editImageFailedNoticeTemplate: string;
		editImageSuccessNoticeTemplate: string;
		editImageBaseMissingReason: string;
		editImageAvailabilityReason: string;
		/** ArtifactReceiptCard image-kind extra action: prefill Edit form. */
		insertAsReferenceLabel: string;
		workflowPlanLabel: string;
		workflowPlanDescription: string;
		/**
		 * Generate document workflow — fills the Composer draft with a
		 * template that guides the model to produce a document note via
		 * `artifact_create` + Save-to-Vault (never auto-sends).
		 */
		generateDocumentLabel: string;
		generateDocumentDescription: string;
		generateDocumentDraftTemplate: string;
		/** Slash palette section headers (chat-studio §8.3): workflow vs generation actions. */
		slashGroupWorkflow: string;
		slashGroupGenerate: string;
		replyingToLabel: string;
		sourcesLabel: string;
		sourcesMenuTitle: string;
		sourcesSubtitle: string;
		sourceProject: string;
		sourceProjectDescription: string;
		sourceProjectAlways: string;
		sourceVault: string;
		sourceVaultDescription: string;
		sourceWeb: string;
		sourceWebDescription: string;
		sourceVaultUnavailable: string;
		sourceSummaryNone: string;
		modelAutoLabel: string;
		modelPickerTitle: string;
		modelPickerSubtitle: string;
		modelPickerPlaceholder: string;
		modelPickerEmpty: string;
		modelFilterToggle: string;
		modelFilterHeader: string;
		modelContextHeader: string;
		modelOutputHeader: string;
		modelFloorAll: string;
		modelClearFilters: string;
		modelUseAuto: string;
		modelUseAutoDescription: string;
		modelCapabilityNote: string;
		modelUnknownTag: string;
		capReasoning: string;
		capVision: string;
		capPdfInput: string;
		capTools: string;
		capWebSearch: string;
		capImageGeneration: string;
		capOutputPrefix: string;
		assistantDefaultLabel: string;
		assistantDefaultDescription: string;
		assistantPickerTitle: string;
		assistantPickerSubtitle: string;
		assistantPickerPlaceholder: string;
		assistantGroupDefault: string;
		assistantGroupSaved: string;
		assistantCreateLabel: string;
		assistantCreateDescription: string;
		assistantDraftHint: string;
		assistantDuplicate: string;
		assistantDeleteConfirm: string;
		/** Assistant chip label suffix / badge when an ephemeral preview is active. */
		assistantPreviewBadge: string;
		assistantPreviewClearLabel: string;
		workflowHeader: string;
		sendLabel: string;
		stopLabel: string;
		queuedHint: string;
		permissionAllowOnce: string;
		permissionAllowRun: string;
		permissionDeny: string;
		pickerLoading: string;
		pickerNoMatch: string;
	};
	composerContext: ChatStudioComposerContextStrings;
	/** Assistant builder modal (§8.6) — prompt placeholder, field labels, options. */
	assistantBuilder: {
		promptPlaceholder: string;
		fieldName: string;
		fieldSummary: string;
		fieldInstructions: string;
		fieldToolApproval: string;
		approvalAlways: string;
		approvalWrites: string;
		approvalNever: string;
		/** Advanced disclosure — collapsed by default; owns knowledge/tools/model fields. */
		advancedShowLabel: string;
		advancedHideLabel: string;
		advancedHelperText: string;
		fieldKnowledgeRefs: string;
		fieldKnowledgeRefsHelp: string;
		knowledgeRefsPlaceholder: string;
		fieldToolAllow: string;
		fieldToolAllowHelp: string;
		fieldToolDeny: string;
		fieldToolDenyHelp: string;
		toolPolicyPlaceholder: string;
		fieldPreferredProfile: string;
		fieldPreferredModel: string;
		preferredModelHelp: string;
		saveNotice: string;
		/** Preview-in-conversation controls (try-before-save). */
		previewLabel: string;
		previewHint: string;
		previewActiveBadge: string;
		previewClearLabel: string;
		previewRequiresConversation: string;
		previewRequiresName: string;
	};
	/** Project Plans tab (§9.1) — row menu + rename/new-plan modal copy. */
	projectPlans: {
		rowMenuLabel: string;
		rowRename: string;
		rowOpenSource: string;
		rowDelete: string;
		/** Destructive confirm — the literal `{name}` is replaced in code. */
		deleteConfirm: string;
		renameTitle: string;
		titlePlaceholder: string;
		renameSubmit: string;
		newPlanTitle: string;
		fieldTitleLabel: string;
		sourceConversation: string;
		sourceVault: string;
		fieldConversationLabel: string;
		conversationsEmptyOption: string;
		fieldVaultPathLabel: string;
		vaultPathPlaceholder: string;
		cancel: string;
		create: string;
	};
	/** Artifact receipt card (§7.5) — action labels, state badges, fallback. */
	artifactReceipt: {
		actionPreview: string;
		actionOpen: string;
		actionSave: string;
		actionDownload: string;
		actionCopy: string;
		actionEdit: string;
		actionApply: string;
		actionRetry: string;
		actionReview: string;
		actionConfirm: string;
		actionCancel: string;
		/** Task E1 §R2 — configureAction jump button on failed/needs-configuration receipts. */
		actionConfigure: string;
		imagePreviewLabel: string;
		closePreviewLabel: string;
		previousPreviewLabel: string;
		nextPreviewLabel: string;
		badgeGenerating: string;
		badgeSaving: string;
		badgeReady: string;
		badgeSaved: string;
		badgeFailed: string;
		badgeCancelled: string;
		badgeStale: string;
		badgeNeedsPermission: string;
		badgeAwaitingConfirmation: string;
		badgeNeedsConfiguration: string;
		untitledFallback: string;
		/** D2 I2 — awaiting-confirmation cost gate copy. Never a "blind
		 *  confirm": every field the confirm card shows is a receipt-derived
		 *  fact (never fabricated), and template-driven per configurability
		 *  rule. */
		confirmCostHeading: string;
		confirmCostRouteLabel: string;
		confirmCostProviderLabel: string;
		confirmCostModelLabel: string;
		confirmCostDurationLabel: string;
		confirmCostQuantityLabel: string;
		confirmCostEstimateLabel: string;
		confirmCostEstimateUnavailable: string;
		confirmCostConfidenceEstimated: string;
		confirmCostConfidenceReported: string;
		confirmCostDurationUnit: string;
	};
	mermaidFullscreen: {
		closeLabel: string;
		zoomInLabel: string;
		zoomOutLabel: string;
		resetLabel: string;
		canvasLabel: string;
		hint: string;
	};
	rightIndex: {
		outlineTab: string;
		starredTab: string;
		resourcesTab: string;
		searchPlaceholder: string;
		/** aria-label / tooltip for the topline collapse (PanelRightClose) button. */
		collapseLabel: string;
		directionAll: string;
		directionInput: string;
		directionGenerated: string;
		/** Section headers when Resources rows are grouped by direction. */
		groupInput: string;
		groupGenerated: string;
		/** "All types" — neutral option in the type dropdown (distinct from `All`). */
		typeAll: string;
		typeMessage: string;
		typeImage: string;
		typeAudio: string;
		typeVideo: string;
		typeDocument: string;
		typeUrl: string;
		typeVault: string;
		typeTable: string;
		typeCode: string;
		typeDiagram: string;
		typeBase: string;
		typeProcess: string;
		typeDataview: string;
		typeExtract: string;
		typeReminder: string;
		emptyFiltered: string;
		/** Optional second line under the filtered-empty title. */
		emptyFilteredSub?: string;
		emptyOutline: string;
		/** Optional second line under the outline-empty title (currently unset). */
		emptyOutlineSub?: string;
		emptyStarred: string;
		emptyStarredSub?: string;
		/** Resources tab true-empty state (was mis-bound to emptyOutline — R6). */
		emptyResources: string;
		emptyResourcesSub?: string;
		/** Footer count strings — the literal `{count}` is replaced in code. */
		footerOutlineCount: string;
		footerStarredCount: string;
		footerResourceCount: string;
		/** Footer right-hand static hint. */
		footerLocateHint: string;
		openLabel: string;
	};
	messages: {
		actionCopy: string;
		/** Transient confirmation label shown on the Copy button after a copy. */
		actionCopied: string;
		actionRetry: string;
		actionStar: string;
		actionUnstar: string;
		actionBranch: string;
		actionTrace: string;
		actionFollowUp: string;
		actionSaveToVault: string;
		actionViewRaw: string;
		actionCopyMarkdown: string;
		actionCopyJson: string;
		/** Copy trace JSON — secondary action inside the More menu (MSG-07). */
		actionCopyTraceJson: string;
		actionCopyTraceJsonDetail: string;
		actionEditResend: string;
		actionDelete: string;
		noTraceReason: string;
		savedToVaultPrefix: string;
		openSavedLabel: string;
		queuedLabel: string;
		permissionTitle: string;
		cancelledLabel: string;
		timeoutLabel: string;
		errorLabel: string;
		retryHint: string;
		// Message Canvas visual-replication additions (2026-07-17)
		reasoningTitle: string;
		reasoningStreaming: string;
		reasoningHint: string;
		reasoningDurationSuffix: string;
		agentRunTitle: string;
		agentRunRunning: string;
		agentRunCompleted: string;
		agentRunFailed: string;
		agentRunCancelled: string;
		agentRunStepSingular: string;
		agentRunStepPlural: string;
		agentTraceTitle: string;
		agentTraceSpanSingular: string;
		agentTraceSpanPlural: string;
		agentResultFound: string;
		agentResultCharacters: string;
		agentResultComplete: string;
		deleteConfirmBody: string;
		cancelLabel: string;
		dateToday: string;
		dateYesterday: string;
		/**
		 * Attachment understanding badges (zero-gap C1). One-liner appended to
		 * an attachment card so the user can see how their audio/video was
		 * consumed by the LLM. `understandingProvider`/`understandingModel`
		 * fill the `{provider}` / `{model}` slots where present.
		 */
		understandingBadgeNativeVideo: string;
		/** slots: {model} — Transcribed via whisper-1 etc. */
		understandingBadgeTranscribedAudio: string;
		understandingBadgeTranscribedExtractedAudio: string;
		understandingBadgeAttachmentOnly: string;
		/** slots: {reason} */
		understandingBadgeAttachmentOnlyReason: string;
		rewritePrompt: string;
		checklistPrompt: string;
		actionFollowUpDetail: string;
		actionSaveToVaultDetail: string;
		actionViewRawDetail: string;
		actionCopyMarkdownDetail: string;
		actionCopyJsonDetail: string;
		/** Two-line detail for Trace in the More popover. */
		actionTraceDetail: string;
		/** Fallback reply-anchor preview when a message has no text body (F7). */
		replyAnchorFallback: string;
		/** Tool-id → human label (migrated out of ToolCallSummary.tsx, N5). */
		toolLabels?: Record<string, string>;
	};
	projectHome: {
		newConversationLabel: string;
		statsConversations: string;
		statsMessages: string;
		statsStarred: string;
		statsResources: string;
		tabConversations: string;
		tabStarred: string;
		tabResources: string;
		tabPlans: string;
		descriptionPlaceholder: string;
		descriptionAiDraft: string;
		descriptionAiDraftHint: string;
		saveLabel: string;
		cancelLabel: string;
		planStatusPlanned: string;
		planStatusActive: string;
		planStatusBlocked: string;
		planStatusDone: string;
		planStatusArchived: string;
		planNewLabel: string;
		plansEmpty: string;
		// Project-home visual-replication additions (2026-07-17)
		eyebrow: string;
		headerScope: string;
		newChatHeaderTitle: string;
		editLabel: string;
		descriptionEditorLabel: string;
		conversationsSectionTitle: string;
		conversationsSectionDesc: string;
		conversationsEmpty: string;
		resourcesSectionTitle: string;
		resourcesSectionDesc: string;
		resourcesAddLabel: string;
		resourcesEmpty: string;
		starredSectionTitle: string;
		starredSectionDesc: string;
		starredEmpty: string;
		plansSectionTitle: string;
		plansSectionDesc: string;
		tabsAriaLabel: string;
		unavailableTitle: string;
		unavailableDetail: string;
	};
	density: {
		narrowCollapsePx: number;
		messageActionMinInlinePx: number;
		messageActionCorePx: number;
		composerBottomThresholdPx: number;
		composerWheelEdgePx: number;
		contextInlinePreviewChars: number;
	};
}

export const DEFAULT_CHAT_STUDIO_STRINGS: ChatStudioStrings =
	chatStudioDefaults as unknown as ChatStudioStrings;

/**
 * Load Chat Studio strings from the runtime config template, deep-merged onto
 * the compiled defaults. Always resolves — never rejects.
 */
export async function loadChatStudioStrings(): Promise<ChatStudioStrings> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_CHAT_STUDIO_STRINGS;
		const parsed = await tm.loadJson<Partial<ChatStudioStrings>>(ConfigTemplateId.ChatStudio);
		if (!parsed || typeof parsed !== 'object') return DEFAULT_CHAT_STUDIO_STRINGS;
		return mergeChatStudioStrings(DEFAULT_CHAT_STUDIO_STRINGS, parsed);
	} catch {
		return DEFAULT_CHAT_STUDIO_STRINGS;
	}
}

/** Single-level merge per nested group (mirrors chatStrings.ts). */
function mergeChatStudioStrings(
	base: ChatStudioStrings,
	override: Partial<ChatStudioStrings>
): ChatStudioStrings {
	return {
		greeting: { ...base.greeting, ...(override.greeting ?? {}) },
		starters: {
			newChat: override.starters?.newChat ?? base.starters.newChat,
			project: override.starters?.project ?? base.starters.project,
		},
		leftColumn: { ...base.leftColumn, ...(override.leftColumn ?? {}) },
		shell: { ...base.shell, ...(override.shell ?? {}) },
		composer: { ...base.composer, ...(override.composer ?? {}) },
		composerContext: {
			...base.composerContext,
			...(override.composerContext ?? {}),
			layers: {
				...base.composerContext.layers,
				...(override.composerContext?.layers ?? {}),
			},
		},
		assistantBuilder: { ...base.assistantBuilder, ...(override.assistantBuilder ?? {}) },
		projectPlans: { ...base.projectPlans, ...(override.projectPlans ?? {}) },
		artifactReceipt: { ...base.artifactReceipt, ...(override.artifactReceipt ?? {}) },
		mermaidFullscreen: { ...base.mermaidFullscreen, ...(override.mermaidFullscreen ?? {}) },
		rightIndex: { ...base.rightIndex, ...(override.rightIndex ?? {}) },
		messages: { ...base.messages, ...(override.messages ?? {}) },
		projectHome: { ...base.projectHome, ...(override.projectHome ?? {}) },
		density: { ...base.density, ...(override.density ?? {}) },
	};
}
