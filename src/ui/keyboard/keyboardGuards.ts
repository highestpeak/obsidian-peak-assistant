type ModifierEvent = Pick<
	KeyboardEvent,
	'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'repeat'
> & Partial<Pick<KeyboardEvent, 'getModifierState'>>;

/** Option on macOS and Alt on Windows/Linux both arrive as `Alt`. */
export function isStandaloneKeyTipModifier(event: ModifierEvent): boolean {
	if (event.key !== 'Alt' || event.repeat) return false;
	if (event.ctrlKey || event.metaKey || event.shiftKey) return false;
	return !event.getModifierState?.('AltGraph');
}

export function keyTipSelectionKey(
	event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>,
): string | null {
	if (event.altKey || event.ctrlKey || event.metaKey) return null;
	return /^[a-z0-9]$/i.test(event.key) ? event.key.toLocaleUpperCase() : null;
}
