// T8 (Maintenance slice) — shared shapes for the periodic Mobius index
// maintenance sweep, LLM enrichment, and vector enrichment surfaces.
//
// These used to live inline in `IndexService`. They are lifted here so
// the new `IndexMaintenancePort` can be declared in core without
// core→service leakage. The concrete `IndexService` re-exports the
// legacy names for source-compatibility with existing importers.
//
// Nothing here has runtime behavior — it's all structural types.

import type { IndexTenant } from '@/core/storage/sqlite/types';
import type { LLMUsage } from '@/core/providers/types';
import type { IndexLlmRoute } from '@/core/search/indexTypes';

/** Batch-style maintenance phases; progress detail is in `progressTextSuffix`. */
export type MobiusGlobalMaintenanceBatchPhase =
	| 'tag_doc_count'
	| 'document_degrees'
	| 'pagerank_edges'
	| 'pagerank_persist'
	| 'semantic_pagerank_edges'
	| 'semantic_pagerank_persist'
	| 'semantic_related'
	| 'folder_hub_stats';

/** All maintenance progress phases (batch-style or `semantic_related`). */
export type MobiusGlobalMaintenancePhase = MobiusGlobalMaintenanceBatchPhase | 'semantic_related';

/** Progress events for the global maintenance sweep. */
export type MobiusGlobalMaintenanceProgress = {
	tenant: IndexTenant;
	phase: MobiusGlobalMaintenancePhase;
	progressTextSuffix?: string;
};

/** Options for the global maintenance sweep. */
export interface MobiusGlobalMaintenanceOptions {
	onProgress?: (ev: MobiusGlobalMaintenanceProgress) => void;
	signal?: AbortSignal;
}

/** Result of batched deferred LLM enrichment (tags/summary). */
export type LlmIndexEnrichmentResult = {
	processed: number;
	skippedWrongTenant: number;
	errors: Array<{ path: string; message: string }>;
	attempts: LlmIndexEnrichmentAttempt[];
};

export interface LlmIndexEnrichmentAttempt {
	path: string;
	status: 'produced' | 'partial' | 'failed' | 'cancelled' | 'not-eligible';
	startedAt: number;
	completedAt: number;
	route: IndexLlmRoute | null;
	usage: LLMUsage;
	costUsd: number;
	error: string | null;
}

/** Result of batched deferred vector enrichment. */
export type VectorIndexEnrichmentResult = {
	processed: number;
	skippedWrongTenant: number;
	errors: Array<{ path: string; message: string }>;
};

/** Progress payload for vector-enrichment loops. */
export type PendingEnrichmentProgress = {
	processed: number;
	total: number;
	path: string;
};

/** Progress payload for LLM-enrichment loops (structural mirror of tracker). */
export type PendingLlmEnrichmentProgress = {
	processed: number;
	total: number;
	path: string;
	elapsedMs: number;
	estimatedRemainingMs: number;
	estimatedTotalMs: number;
	lastDocInputTokens: number;
	lastDocOutputTokens: number;
	lastDocTotalTokens: number;
	lastDocCostUsd: number;
	sumInputTokens: number;
	sumOutputTokens: number;
	sumTotalTokens: number;
	sumCostUsd: number;
	estimatedRemainingTotalTokens: number;
	estimatedRemainingCostUsd: number;
	estimatedFinalTotalTokens: number;
	estimatedFinalCostUsd: number;
};

/** Cleanup counters returned by orphaned-index sweep. */
export type OrphanIndexCleanupCounts = {
	metaFts: number;
	fts: number;
	chunks: number;
	embeddings: number;
	graphNodes: number;
};
