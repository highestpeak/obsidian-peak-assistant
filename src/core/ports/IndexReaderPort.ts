// T8 IndexService Facade — first slice: IndexReaderPort.
//
// The `IndexService` class is currently a 2000+ line god object doing
// write + read + graph + maintenance + enrichment. T8 progressively
// splits it into narrower runtimes. This first slice extracts the
// **read-only** surface — the methods any caller can invoke without
// worrying about mutation or long-running work. Anyone reading index
// status can now depend on this port rather than the concrete class,
// which lets the eventual writer/reader/graph/maintenance split happen
// behind the facade without breaking consumers.
//
// Scope of this port (deliberately narrow so future slices land
// incrementally, one per PR):
//   - `getIndexStatus()`     — index readiness snapshot for Settings /
//                              startup checks.
//   - `getTenantForPath(p)`  — figures out which tenant (`'vault'` /
//                              `'chat'`) owns a path.
//   - `isMobiusMaintenanceRecommended()` — decides whether the startup
//                              maintenance sweep should run.
//
// Explicitly OUT of this slice (kept on the concrete class for now,
// to be extracted in subsequent slices):
//   - Writer: `indexDocument`, `deleteDocuments`, `clearAllIndexData`,
//     `renameDocumentPath`.
//   - Graph:  `upsertGraphEdges…`, `refreshMobiusAggregates…`.
//   - Maintenance: `cleanupOrphanedSearchIndexData`,
//     `runMobiusGlobalMaintenance`, `runPending{Llm,Vector}IndexEnrichment`.
//
// Boundary discipline: this file MUST NOT import runtime code from
// service/*. It reuses **type-only** imports of the response shape and
// tenant type declared in the concrete implementation. When later
// slices happen, those types can migrate to `core/types/` if they need
// to live independently.

import type { IndexTenant } from '@/core/storage/sqlite/types';
import type { GetIndexStatusResponse } from '@/core/types/index-status';

/**
 * Read-only view of an index. Concrete implementations (currently
 * `IndexService`) provide additional writer/graph/maintenance methods
 * for their own concerns; consumers that only need to *check* the
 * index depend on this narrower port.
 */
export interface IndexReaderPort {
	/** Snapshot of readiness, built-at timestamp, and indexed-doc count. */
	getIndexStatus(): Promise<GetIndexStatusResponse>;
	/** Count unique indexed documents that still exist in the supplied current Vault paths. */
	countIndexedDocuments(paths: readonly string[]): Promise<number>;
	/** Resolve which tenant owns a vault-relative path. */
	getTenantForPath(path: string): IndexTenant;
	/**
	 * True when the Mobius global maintenance sweep is due — used at
	 * startup by IndexInitializer to decide whether to fire it.
	 */
	isMobiusMaintenanceRecommended(): Promise<boolean>;
}
