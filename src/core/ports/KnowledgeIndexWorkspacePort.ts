import type { IndexLevel } from '@/core/search/indexTypes';

export interface IndexRunOutputs {
	fullText: boolean;
	embeddings: boolean;
	markdownSummaries: boolean;
	aiTags: boolean;
	localKeywords: boolean;
	existingRelations: boolean;
	searchRankingSignals: boolean;
}

export interface KnowledgeIndexWorkspaceSnapshot {
	status: 'idle' | 'running' | 'paused' | 'complete' | 'error' | 'cancelled';
	message: string;
	startedAt: number | null;
	updatedAt: number | null;
	indexReady: boolean;
	indexedDocuments: number;
	totalDocuments: number;
	lastBuiltAt: number | null;
	fileTypes: Array<{ type: string; label: string; count: number }>;
	queue: Array<{ position: number; path: string }>;
	failures: Array<{ stage: string; path?: string; message: string }>;
}

export interface KnowledgeIndexWorkspacePort {
	getSnapshot(): Promise<KnowledgeIndexWorkspaceSnapshot>;
	subscribe(listener: () => void): () => void;
	start(options: { level: IndexLevel; outputs: IndexRunOutputs }): Promise<void>;
	pause(): void;
	resume(): void;
	cancel(): void;
	retry(): Promise<void>;
	openVaultSearch(): void | Promise<void>;
}
