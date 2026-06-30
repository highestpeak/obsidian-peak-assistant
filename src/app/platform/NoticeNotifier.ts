import { Notice } from 'obsidian';
import type { NoticeHandle, NotifierPort } from '@/core/ports/NotifierPort';

/**
 * T11R: Obsidian-backed adapter for {@link NotifierPort}. Wraps
 * `new Notice(...)` so service/core can emit user-facing toasts without
 * importing the Obsidian side-effect symbol.
 */
export const obsidianNotifier: NotifierPort = {
	notify(message: string, durationMs?: number): NoticeHandle {
		const notice = durationMs === undefined ? new Notice(message) : new Notice(message, durationMs);
		return {
			setMessage(next: string) {
				notice.setMessage(next);
			},
			hide() {
				notice.hide();
			},
		};
	},
};
