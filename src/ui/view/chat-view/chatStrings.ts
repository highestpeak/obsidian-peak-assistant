/**
 * chatStrings — typed default strings for the retained Chat UI.
 *
 * Source of truth: `templates/config/chat.json` (kept in sync manually for now).
 * PR-Chat-4 will replace this module with a TemplateManager-driven loader so the
 * JSON becomes runtime-editable without code changes. Until then, this module
 * provides the typed shape and the defaults that match chat.json byte-for-byte.
 *
 * Do not add ad-hoc UI strings in component files — add them here AND update
 * chat.json so the two stay aligned (PR-Chat-4 will collapse them into one).
 */

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
	};
	runSettings: {
		title: string;
		subtitle: string;
		fieldMode: string;
		fieldRole: string;
		fieldModel: string;
		roleHint: string;
		modelAutoTitle: string;
		modelManualTitle: string;
		modelManualSub: string;
	};
	indexSlot: {
		placeholderTitle: string;
		placeholderHint: string;
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
		moreDelete: string;
		viewRawTitle: string;
		inlineFollowupHint: string;
		inlineFollowupPlaceholder: string;
		inlineFollowupCancel: string;
		inlineFollowupSubmit: string;
	};
}

export const CHAT_STRINGS: ChatStrings = {
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
	},
	runSettings: {
		title: 'Run settings',
		subtitle: 'Next message only',
		fieldMode: 'Run mode',
		fieldRole: 'Role',
		fieldModel: 'Model routing',
		roleHint: 'Role changes behavior for the next message only.',
		modelAutoTitle: 'Auto profile model',
		modelManualTitle: 'Choose model…',
		modelManualSub: 'Manual override',
	},
	indexSlot: {
		placeholderTitle: 'Conversation Index',
		placeholderHint: 'Topics, artifacts, and messages will appear here.',
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
		moreDelete: 'Delete this message',
		viewRawTitle: 'Raw message',
		inlineFollowupHint: 'Inline reply — sent as the next message (threading lands later).',
		inlineFollowupPlaceholder: 'Write your follow-up…',
		inlineFollowupCancel: 'Cancel',
		inlineFollowupSubmit: 'Send',
	},
};
