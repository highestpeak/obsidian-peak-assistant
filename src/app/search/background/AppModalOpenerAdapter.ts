// T10: Modal-opener port adapter.
//
// Wraps `new QuickSearchModal(AppContext).open()`. The runtime calls
// this from `openAndRestore(sessionId)` (and the notification adapter
// uses it on Notice click). The runtime separately marks the session
// id as the pending-restore target so the modal mount picks it up.

import type { App } from 'obsidian';
import type { QuickSearchModalOpenerPort } from '@/core/ports/QuickSearchBackgroundPorts';
import { QuickSearchModal } from '@/app/ui-host/modals/QuickSearchModal';
import { AppContext } from '@/app/context/AppContext';

export class AppModalOpenerAdapter implements QuickSearchModalOpenerPort {
	constructor(private readonly app: App) {
		// `app` parameter is here so future call sites can hand the
		// Obsidian `App` directly instead of routing through
		// `AppContext.getInstance()`. For now the existing modal
		// constructor signature requires the full `AppContext`.
		void this.app;
	}

	openAndRestore(_sessionId: string): void {
		// The runtime already wrote the pending-restore id; opening the
		// modal lets the mount-time effect consume it.
		const ctx = AppContext.getInstance();
		const modal = new QuickSearchModal(ctx);
		modal.open();
	}
}
