// T11B (2026-06-14): Copilot manual action runtime — interface only.
//
// Mirrors the T6R Vault Lint / T8 Ambient / T9 Vault Review / T10 Quick
// Search Background patterns: a narrow runtime that production callers
// (`CopilotPickerModal`, the result modal, the auto-planner) reach
// through `AppContext.{get,tryGet}CopilotActionRuntime()`. The concrete
// implementation takes a {@link CopilotActionPorts} bag and is composed
// in `src/app/copilot/actions/composeCopilotActionRuntime.ts` — the
// single place where Obsidian `App`, AppContext concrete dependencies,
// AIServiceManager, SearchClient, sqliteStoreManager, ProfileRegistry,
// and Peak Harness are wired into ports.
//
// Single-instance-per-plugin-load. Binding semantics live in
// `AppRuntimeRegistry`.

import type { CopilotAction, DocumentContext } from '../CopilotActionRegistry';

export type CopilotActionCategory = 'document' | 'vault' | 'writing';

export interface CopilotActionRuntime {
	/** All registered actions (built-in + custom prompt actions). */
	getAll(): CopilotAction[];

	/** Look up an action by id; returns undefined if absent. */
	get(id: string): CopilotAction | undefined;

	/** Filtered view used by the picker tabs. */
	getByCategory(category: CopilotActionCategory): CopilotAction[];

	/** Built-in + custom actions ranked by relevance for the picker. */
	rank(ctx: DocumentContext): Array<{ action: CopilotAction; score: number }>;

	/**
	 * Re-read the custom prompt source (vault folder) and rebuild the
	 * `custom-*` action list. Called on plugin boot and after source
	 * watcher notifications; it never depends on sqlite availability.
	 */
	refreshCustomPrompts(): Promise<void>;

	/**
	 * Release any cached state held by adapters. Called from
	 * `main.onunload`. Idempotent.
	 */
	dispose?(): void;
}
