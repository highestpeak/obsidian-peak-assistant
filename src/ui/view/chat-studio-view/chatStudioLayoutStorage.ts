/**
 * localStorage adapter for `StudioLayoutPreference` (SHELL-03).
 *
 * Widths and collapse flags are UI preference, not session data — they live
 * in `localStorage` scoped by a versioned key so a future breaking change can
 * bump the suffix without stranding old blobs on disk.
 *
 * Reads are ownerDocument-aware so detached-window renders still hydrate
 * from the same store as the main window.
 */

import {
	StudioLayoutPreference,
	DEFAULT_LAYOUT_PREFERENCE,
	decodeLayoutPreference,
	encodeLayoutPreference,
} from './chatStudioLeftLogic';

export const STUDIO_LAYOUT_STORAGE_KEY = 'peak-assistant.chat-studio.layout.v1';

/** Return a Storage from the given ownerDocument (falls back to globals). */
function resolveStorage(doc: Document | null | undefined): Storage | null {
	try {
		const win = doc?.defaultView ?? (typeof window !== 'undefined' ? window : null);
		return win?.localStorage ?? null;
	} catch {
		return null;
	}
}

export function readLayoutPreference(doc?: Document | null): StudioLayoutPreference {
	const storage = resolveStorage(doc ?? (typeof document !== 'undefined' ? document : null));
	if (!storage) return DEFAULT_LAYOUT_PREFERENCE;
	try {
		return decodeLayoutPreference(storage.getItem(STUDIO_LAYOUT_STORAGE_KEY));
	} catch {
		return DEFAULT_LAYOUT_PREFERENCE;
	}
}

export function writeLayoutPreference(pref: StudioLayoutPreference, doc?: Document | null): void {
	const storage = resolveStorage(doc ?? (typeof document !== 'undefined' ? document : null));
	if (!storage) return;
	try {
		storage.setItem(STUDIO_LAYOUT_STORAGE_KEY, encodeLayoutPreference(pref));
	} catch {
		// Ignore quota / private-mode errors — layout is best-effort UI polish.
	}
}
