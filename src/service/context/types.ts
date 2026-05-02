export type OperationType =
	| 'chat_message'
	| 'ai_analysis_complete'
	| 'copilot_action'
	| 'file_open'
	| 'resource_attach'
	| 'search_query';

export interface ActivityEntry {
	id: string;
	type: OperationType;
	timestamp: number;
	summary: string;
	relatedPaths: string[];
	importanceLevel: 0 | 1 | 2;
	metadata?: Record<string, unknown>;
}

export interface WorkingTheme {
	ruleBased: {
		topTags: string[];
		topFolders: string[];
		topKeywords: string[];
		summary: string;
	};
	llmInferred: {
		summary: string;
		relatedFiles: string[];
		updatedAt: number;
	} | null;
}

export interface WorkingContext {
	activeFile: { path: string; title: string; openedAt: number } | null;
	recentActivities: ActivityEntry[];
	workingTheme: WorkingTheme;
	updatedAt: number;
}
