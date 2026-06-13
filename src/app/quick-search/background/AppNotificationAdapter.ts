// T10: Obsidian `Notice` adapter for the background-session runtime.
//
// The notification fragment uses an underlined clickable label so the
// user can reopen the modal + restore the session straight from the
// notice. The click hands off to the modal-opener adapter (so this
// adapter owns ONLY the Obsidian Notice surface; modal construction
// lives in `AppModalOpenerAdapter`).

import { Notice } from 'obsidian';
import type {
	QuickSearchModalOpenerPort,
	QuickSearchNotificationPort,
} from '@/service/search/background/ports/QuickSearchBackgroundPorts';
import type { QuickSearchSessionNotification } from '@/service/search/background/QuickSearchBackgroundTypes';

const NOTICE_TIMEOUT_MS = 8000;

export class AppNotificationAdapter implements QuickSearchNotificationPort {
	constructor(private readonly modalOpener: QuickSearchModalOpenerPort) {}

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
		span.addEventListener('click', () => this.modalOpener.openAndRestore(input.sessionId));
		frag.appendChild(span);
		new Notice(frag, NOTICE_TIMEOUT_MS);
	}
}
