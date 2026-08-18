import type { IndexLevel } from '@/core/search/indexTypes';

export interface IndexRunPlan {
	level: IndexLevel;
	outputs?: {
		includeEmbeddings: boolean;
		includeLlmTags: boolean;
		includeLlmSummary: boolean;
		includeGraphMaintenance: boolean;
	};
}

export interface IndexRunResult {
	status: 'complete' | 'cancelled' | 'failed';
	indexedCount: number;
	failureCount: number;
	totalDocuments: number;
	message: string;
}

export interface IndexRunSnapshot {
	runId: string | null;
	planFingerprint: string | null;
	status: 'idle' | 'running' | 'paused' | 'complete' | 'cancelled' | 'failed';
	message: string;
	startedAt: number | null;
	updatedAt: number | null;
	result: IndexRunResult | null;
}

export interface IndexReadinessProjection {
	fullText: 'missing' | 'building' | 'ready' | 'failed';
	activeRunId: string | null;
	indexedDocuments: number;
	failures: number;
}

export interface IndexRunCoordinatorPort {
	startOrAttach(plan: IndexRunPlan): Promise<{ runId: string; disposition: 'started' | 'attached' }>;
	waitFor(runId: string): Promise<IndexRunResult>;
	getSnapshot(): IndexRunSnapshot;
	getReadiness(): Promise<IndexReadinessProjection>;
	subscribe(listener: (snapshot: IndexRunSnapshot) => void): () => void;
	pause(runId: string): void;
	resume(runId: string): void;
	cancel(runId: string): void;
}
