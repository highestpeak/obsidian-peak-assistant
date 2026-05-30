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
