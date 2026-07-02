// T2 Port Sketches — ToolPort.
//
// Read-only port that the harness runner (and any future
// CapabilityRunner) depends on instead of the concrete `ToolRegistry`
// class. Extracting this interface has two benefits:
//
//   1. Consumers no longer import `@/service/agents/harness/tool/registry`
//      just for a lookup — they can depend on the port and let the
//      composition site decide which registry impl to inject.
//   2. Alternate registry impls (e.g. a MobileToolRegistry that filters
//      by platform, or a QuarantinedToolRegistry that pre-applies
//      `checkSkillQuarantine`) can slot in without touching consumers.
//
// The port is deliberately **read-only** — mutation (`register`,
// `registerAll`, `clear`) stays on the concrete class because those
// belong to the composition step, not the read path.
//
// Boundary discipline: this file MUST NOT import from `@/service/*`,
// `@/app/*`, `@/ui/*`, or `obsidian`. `ToolDef` and `ModelTier` live in
// `core/types/` so the port stays inside the core layer.

import type { ToolDef } from '@/core/types/tool';
import type { ModelTier } from '@/core/types/model-tier';

/**
 * Read-only view of a tool registry. Concrete implementations
 * (`ToolRegistry`) provide additional `register` / `clear` mutators for
 * composition; consumers depend on this narrower shape.
 */
export interface ToolPort {
	/** True when a tool with `name` is registered. */
	has(name: string): boolean;
	/** Fetch a tool by name; undefined if not registered. */
	get(name: string): ToolDef | undefined;
	/** Snapshot of every registered tool, in registration order. */
	all(): ToolDef[];
	/**
	 * Tools usable by `tier`, optionally restricted to a name whitelist
	 * (e.g. a skill's `allowedTools`). Filtering by name is done here so
	 * consumers can express "the intersection of tier-allowed and skill-
	 * allowed" in one call.
	 */
	forTier(tier: ModelTier, allowedNames?: ReadonlyArray<string>): ToolDef[];
}
