/**
 * Narrow app-owned handoff for opening the production Quick Search from UI
 * surfaces (chat-studio §6.2 L-SEARCH-01/02).
 *
 * UI never reaches for the raw plugin or command registry — the app layer
 * composes this port from PeakCommandActions + the real hotkey binding.
 * `hotkeyHint()` returns null when no binding exists (no fake ⌘K badges).
 */
export interface QuickSearchLauncherPort {
	open(): void;
	hotkeyHint(): string | null;
}
