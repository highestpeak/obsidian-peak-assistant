// T8: Ambient capability runtime — interface only.
//
// Mirrors the T6R Vault Lint pattern: a narrow interface that production
// callers (main.ts, command actions, panels, the gutter extension) reach
// through `AppContext.{get,tryGet}AmbientRuntime()`. The concrete
// implementation (`AmbientPushRuntime`) takes a `AmbientPorts` bag in its
// constructor; the runtime composition (`src/app/ambient/composeAmbientRuntime`)
// is the ONE place that wires app singletons (Obsidian `App`,
// `sqliteStoreManager`, `SearchClient`, LLM profile registry) into ports.
//
// The runtime is single-instance-per-plugin-load; binding semantics live
// in `AppRuntimeRegistry`.

import type { UserAction } from './types';

export interface AmbientRuntime {
	/**
	 * Begin listening to editor events (writing pause / doc switch).
	 * Idempotent in practice — the composition calls it exactly once at
	 * plugin boot, after settings have been loaded.
	 */
	start(): void;

	/**
	 * Force a "manual" ambient trigger for the current active file. Used
	 * by the Related Notes panel refresh button, the `peak-related-notes`
	 * open command, and the Settings -> Maintenance refresh action.
	 */
	triggerManual(): void;

	/**
	 * Run the Morning Briefing startup check. Returns `true` when a
	 * briefing was generated and projected into the briefing store
	 * (caller should open the modal). Non-critical: any failure resolves
	 * to `false`.
	 */
	tryShowMorningBriefing(): Promise<boolean>;

	/**
	 * Record a user action against the most recent push for this
	 * (source, pushed) pair. Used by `PushCard` (open / insert link /
	 * dismiss) and the serendipity gutter widget (open).
	 */
	recordAction(
		sourceFilePath: string,
		pushedFilePath: string,
		action: UserAction,
	): Promise<void>;

	/**
	 * Tear down the editor trigger and abort any in-flight search.
	 * Called from `main.onunload` before `AppContext.clearForUnload`.
	 */
	dispose(): void;
}
