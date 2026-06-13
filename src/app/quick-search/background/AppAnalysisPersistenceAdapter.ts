// T10: Persistence-port adapter.
//
// Wraps the existing `persistSessionToVault` helper. That helper still
// reads `AppContext.getInstance()` internally (out-of-scope for T10),
// but isolating it behind the port keeps the new runtime free of that
// service-layer dependency and makes future migration to a fully
// app-owned persistence pipeline a single-file change.

import type { QuickSearchAnalysisPersistencePort } from '@/service/search/background/ports/QuickSearchBackgroundPorts';
import type { QuickSearchForegroundSnapshot } from '@/service/search/background/QuickSearchBackgroundTypes';
import { persistSessionToVault } from '@/service/search/analysisDocPersistence';
import type { V2SessionSnapshot } from '@/ui/view/quick-search/store/sessionSnapshot';

export class AppAnalysisPersistenceAdapter implements QuickSearchAnalysisPersistencePort {
	async persist(
		snapshot: QuickSearchForegroundSnapshot,
		options?: { existingPath?: string | null },
	): Promise<{ path: string } | null> {
		return persistSessionToVault(snapshot as V2SessionSnapshot, {
			existingPath: options?.existingPath ?? null,
		});
	}
}
