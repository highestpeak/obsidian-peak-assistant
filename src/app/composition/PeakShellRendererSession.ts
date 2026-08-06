export type PeakShellLoadKind = 'cold-start' | 'hot-reload';

const PEAK_SHELL_RENDERER_SESSION = Symbol.for(
	'obsidian-peak-assistant.peak-shell-renderer-session',
);

/**
 * Classify a shell load within the current Electron renderer.
 *
 * Plugin disable/enable evaluates a fresh bundle but preserves `globalThis`,
 * while a full Obsidian renderer restart replaces it. A symbol-registry key
 * therefore separates hot reload from the first load without coupling the
 * startup shell to the full plugin runtime. `layoutReady` also covers the
 * first enable after Obsidian has already finished its startup window, which
 * includes upgrading from a shell version that did not install the marker.
 */
export function claimPeakShellLoadKind(
	rendererScope: object,
	layoutReady = false,
): PeakShellLoadKind {
	const session = rendererScope as Record<PropertyKey, unknown>;
	const shellAlreadyLoaded = session[PEAK_SHELL_RENDERER_SESSION] === true;

	if (!shellAlreadyLoaded) {
		Object.defineProperty(session, PEAK_SHELL_RENDERER_SESSION, {
			configurable: false,
			enumerable: false,
			value: true,
			writable: false,
		});
	}

	if (shellAlreadyLoaded || layoutReady) return 'hot-reload';
	return 'cold-start';
}
