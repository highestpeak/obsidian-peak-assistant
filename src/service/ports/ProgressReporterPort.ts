// T2A first port boundary: progress notification surface.
//
// This file must stay dependency-light. It must not import obsidian,
// AppContext, any zustand store, any UI module, any storage adapter, or any
// other runtime singleton. The only intended consumer is
// `src/service/search/support/progress-tracker.ts`, which uses
// `getDefaultProgressReporter()` to find the adapter registered by the app
// layer at plugin startup.
//
// The default reporter is module-level on purpose: it lets the single
// service-side adopter run without passing a reporter through every call
// site, and lets tests inject a fake without touching app code. A missing
// registration is fail-loud (throws) so a forgotten wiring step cannot
// silently disable user-visible progress notifications.

export interface ProgressHandle {
	/**
	 * Replace the current message. The handle's original timeout (the one
	 * passed to `show`) is preserved.
	 */
	setMessage(message: string): void;
	/** Close the underlying notification. Safe to call multiple times. */
	hide(): void;
}

export interface ProgressReporterPort {
	/**
	 * Open a progress notification. `timeoutMs === 0` keeps it visible until
	 * `hide()` is called explicitly (matches `new Notice(msg, 0)`).
	 */
	show(message: string, timeoutMs?: number): ProgressHandle;
}

let defaultReporter: ProgressReporterPort | null = null;

/**
 * Register the process-level default reporter. The app layer must call this
 * once during plugin startup, before any indexing pipeline can construct an
 * `IndexProgressTracker` without an explicit reporter argument.
 */
export function setDefaultProgressReporter(reporter: ProgressReporterPort): void {
	defaultReporter = reporter;
}

/**
 * Returns the registered default reporter, or throws if none is registered.
 * Throwing is intentional: a missing default means the app-layer wiring step
 * was skipped, and silently no-opping would hide a real bug.
 */
export function getDefaultProgressReporter(): ProgressReporterPort {
	if (!defaultReporter) {
		throw new Error(
			'ProgressReporterPort: no default reporter registered. ' +
				'The app layer must call setDefaultProgressReporter() during plugin onload(). ' +
				'For tests, pass a reporter explicitly to the consumer or call clearDefaultProgressReporter() and then setDefaultProgressReporter() with a fake.',
		);
	}
	return defaultReporter;
}

/**
 * Drops the registered default reporter. Called by `main.ts` during
 * `onunload()` so a hot-reloaded plugin bundle does not see a stale Notice
 * closure from the previous load, and by tests when they want to assert the
 * fail-loud getter behavior or swap in a fake.
 */
export function clearDefaultProgressReporter(): void {
	defaultReporter = null;
}
