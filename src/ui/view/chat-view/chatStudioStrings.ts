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
		attachFilesLabel: string;
		attachFilesDescription: string;
		attachVaultDocLabel: string;
		attachVaultDocDescription: string;
		attachLinkLabel: string;
		attachLinkDescription: string;
		attachLinkPlaceholder: string;
		attachMenuLabel: string;
		workflowPlanLabel: string;
		workflowPlanDescription: string;
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
		untitledFallback: string;
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
		emptyFiltered: string;
		/** Optional second line under the filtered-empty title. */
		emptyFilteredSub?: string;
		emptyOutline: string;
		/** Optional second line under the outline-empty title (currently unset). */
		emptyOutlineSub?: string;
		/** Resources tab true-empty state (was mis-bound to emptyOutline — R6). */
		emptyResources: string;
		emptyResourcesSub?: string;
		/** Footer count strings — the literal `{count}` is replaced in code. */
		footerOutlineCount: string;
		footerResourceCount: string;
		/** Footer right-hand static hint. */
		footerLocateHint: string;
		openLabel: string;
	};
	messages: {
		actionCopy: string;
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
		rewritePrompt: string;
		checklistPrompt: string;
		actionFollowUpDetail: string;
		actionSaveToVaultDetail: string;
		actionViewRawDetail: string;
		actionCopyMarkdownDetail: string;
		actionCopyJsonDetail: string;
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
	};
	density: {
		narrowCollapsePx: number;
		messageActionMinInlinePx: number;
		messageActionCorePx: number;
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
