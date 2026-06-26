// T10: Persistence-port adapter.
//
// Wraps the existing `persistSessionToVault` helper. That helper still
// reads `AppContext.getInstance()` internally (out-of-scope for T10),
// but isolating it behind the port keeps the new runtime free of that
// service-layer dependency and makes future migration to a fully
// app-owned persistence pipeline a single-file change.
//
// T11I (2026-06-26): now constructs and passes `AppAnalysisDocVaultWriterAdapter`
// because `persistSessionToVault` requires an explicit vault writer (no
// module-level default). A fresh adapter per call is cheap (no state).

import type { QuickSearchAnalysisPersistencePort } from '@/service/search/background/ports/QuickSearchBackgroundPorts';
import type { QuickSearchForegroundSnapshot } from '@/service/search/background/QuickSearchBackgroundTypes';
import { persistSessionToVault } from '@/service/search/analysisDocPersistence';
import type { V2SessionSnapshot } from '@/core/search/sessionSnapshot';
import { AppAnalysisDocVaultWriterAdapter } from '@/app/quick-search/AppAnalysisDocVaultWriterAdapter';

export class AppAnalysisPersistenceAdapter implements QuickSearchAnalysisPersistencePort {
	async persist(
		snapshot: QuickSearchForegroundSnapshot,
		options?: { existingPath?: string | null },
	): Promise<{ path: string } | null> {
		return persistSessionToVault(snapshot as V2SessionSnapshot, {
			vaultWriter: new AppAnalysisDocVaultWriterAdapter(),
			existingPath: options?.existingPath ?? null,
		});
	}
}
