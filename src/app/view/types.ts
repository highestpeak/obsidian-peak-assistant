export const CHAT_VIEW_TYPE = 'peak-chat-view';
export const PROJECT_LIST_VIEW_TYPE = 'peak-project-list-view';
export const GRAPH_FULLSCREEN_VIEW_TYPE = 'peak-graph-fullscreen';
export const AMBIENT_PUSH_VIEW_TYPE = 'peak-ambient-push-view';
export const USAGE_DASHBOARD_VIEW_TYPE = 'peak-usage-dashboard';
export const VAULT_XRAY_VIEW_TYPE = 'peak-vault-xray-view';
export const GAP_ANALYSIS_VIEW_TYPE = 'peak-gap-analysis';
export const KNOWLEDGE_CENTER_VIEW_TYPE = 'peak-knowledge-center';

export const TRACKED_VIEW_TYPES = new Set<string>([
	CHAT_VIEW_TYPE,
	PROJECT_LIST_VIEW_TYPE,
]);

export const STANDALONE_PEAK_VIEW_TYPES = new Set<string>([
	GRAPH_FULLSCREEN_VIEW_TYPE,
	AMBIENT_PUSH_VIEW_TYPE,
	USAGE_DASHBOARD_VIEW_TYPE,
	VAULT_XRAY_VIEW_TYPE,
	GAP_ANALYSIS_VIEW_TYPE,
	KNOWLEDGE_CENTER_VIEW_TYPE,
]);
