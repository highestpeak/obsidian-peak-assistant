// T8 IndexService Facade — second slice: IndexWriterPort.
//
// The read-only surface landed as `IndexReaderPort`; this port is the
// mirror image for *mutation* — anyone who writes into the index (adding
// / deleting / renaming / clearing documents, or bumping the Mobius
// maintenance debt counter) can now depend on this port instead of
// reaching for the concrete `IndexService` class.
//
// Boundary discipline: this file MUST NOT import runtime code from
// service/*. Only core-owned types.
//
// Scope (exactly what the concrete class exposes today):
//   - `indexDocument(...)`         — full or partial index rebuild for a
//                                    single path (embeddings / graph /
//                                    LLM enrichment gated by options).
//   - `deleteDocuments(...)`       — batch delete by paths, tenant-scoped
//                                    cleanup of chunks / embeddings /
//                                    graph nodes / hub constituent rows.
//   - `clearAllIndexData(cb?)`     — nuke both tenants' index state.
//   - `renameDocumentPath(o,n)`    — rename without dropping graph node id.
//   - `addMaintenanceDebt(t,d)`    — bump per-tenant maintenance debt.
//
// Kept OUT of this slice (see `IndexMaintenancePort` for the sweep+
// enrichment surface): `cleanupOrphanedSearchIndexData`, the
// `runMobiusGlobalMaintenance`, and the `runPending{Llm,Vector}` methods.

import type { Document } from '@/core/document/types';
import type { IndexDocumentOptions } from '@/core/search/indexTypes';
import type { SearchSettings } from '@/core/config/settingsTypes';
import type { IndexTenant } from '@/core/storage/sqlite/types';

/**
 * Storage layer touched by a mutation, so callers can invalidate the
 * right caches after a write completes.
 */
export type IndexStorageType = 'sqlite' | 'graph';

/**
 * Callback invoked when the writer has finished mutating one or more
 * storage tiers (so consumers can flush caches / refresh views).
 */
export type OnAfterIndexMutation = (types: IndexStorageType[]) => void;

/**
 * Write-mutation view of an index. Concrete implementations
 * (currently `IndexService`) implement additional reader + graph +
 * maintenance methods; consumers that only *write* documents depend on
 * this narrower port.
 */
export interface IndexWriterPort {
	indexDocument(
		docPath: string,
		settings: SearchSettings,
		indexOptions?: IndexDocumentOptions,
		preloadedDocument?: Document,
	): Promise<void>;

	deleteDocuments(
		paths: string[],
		onAfterMutation?: OnAfterIndexMutation,
	): Promise<void>;

	clearAllIndexData(onAfterMutation?: OnAfterIndexMutation): Promise<void>;

	renameDocumentPath(oldPath: string, newPath: string): Promise<boolean>;

	addMaintenanceDebt(tenant: IndexTenant, delta: number): Promise<void>;
}
