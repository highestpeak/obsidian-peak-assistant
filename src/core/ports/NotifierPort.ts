/**
 * T11R: Narrow notifier port — abstracts Obsidian's `new Notice(message, duration)`.
 *
 * Service/core never construct `Notice` directly (Obsidian side-effect).
 * The app layer composes a `Notice`-backed adapter and injects it. The
 * `Notice` handle returned lets long-running work update the toast message
 * (e.g. progress) and dismiss it.
 */
export interface NoticeHandle {
	setMessage(message: string): void;
	hide(): void;
}

export interface NotifierPort {
	/**
	 * Show a transient notice.
	 * @param message User-visible text.
	 * @param durationMs 0 = persistent until manually hidden; omitted = host default.
	 */
	notify(message: string, durationMs?: number): NoticeHandle;
}
