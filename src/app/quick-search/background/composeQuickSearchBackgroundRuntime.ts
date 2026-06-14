// T10: Single composition point for the Quick Search background runtime.
//
// All adapters are constructed here. The notification adapter owns
// only the Obsidian `Notice` surface; the click handler invokes the
// `onRestore` callback supplied by the runtime, which sets the
// pending-restore intent and then asks the modal-opener port to surface
// the modal.
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
	const deps: QuickSearchBackgroundDeps = {
		foregroundSession: new AppForegroundSessionAdapter(),
		eventRouter: new AppEventRouterAdapter(),
		targetFactory: new AppBackgroundTargetFactory(),
		notification: new AppNotificationAdapter(),
		modalOpener: new AppModalOpenerAdapter(app),
		persistence: new AppAnalysisPersistenceAdapter(),
		clock: new DefaultClock(),
	};
	return new QuickSearchBackgroundRuntimeImpl(deps);
}
