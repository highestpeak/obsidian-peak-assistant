/**
 * chatStrings — typed defaults + TemplateManager loader for the retained Chat UI.
 *
 * Two-tier story (PR-Chat-4):
 *   1. `templates/config/chat.json` is the runtime source of truth — editable
 *      without recompiling. Loaded via TemplateManager.loadJson(ConfigTemplateId.Chat).
 *   2. `DEFAULT_CHAT_STRINGS` (this module) ships compiled defaults, byte-for-byte
 *      aligned with chat.json. They guarantee the UI renders even when the
 *      template manager isn't initialized (mobile, early bootstrap, fixtures).
 *
 * `CHAT_STRINGS` is the legacy named export — kept as an alias of
 * `DEFAULT_CHAT_STRINGS` so existing imports don't break. New components should
 * prefer the `useChatStrings()` hook (chatStringsContext.tsx) to pick up
 * template overrides.
 *
 * Adding new strings: update BOTH `DEFAULT_CHAT_STRINGS` here AND
 * `templates/config/chat.json` — they must stay aligned.
 */

import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { AppContext } from '@/app/context/AppContext';

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
		tabArtifacts: string;
		tabMessages: string;
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
		moreOpenRelatedNotes: string;
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

export const DEFAULT_CHAT_STRINGS: ChatStrings = {
	header: {
		openSourceLabel: 'Open source document',
		refreshLabel: 'Refresh title',
		refreshLabelBusy: 'Regenerating…',
		deleteConversationLabel: 'Delete conversation',
		deleteConversationConfirmTitle: 'Delete this conversation?',
		deleteConversationConfirmBody: 'This removes the conversation from your vault and cannot be undone.',
		deleteConversationConfirmCta: 'Delete',
		deleteConversationConfirmCancel: 'Cancel',
	},
	composer: {
		placeholder: 'Ask anything…',
		placeholderEmpty: 'Ask anything… (@ for context)',
		sendLabel: 'Send',
		cancelLabel: 'Cancel',
		voiceLabel: 'Voice',
		runChipLabel: 'Run settings',
		runChipModeChat: 'Chat',
		runChipModeAgent: 'Agent',
		runChipModePlan: 'Plan',
		runChipModelAuto: 'Auto model',
		runChipCtxSuffix: 'ctx',
		attachLabel: 'Attach file',
	},
	runSettings: {
		title: 'Run settings',
		subtitle: 'Next message only',
		fieldMode: 'Run mode',
		fieldRole: 'Role',
		fieldModel: 'Model routing',
		fieldContext: 'Context',
		fieldTools: 'Tools',
		roleHint: 'Role changes behavior for the next message only.',
		modelAutoTitle: 'Auto profile model',
		modelManualTitle: 'Choose model…',
		modelManualSub: 'Manual override',
		roleDefault: 'Default',
		roleResearcher: 'Researcher',
		roleWriter: 'Writer',
		rolePlanner: 'Planner',
		roleCoder: 'Coder',
		contextCurrentNote: 'Current note',
		contextVaultSearch: 'Vault search',
		contextWebSearch: 'Web search',
		toolsAttachments: 'Attachments',
		toolsPinnedSources: 'Pinned sources',
		comingSoonHint: 'Coming soon',
	},
	indexSlot: {
		placeholderTitle: 'Conversation Index',
		placeholderHint: 'Topics, artifacts, and messages will appear here.',
	},
	index: {
		panelTitle: 'Conversation Index',
		toggleShowLabel: 'Show conversation index',
		toggleHideLabel: 'Hide conversation index',
		closeLabel: 'Close index',
		searchAll: 'Search topics, files, messages…',
		searchTopics: 'Search topics…',
		searchArtifacts: 'Search artifacts…',
		searchMessages: 'Search messages…',
		tabAll: 'All',
		tabTopics: 'Topics',
		tabArtifacts: 'Artifacts',
		tabMessages: 'Messages',
		allTopicsHeader: 'Topics',
		allArtifactsHeader: 'Artifacts',
		allMessagesHeader: 'Messages',
		emptyAll: 'Nothing here yet. Send a message to populate the index.',
		emptyTopics: 'No topics yet. Topics are derived from message headings.',
		emptyArtifacts: 'No artifacts yet. Code blocks and attachments will appear here.',
		emptyMessages: 'No messages yet.',
		topicNoTopic: 'No topic',
		topicKeyMessages: 'Key messages',
		topicAttachments: 'Sources / Attachments',
		topicMessagesRange: 'Messages {start} — {end}',
		topicCountSuffix: '',
		artifactFilterAll: 'All',
		artifactFilterCode: 'Code',
		artifactFilterFiles: 'Files',
		artifactFilterDiagrams: 'Diagrams',
		artifactFilterImages: 'Images',
		artifactKindCode: 'Code',
		artifactKindFile: 'File',
		artifactKindDiagram: 'Diagram',
		artifactKindImage: 'Image',
		artifactOpenLabel: 'Jump to artifact',
		messageFilterAll: 'All',
		messageFilterUser: 'You',
		messageFilterAssistant: 'Assistant',
		messageFilterErrors: 'Errors',
		footerTopics: 'Topics are derived from message structure.',
		footerArtifacts: 'Click any artifact to jump to it in the chat.',
		footerMessages: 'Click any message to jump to it.',
		footerAll: 'Click any entry to jump in chat.',
		artifactTagSaved: 'Saved',
		artifactTagIndexed: 'Indexed',
		messagesCurrentViewport: 'Current viewport',
	},
	message: {
		assistantName: 'Peak',
		youName: 'You',
		toolsSingular: 'tool',
		toolsPlural: 'tools',
		tokensSuffix: 'tokens',
		copyLabel: 'Copy',
		copiedLabel: 'Copied',
		regenerateLabel: 'Regenerate',
		starLabel: 'Star',
		unstarLabel: 'Unstar',
		branchLabel: 'Branch',
		openSettingsLabel: 'Open Settings',
		emptyHero: 'Ready when you are.',
		suggestedNextLabel: 'Suggested next',
		suggestedNextMore: 'More…',
		moreLabel: 'More message actions',
		moreViewRaw: 'View raw',
		moreCopyMarkdown: 'Copy as markdown',
		moreCopyJson: 'Copy as JSON',
		moreReplyInline: 'Reply inline',
		moreSaveToVault: 'Save to vault',
		moreDelete: 'Delete this message',
		moreSectionFollowUp: 'FOLLOW-UP',
		moreSectionActions: 'ACTIONS',
		moreRewriteSimply: 'Rewrite last reply simply',
		moreCreateChecklist: 'Create implementation checklist',
		moreOpenRelatedNotes: 'Open related notes',
		moreAskCustomFollowup: 'Ask custom follow-up…',
		viewRawTitle: 'Raw message',
		inlineFollowupHint: 'Inline reply — sent as the next message (threading lands later).',
		inlineFollowupPlaceholder: 'Write your follow-up…',
		inlineFollowupCancel: 'Cancel',
		inlineFollowupSubmit: 'Send',
		vaultSaveDefaultFolder: 'Peak Chat Saves',
		vaultSaveSuccess: 'Saved to vault',
		vaultSaveFailed: 'Could not save to vault',
	},
};

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
		const tm = AppContext.getInstance().manager.getTemplateManager?.();
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
