// T10: Obsidian `Notice` adapter for the background-session runtime.
//
// The notification fragment uses an underlined clickable label so the
// user can reopen the modal + restore the session straight from the
// notice. The click invokes `input.onRestore()` (wired by the runtime
// to `runtime.openAndRestore(sessionId)`), so the runtime owns the
// pending-restore intent and modal construction stays in
// `AppModalOpenerAdapter`. Bypassing this and calling the modal opener
// directly would open the modal without setting the pending-restore id,
// leaving the freshly mounted `SearchModal` with nothing to restore.

import { Notice } from 'obsidian';
import type { QuickSearchNotificationPort } from '@/core/ports/QuickSearchBackgroundPorts';
import type { QuickSearchSessionNotification } from '@/service/search/background/QuickSearchBackgroundTypes';

const NOTICE_TIMEOUT_MS = 8000;

export class AppNotificationAdapter implements QuickSearchNotificationPort {
	showSessionReady(input: QuickSearchSessionNotification): void {
		this.show(input, 'Analysis plan ready');
	}

	showSessionComplete(input: QuickSearchSessionNotification): void {
		this.show(input, 'Analysis complete');
	}

	showSessionError(input: QuickSearchSessionNotification): void {
		this.show(input, 'Analysis failed');
	}

	private show(input: QuickSearchSessionNotification, prefix: string): void {
		const frag = document.createDocumentFragment();
		const span = document.createElement('span');
		const label = input.title ?? input.query.slice(0, 40);
		span.textContent = `${prefix}: "${label}"`;
		span.style.cursor = 'pointer';
		span.style.textDecoration = 'underline';
		span.addEventListener('click', () => input.onRestore());
		frag.appendChild(span);
		new Notice(frag, NOTICE_TIMEOUT_MS);
	}
}
