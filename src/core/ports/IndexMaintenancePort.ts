// T8 IndexService Facade — third slice: IndexMaintenancePort.
//
// Sibling of `IndexReaderPort` and `IndexWriterPort`. This port
// exposes the *periodic sweep* + *deferred enrichment* surface of the
// index — the things that run on a schedule (or on user demand) rather
// than in the hot path of every document write.
//
// Scope:
//   - `cleanupOrphanedSearchIndexData()`     — orphan sweep + counters.
//   - `runMobiusGlobalMaintenance(...)`      — global Mobius refresh
//                                              (aggregates + PageRank +
//                                              semantic edges + hub stats).
//   - `runPendingLlmIndexEnrichment(...)`    — chase down `llm_pending`.
//   - `runPendingVectorIndexEnrichment(...)` — chase down `vector_pending`.
//   - `clearPendingLlmFlags()`               — reset stuck flags.
//
// Boundary discipline: no service/* imports.

import type { IndexTenant } from '@/core/storage/sqlite/types';
import type { SearchSettings } from '@/core/config/settingsTypes';
import type { IndexLlmRoute } from '@/core/search/indexTypes';
import type {
	LlmIndexEnrichmentResult,
	MobiusGlobalMaintenanceOptions,
	OrphanIndexCleanupCounts,
	PendingEnrichmentProgress,
	PendingLlmEnrichmentActivity,
	PendingLlmEnrichmentProgress,
	VectorIndexEnrichmentResult,
} from '@/core/types/index-maintenance';

export interface IndexMaintenancePort {
	cleanupOrphanedSearchIndexData(): Promise<OrphanIndexCleanupCounts>;

	runMobiusGlobalMaintenance(
		tenants?: IndexTenant[],
		options?: MobiusGlobalMaintenanceOptions,
	): Promise<void>;

	runPendingLlmIndexEnrichment(
		settings: SearchSettings,
		options?: {
			onProgress?: (ev: PendingLlmEnrichmentProgress) => void;
			onActivity?: (ev: PendingLlmEnrichmentActivity) => void;
			shouldContinue?: () => boolean;
			paths?: readonly string[];
			includeTags?: boolean;
			includeSummary?: boolean;
			llmRoute?: IndexLlmRoute;
		},
	): Promise<LlmIndexEnrichmentResult>;

	runPendingVectorIndexEnrichment(
		settings: SearchSettings,
		options?: {
			onProgress?: (ev: PendingEnrichmentProgress) => void;
			shouldContinue?: () => boolean;
			paths?: readonly string[];
		},
	): Promise<VectorIndexEnrichmentResult>;

	clearPendingLlmFlags(): Promise<{ cleared: number }>;
}
