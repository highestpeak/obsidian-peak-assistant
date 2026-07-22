/**
 * PermissionGuard — enforces deny-first permission semantics. See spec §3.7.
 *
 * Decision precedence (top wins):
 *   1. Explicit deny rule (matched by name + optional args predicate)
 *   2. Mode-driven prohibitions (read mode forbids edit/destructive tools)
 *   3. Explicit allow rule
 *   4. Mode default (acceptEdits / bypassPermissions → allow)
 *
 * The deny path is unconditional: even bypassPermissions cannot override an
 * explicit deny rule. This is the "deny-first invariant" called out in the
 * spec.
 */

import {
    DEFAULT_PERMISSION_MODE,
    isMutating,
    ruleMatches,
    type PermissionConfig,
    type PermissionDecision,
    type PermissionMode,
    type PermissionRule,
    type ToolForPermission,
} from './types';

export class PermissionGuard {
    private readonly mode: PermissionMode;
    private readonly rules: PermissionRule[];

    constructor(config?: PermissionConfig) {
        this.mode = config?.mode ?? DEFAULT_PERMISSION_MODE;
        this.rules = config?.rules ?? [];
    }

    getMode(): PermissionMode {
        return this.mode;
    }

    /**
     * Check whether the tool may execute with these args. Pure / synchronous.
     *
     * May return `{ decision: 'ask' }`; the AgentLoop then suspends the tool
     * call and awaits an external `resolvePermissionAsk` callback. Absent
     * resolver → the loop treats ask as deny (safe fallback preserves the
     * legacy behaviour of never surprising the user with an unattended tool
     * invocation).
     */
    check(tool: ToolForPermission, args: unknown): PermissionDecision {
        // 1. Deny rules — always first, never overridable.
        for (const rule of this.rules) {
            if (rule.effect === 'deny' && ruleMatches(rule, tool.name, args)) {
                return {
                    decision: 'deny',
                    reason: rule.reason ?? `denied by rule for tool "${tool.name}"`,
                };
            }
        }

        // 2. Mode-driven prohibitions (read mode blocks mutating tools).
        if (this.mode === 'read' && isMutating(tool.kind)) {
            return {
                decision: 'deny',
                reason: `tool "${tool.name}" (${tool.kind}) is blocked in read-only permission mode`,
            };
        }

        // 3. Explicit ask rule — matched before allow so an "ask exception"
        //    can shadow the default allow. Must still be checked before mode
        //    default in step 5.
        for (const rule of this.rules) {
            if (rule.effect === 'ask' && ruleMatches(rule, tool.name, args)) {
                return {
                    decision: 'ask',
                    reason: rule.reason ?? `tool "${tool.name}" requires confirmation`,
                };
            }
        }

        // 4. Explicit allow rule.
        for (const rule of this.rules) {
            if (rule.effect === 'allow' && ruleMatches(rule, tool.name, args)) {
                return { decision: 'allow' };
            }
        }

        // 5. Mode default.
        //    ask               → mutating tools require confirmation; reads
        //                        auto-allow to match "no surprise" invariant
        //    acceptEdits       → allow (auto-approve edit-class tools)
        //    bypassPermissions → allow (deny rules already filtered above)
        //    read              → allow (only mutating tools were blocked in step 2)
        if (this.mode === 'ask' && isMutating(tool.kind)) {
            return {
                decision: 'ask',
                reason: `tool "${tool.name}" (${tool.kind}) requires confirmation in ask mode`,
            };
        }
        return { decision: 'allow' };
    }
}
