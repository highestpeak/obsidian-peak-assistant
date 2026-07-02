// T6 Skill v2 — quarantine enforcement helper.
//
// Pure decision function. A guard consumer (harness PermissionGuard,
// CapabilityRunner, or a manual check inside a tool) hands in the
// compiled skill and the tool name it wants to invoke; the helper
// returns a discriminated verdict:
//
//   - `'allow'`               — the call is permitted.
//   - `{ deny: 'not-in-whitelist' }` — strict skill's whitelist rejects.
//   - `{ deny: 'invalid-input' }`    — caller passed an empty tool name.
//
// The verdict shape is deliberately narrow so consumers can pattern-match
// with a `switch` on `verdict === 'allow' ? ... : verdict.deny`.
// Pattern chosen over throwing because guard consumers usually turn the
// deny into a tool-result / audit record, not an exception.

import type { CompiledSkill } from '@/core/types/compiled-skill';

export type QuarantineVerdict =
	| 'allow'
	| { readonly deny: 'not-in-whitelist' | 'invalid-input'; readonly reason: string };

/**
 * Decide whether `toolName` may be invoked while running `compiled`.
 *
 * Rules:
 *   1. Empty / whitespace-only tool name → `invalid-input`.
 *   2. `compiled.quarantine === 'permissive'` → `allow` (the capability
 *      decides its own tool set; the skill is not gating it).
 *   3. `compiled.quarantine === 'strict'` and `toolName` in
 *      `allowedTools` → `allow`.
 *   4. `compiled.quarantine === 'strict'` and `toolName` NOT in
 *      `allowedTools` → `not-in-whitelist`.
 */
export function checkSkillQuarantine(
	compiled: CompiledSkill,
	toolName: string,
): QuarantineVerdict {
	if (toolName.trim().length === 0) {
		return {
			deny: 'invalid-input',
			reason: 'tool name must be a non-empty string',
		};
	}
	if (compiled.quarantine === 'permissive') return 'allow';
	if (compiled.allowedTools.includes(toolName)) return 'allow';
	return {
		deny: 'not-in-whitelist',
		reason: `tool '${toolName}' is not in skill '${compiled.skillId}' allowed-tools whitelist`,
	};
}
