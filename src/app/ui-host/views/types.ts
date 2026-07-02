export const CHAT_VIEW_TYPE = 'peak-chat-view';
export const PROJECT_LIST_VIEW_TYPE = 'peak-project-list-view';
export const USAGE_DASHBOARD_VIEW_TYPE = 'peak-usage-dashboard';
export const CONVERSATION_OUTLINE_VIEW_TYPE = 'peak-conversation-outline-view';
export const CHAT_STUDIO_VIEW_TYPE = 'peak-chat-studio-view';

export const TRACKED_VIEW_TYPES = new Set<string>([
	CHAT_VIEW_TYPE,
	PROJECT_LIST_VIEW_TYPE,
]);

export const STANDALONE_PEAK_VIEW_TYPES = new Set<string>([
	USAGE_DASHBOARD_VIEW_TYPE,
	// Conversation Outline lives in Obsidian's right sidebar (companion to
	// the chat view). Marked standalone so that focusing it / clicking inside
	// it does NOT cause ViewSwitchConsistentHandler to flip the entire
	// layout back to document mode (which was replacing the chat leaf with
	// a markdown file when users clicked any outline item).
	CONVERSATION_OUTLINE_VIEW_TYPE,
	// ChatStudioView is the all-in-one three-column chat experience opened
	// in a detached window. Standalone so its focus events don't summon or
	// dismiss the legacy chat layout.
	CHAT_STUDIO_VIEW_TYPE,
]);
