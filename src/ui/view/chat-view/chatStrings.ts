/**
 * chatStrings — typed defaults + TemplateManager loader for the retained Chat UI.
 *
 * Source of truth: `templates/config/chat.json` (editable without recompiling).
 * `DEFAULT_CHAT_STRINGS` is the JSON imported as a compiled fallback so the UI
 * still renders when the template manager is unavailable (mobile bootstrap,
 * early init, fixtures). Runtime overrides flow through TemplateManager and
 * the `useChatStrings()` hook (chatStringsContext.tsx).
 */

import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';
import chatDefaults from '../../../../templates/config/chat.json';

export interface ChatStrings {
	header: {
		openSourceLabel: string;
		refreshLabel: string;
		refreshLabelBusy: string;
		deleteConversationLabel: string;
		deleteConversationConfirmTitle: string;
		deleteConversationConfirmBody: string;
		deleteConversationConfirmCta: string;
		deleteConversationConfirmCancel: string;
	};
	composer: {
		placeholder: string;
		placeholderEmpty: string;
		sendLabel: string;
		cancelLabel: string;
		voiceLabel: string;
		runChipLabel: string;
		runChipModeChat: string;
		runChipModeAgent: string;
		runChipModePlan: string;
		runChipModelAuto: string;
		runChipCtxSuffix: string;
		attachLabel: string;
		streamingStatus: string;
	};
	runSettings: {
		title: string;
		subtitle: string;
		fieldMode: string;
		fieldRole: string;
		fieldModel: string;
		fieldContext: string;
		fieldTools: string;
		roleHint: string;
		modelAutoTitle: string;
		modelManualTitle: string;
		modelManualSub: string;
		// Role pill labels (Default / Researcher / Writer / Planner / Coder)
		roleDefault: string;
		roleResearcher: string;
		roleWriter: string;
		rolePlanner: string;
		roleCoder: string;
		// Context row labels
		contextCurrentNote: string;
		contextVaultSearch: string;
		contextWebSearch: string;
		// Tools row labels (advisory — render disabled if not wired)
		toolsAttachments: string;
		toolsPinnedSources: string;
		comingSoonHint: string;
	};
	indexSlot: {
		placeholderTitle: string;
		placeholderHint: string;
	};
	index: {
		panelTitle: string;
		toggleShowLabel: string;
		toggleHideLabel: string;
		closeLabel: string;
		searchAll: string;
		searchTopics: string;
		searchArtifacts: string;
		searchMessages: string;
		tabAll: string;
		tabTopics: string;
		tabOverview: string;
		tabArtifacts: string;
		tabMessages: string;
		searchOverview: string;
		artifactKindHeaderImages: string;
		artifactKindHeaderDiagrams: string;
		artifactKindHeaderFiles: string;
		artifactKindHeaderCode: string;
		footerOverview: string;
		allTopicsHeader: string;
		allArtifactsHeader: string;
		allMessagesHeader: string;
		emptyAll: string;
		emptyTopics: string;
		emptyArtifacts: string;
		emptyMessages: string;
		topicNoTopic: string;
		topicKeyMessages: string;
		topicAttachments: string;
		topicMessagesRange: string;
		topicCountSuffix: string;
		artifactFilterAll: string;
		artifactFilterCode: string;
		artifactFilterFiles: string;
		artifactFilterDiagrams: string;
		artifactFilterImages: string;
		artifactKindCode: string;
		artifactKindFile: string;
		artifactKindDiagram: string;
		artifactKindImage: string;
		artifactOpenLabel: string;
		messageFilterAll: string;
		messageFilterUser: string;
		messageFilterAssistant: string;
		messageFilterErrors: string;
		footerTopics: string;
		footerArtifacts: string;
		footerMessages: string;
		footerAll: string;
		artifactTagSaved: string;
		artifactTagIndexed: string;
		messagesCurrentViewport: string;
	};
	message: {
		assistantName: string;
		youName: string;
		toolsSingular: string;
		toolsPlural: string;
		tokensSuffix: string;
		copyLabel: string;
		copiedLabel: string;
		regenerateLabel: string;
		starLabel: string;
		unstarLabel: string;
		branchLabel: string;
		openSettingsLabel: string;
		emptyHero: string;
		suggestedNextLabel: string;
		suggestedNextMore: string;
		moreLabel: string;
		moreViewRaw: string;
		moreCopyMarkdown: string;
		moreCopyJson: string;
		moreReplyInline: string;
		moreSaveToVault: string;
		moreDelete: string;
		moreSectionFollowUp: string;
		moreSectionActions: string;
		moreRewriteSimply: string;
		moreCreateChecklist: string;
		moreAskCustomFollowup: string;
		viewRawTitle: string;
		inlineFollowupHint: string;
		inlineFollowupPlaceholder: string;
		inlineFollowupCancel: string;
		inlineFollowupSubmit: string;
		vaultSaveDefaultFolder: string;
		vaultSaveSuccess: string;
		vaultSaveFailed: string;
	};
}

export const DEFAULT_CHAT_STRINGS: ChatStrings = chatDefaults as unknown as ChatStrings;

/** Legacy alias — prefer `useChatStrings()` for runtime template overrides. */
export const CHAT_STRINGS: ChatStrings = DEFAULT_CHAT_STRINGS;

// ── Runtime loader ────────────────────────────────────────────────────────

/**
 * Load chat strings from the runtime config template, deep-merged onto the
 * compiled defaults. Falls back to defaults whenever the template manager is
 * unavailable (mobile bootstrap, early init, tests) or the load throws.
 *
 * Always resolves — never rejects. Safe to call from React effects.
 */
export async function loadChatStrings(): Promise<ChatStrings> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_CHAT_STRINGS;
		const parsed = await tm.loadJson<Partial<ChatStrings>>(ConfigTemplateId.Chat);
		if (!parsed || typeof parsed !== 'object') return DEFAULT_CHAT_STRINGS;
		return mergeChatStrings(DEFAULT_CHAT_STRINGS, parsed);
	} catch {
		return DEFAULT_CHAT_STRINGS;
	}
}

/** Deep-merge two ChatStrings (single-level merge per nested group). */
function mergeChatStrings(base: ChatStrings, override: Partial<ChatStrings>): ChatStrings {
	return {
		header: { ...base.header, ...(override.header ?? {}) },
		composer: { ...base.composer, ...(override.composer ?? {}) },
		runSettings: { ...base.runSettings, ...(override.runSettings ?? {}) },
		indexSlot: { ...base.indexSlot, ...(override.indexSlot ?? {}) },
		index: { ...base.index, ...(override.index ?? {}) },
		message: { ...base.message, ...(override.message ?? {}) },
	};
}
