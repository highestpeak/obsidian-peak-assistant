/**
 * T11R: Narrow platform detection. Replaces the previous `core/platform.ts`
 * helpers that imported Obsidian's `Platform`.
 *
 * Implementation uses runtime feature detection so service/core stay free
 * of the `obsidian` import. The detection logic:
 *   - Obsidian desktop runs on Electron → `process.versions.electron` exists.
 *   - Obsidian mobile runs on Capacitor (iOS/Android) → no Node `process`,
 *     or `process` exists but lacks `versions.electron`.
 *
 * The detection is exposed as plain functions because every caller wants a
 * synchronous boolean; no need for a class/interface ceremony.
 */

/** True on iOS / Android Obsidian. */
export function isMobile(): boolean {
	try {
		// On mobile, `process` is typically undefined or a polyfill without `versions.electron`.
		if (typeof process === 'undefined') return true;
		const electron = (process as { versions?: { electron?: string } }).versions?.electron;
		return !electron;
	} catch {
		return true;
	}
}

/** True on macOS / Windows / Linux Obsidian (Electron). */
export function isDesktop(): boolean {
	return !isMobile();
}
