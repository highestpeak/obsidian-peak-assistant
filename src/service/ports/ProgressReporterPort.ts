// T2A first port boundary: progress notification surface.
//
// This file must stay dependency-light. It must not import obsidian,
// AppContext, any zustand store, any UI module, any storage adapter, or any
// other runtime singleton.
//
// Current service-side consumers (kept up-to-date as adopters land):
//   - src/service/search/support/progress-tracker.ts (T2A)
//   - src/service/search/index/indexInitializer.ts   (T2B)
//   - src/service/search/analysisDocPersistence.ts   (T2C)
// Each resolves the reporter via constructor injection or an options field
// when possible; otherwise it falls back to `getDefaultProgressReporter()`,
// which finds the adapter registered by the app layer at plugin startup.
//
// The module-level `defaultReporter` is a deliberate T2 transitional
// compromise. It lets adopters land without threading a reporter through
// every call site, and lets tests inject a fake without touching app code.
// A missing registration is fail-loud (throws) so a forgotten wiring step
// cannot silently disable user-visible progress notifications.
//
// This default is expected to be retired when T3 RunEnvelope provides a
// more explicit dependency assembly point. No NEW module-level mutable
// defaults should be added for other side-effect kinds — see the
// modernization handbook's "no scattered global defaults" rule.

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
