// T10: Persistence-port adapter.
//
// Wraps the existing `persistSessionToVault` helper. T11J B3 made the
// helper fully DI-driven — this adapter resolves runtime dependencies
// (settings, history service, event bus) from AppContext at call time
// since this file lives in the app layer where that's allowed.
//
// T11I (2026-06-26): constructs `AppAnalysisDocVaultWriterAdapter` per
// call (no module-level default).

import type { QuickSearchAnalysisPersistencePort } from '@/core/ports/QuickSearchBackgroundPorts';
import type { QuickSearchForegroundSnapshot } from '@/service/search/background/QuickSearchBackgroundTypes';
import { persistSessionToVault } from '@/service/search/analysisDocPersistence';
import type { V2SessionSnapshot } from '@/core/search/sessionSnapshot';
import { AppAnalysisDocVaultWriterAdapter } from '@/app/search/AppAnalysisDocVaultWriterAdapter';
import { AppContext } from '@/app/context/AppContext';

export class AppAnalysisPersistenceAdapter implements QuickSearchAnalysisPersistencePort {
	async persist(
		snapshot: QuickSearchForegroundSnapshot,
		options?: { existingPath?: string | null },
	): Promise<{ path: string } | null> {
		const ctx = AppContext.getInstance();
		return persistSessionToVault(snapshot as V2SessionSnapshot, {
			vaultWriter: new AppAnalysisDocVaultWriterAdapter(),
			existingPath: options?.existingPath ?? null,
			searchSettings: ctx.settings.search,
			enableDevTools: ctx.settings.enableDevTools === true,
			historyService: ctx.aiAnalysisHistoryService,
			eventBus: AppContext.getEventBus(),
		});
	}
}
