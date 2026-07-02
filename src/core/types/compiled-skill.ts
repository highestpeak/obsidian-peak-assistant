// T6 Skill v2 — Compiled Skill contract.
//
// A `CompiledSkill` is the runtime-facing projection of a `SkillDefinition`
// (which lives in `service/skills/types.ts`). Compilation happens at
// `SkillRegistry.compile(skillId)` time and freezes three fields the
// harness needs to enforce policy:
//
//   - `allowedTools`  — the flattened tool whitelist (builtin + mcp tool
//                       names). The harness `PermissionGuard` checks
//                       every tool call against this list.
//   - `systemPrompt`  — the prompt string extracted from the markdown
//                       body. Runners hand this to the model as-is.
//   - `quarantine`    — policy verb:
//       * `'strict'`      → only tools in `allowedTools` may be invoked.
//                          Any other tool call fails fast in the guard.
//       * `'permissive'`  → `allowedTools` is a hint; the harness may
//                          expose additional tools when a capability
//                          asks for them explicitly.
//
// The compiled form is immutable — every field is `readonly` — so the
// registry can cache one CompiledSkill per skill id and hand references
// out without defensive copies.
//
// Layering rule (checked by test/compiled-skill-shape.test.ts):
//   This file MUST NOT import from `@/service/*`, `@/app/*`, `@/ui/*`,
//   or `obsidian`. It is a pure-type module.
//
// See docs/superpowers/specs/2026-07-02-architecture-modernization-completion-plan.md
// §Wave 3.A for the T6 design context.

/**
 * Policy for how strictly the harness enforces `allowedTools`.
 *
 * Default when a SkillDefinition specifies a `tools` whitelist:
 *   `'strict'` — the guard rejects any tool not on the list.
 * Default when a SkillDefinition omits the whitelist entirely:
 *   `'permissive'` — the guard allows the capability's default tool set.
 */
export type SkillQuarantine = 'strict' | 'permissive';

/**
 * The read-only, runtime-facing form of a skill. Produced by
 * `SkillRegistry.compile(skillId)`. Runners depend on this shape, not
 * on the fuller `SkillDefinition`, so the registry can evolve without
 * breaking downstream consumers.
 */
export interface CompiledSkill {
	readonly skillId: string;
	readonly allowedTools: readonly string[];
	readonly systemPrompt: string;
	readonly quarantine: SkillQuarantine;
}
