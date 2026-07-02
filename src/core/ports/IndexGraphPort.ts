// B7 IndexService Facade — graph slice: IndexGraphPort.
//
// Sibling of `IndexReaderPort`, `IndexWriterPort`, `IndexMaintenancePort`.
// This port exposes the *graph-mutating* surface of the index — the
// operations that recompute derived graph state (Mobius aggregates,
// PageRank, semantic edges, hub stats).
//
// Scope:
//   - `runMobiusGlobalMaintenance(...)`   — composite sweep (aggregates +
//                                           PageRank + semantic edges +
//                                           structural analysis + hub stats).
//   - `refreshMobiusAggregates(...)`      — tag_doc_count + doc degrees.
//   - `recomputeVaultPageRank(...)`       — vault reference-edge PageRank.
//   - `recomputeSemanticPageRank(...)`    — semantic-edge PageRank.
//   - `rebuildSemanticEdgesForTenant(...)`— semantic related-edges rebuild.
//   - `rebuildFolderHubStats(...)`        — folder hub statistics (vault-only).
//
// Consumers that only need graph-mutating operations can depend on this
// narrow surface instead of the broader `IndexMaintenancePort` or the
// whole `IndexService`. Overlap with `IndexMaintenancePort` on
// `runMobiusGlobalMaintenance` is intentional — the same operation is a
// legitimate member of both facets.
//
// Boundary discipline: no service/* imports.

import type { IndexTenant } from '@/core/storage/sqlite/types';
import type {
	MobiusGlobalMaintenanceOptions,
	MobiusGlobalMaintenanceProgress,
} from '@/core/types/index-maintenance';

export interface IndexGraphMaintenanceOptions {
	onProgress?: (ev: MobiusGlobalMaintenanceProgress) => void;
}

export interface IndexGraphPort {
	runMobiusGlobalMaintenance(
		tenants?: IndexTenant[],
		options?: MobiusGlobalMaintenanceOptions,
	): Promise<void>;

	refreshMobiusAggregates(
		tenants?: IndexTenant[],
		options?: IndexGraphMaintenanceOptions,
	): Promise<void>;

	recomputeVaultPageRank(
		tenants?: IndexTenant[],
		options?: IndexGraphMaintenanceOptions,
	): Promise<void>;

	recomputeSemanticPageRank(
		tenants?: IndexTenant[],
		options?: IndexGraphMaintenanceOptions,
	): Promise<void>;

	rebuildSemanticEdgesForTenant(
		tenants?: IndexTenant[],
		options?: IndexGraphMaintenanceOptions,
	): Promise<void>;

	rebuildFolderHubStats(options?: IndexGraphMaintenanceOptions): Promise<void>;
}
