export interface ComposerKeyboardEvent {
	key: string;
	defaultPrevented: boolean;
	preventDefault(): void;
	stopPropagation(): void;
}

/**
 * Keep Escape inside the Composer product view.
 *
 * Descendant surfaces get the event first and may use it to close themselves.
 * The root still stops the same event from reaching Obsidian's workspace
 * handler, which would otherwise replace Composer with the Markdown view.
 */
export function containComposerEscape(event: ComposerKeyboardEvent): void {
	if (event.key !== 'Escape') return;
	if (!event.defaultPrevented) event.preventDefault();
	event.stopPropagation();
}
