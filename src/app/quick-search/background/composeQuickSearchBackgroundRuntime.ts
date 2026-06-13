// T10: Single composition point for the Quick Search background runtime.
//
// All adapters are constructed here. The notification adapter takes
// the modal-opener adapter so the clickable Notice surface can reach
// the modal opener without going through the runtime.
//
// Called from `main.onload()` after `AppContext` exists. Returns a
// runtime instance the caller binds via `AppContext.setQuickSearchBackgroundRuntime()`.

import type { App } from 'obsidian';
import { QuickSearchBackgroundRuntimeImpl } from '@/service/search/background/QuickSearchBackgroundRuntimeImpl';
import type { QuickSearchBackgroundRuntime } from '@/service/search/background/QuickSearchBackgroundRuntime';
import type { QuickSearchBackgroundDeps } from '@/service/search/background/ports/QuickSearchBackgroundPorts';
import { AppForegroundSessionAdapter } from './AppForegroundSessionAdapter';
import { AppEventRouterAdapter } from './AppEventRouterAdapter';
import { AppBackgroundTargetFactory } from './AppBackgroundTargetFactory';
import { AppNotificationAdapter } from './AppNotificationAdapter';
import { AppModalOpenerAdapter } from './AppModalOpenerAdapter';
import { AppAnalysisPersistenceAdapter } from './AppAnalysisPersistenceAdapter';
import { DefaultClock } from './DefaultClock';

export function composeQuickSearchBackgroundRuntime(app: App): QuickSearchBackgroundRuntime {
	const modalOpener = new AppModalOpenerAdapter(app);
	const deps: QuickSearchBackgroundDeps = {
		foregroundSession: new AppForegroundSessionAdapter(),
		eventRouter: new AppEventRouterAdapter(),
		targetFactory: new AppBackgroundTargetFactory(),
		notification: new AppNotificationAdapter(modalOpener),
		modalOpener,
		persistence: new AppAnalysisPersistenceAdapter(),
		clock: new DefaultClock(),
	};
	return new QuickSearchBackgroundRuntimeImpl(deps);
}
