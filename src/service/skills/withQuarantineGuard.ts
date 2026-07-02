// T6 Skill Quarantine — PermissionGuard wrapper.
//
// `checkSkillQuarantine` is the pure decision helper (verdict-only).
// This module is the *consumer* — it wraps a `ToolPort` (or any
// name-keyed tool source) with a quarantine-aware view so callers cannot
// accidentally reach for a tool the compiled skill forbids.
//
// Design:
//   - `withQuarantineGuard(port, compiled)` returns a new `ToolPort`
//     whose `has/get/all/forTier` are filtered by the skill's whitelist
//     (only when `quarantine === 'strict'`; permissive passes through).
//   - `guardToolExecution({ compiled, tool, args, ctx })` runs the
//     skill check *at execute time* and returns either `tool.execute(...)`
//     or a synthetic `fail(...)` ToolResult. This is what the harness
//     PermissionGuard invokes for every tool call.
//
// Boundary discipline: no app/UI/Obsidian imports. Depends only on
// core types + `quarantine.ts`.

import type { CompiledSkill } from '@/core/types/compiled-skill';
import type { ToolPort } from '@/core/ports/ToolPort';
import type { ModelTier } from '@/core/types/model-tier';
import type { ToolDef, ToolExecCtx, ToolResult } from '@/core/types/tool';
import { fail } from '@/core/types/tool';
import { checkSkillQuarantine } from './quarantine';

/**
 * Wrap a `ToolPort` so lookups + listings are automatically filtered
 * by the compiled skill's quarantine policy.
 *
 *   - `permissive` skills → pass-through.
 *   - `strict` skills    → `has` returns false, `get` returns undefined,
 *                          and `all`/`forTier` omit denied tools.
 */
export function withQuarantineGuard(port: ToolPort, compiled: CompiledSkill): ToolPort {
	if (compiled.quarantine === 'permissive') return port;

	const allowed = new Set(compiled.allowedTools);
	const filter = (t: ToolDef): boolean => allowed.has(t.name);

	return {
		has(name: string) {
			return allowed.has(name) && port.has(name);
		},
		get(name: string) {
			if (!allowed.has(name)) return undefined;
			return port.get(name);
		},
		all() {
			return port.all().filter(filter);
		},
		forTier(tier: ModelTier, allowedNames?: ReadonlyArray<string>) {
			return port.forTier(tier, allowedNames).filter(filter);
		},
	};
}

/**
 * Enforce quarantine at tool-execution time. Callers hand in the
 * compiled skill, the tool they want to call, its inputs, and the exec
 * context; the guard either dispatches to the tool or returns a
 * failure ToolResult so the loop can decide whether to retry.
 */
export async function guardToolExecution<TInput, TOutput>(args: {
	compiled: CompiledSkill;
	tool: ToolDef<TInput, TOutput>;
	input: TInput;
	ctx: ToolExecCtx;
}): Promise<ToolResult<TOutput>> {
	const verdict = checkSkillQuarantine(args.compiled, args.tool.name);
	if (verdict !== 'allow') {
		return fail(`skill-quarantine: ${verdict.reason}`, false) as ToolResult<TOutput>;
	}
	return args.tool.execute(args.input, args.ctx);
}
