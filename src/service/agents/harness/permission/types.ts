/**
 * Permission model for harness tool execution. See spec §3.7.
 *
 * Invariant: deny rules win over every mode, including bypassPermissions.
 * Mode controls only the default + ask behavior; it can never re-allow a
 * tool that a deny rule has rejected.
 */

import type { ToolDef } from '../tool/types';

export type PermissionMode =
    /** Read-only. Any tool that mutates state is rejected. */
    | 'read'
    /** Auto-approve edit-class tools, ask for everything else. M2: no ask UI yet → equivalent to allow. */
    | 'acceptEdits'
    /** Skip user prompts; deny rules still enforced. */
    | 'bypassPermissions';

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'acceptEdits';

/**
 * A tool may declare its kind so PermissionGuard can decide quickly.
 *  - read: pure read-only (search, list, fetch)
 *  - edit: mutates user data but reversible (vault.write, edit-note)
 *  - destructive: irreversible / dangerous (vault.delete, exec)
 *  - meta: tool that affects loop state (escalate, plan) but not data
 */
export type ToolKind = 'read' | 'edit' | 'destructive' | 'meta';

export interface PermissionRule {
    /** Matches against tool name. String → exact match; RegExp → pattern. */
    tool: string | RegExp;
    effect: 'allow' | 'deny';
    /** Optional predicate against the tool args; if provided must return true to match. */
    when?: (args: unknown) => boolean;
    /** Human-readable reason, surfaced to the model when denied. */
    reason?: string;
}

export interface PermissionDecisionAllow {
    decision: 'allow';
}
export interface PermissionDecisionDeny {
    decision: 'deny';
    reason: string;
}
export type PermissionDecision = PermissionDecisionAllow | PermissionDecisionDeny;

export interface PermissionConfig {
    mode: PermissionMode;
    rules?: PermissionRule[];
}

/** Helper: classify a tool by its declared kind (if any). */
export function isMutating(kind: ToolKind | undefined): boolean {
    return kind === 'edit' || kind === 'destructive';
}

/** Match rule against a tool name (and optionally args). */
export function ruleMatches(rule: PermissionRule, toolName: string, args: unknown): boolean {
    const nameMatches =
        typeof rule.tool === 'string' ? rule.tool === toolName : rule.tool.test(toolName);
    if (!nameMatches) return false;
    if (rule.when && !rule.when(args)) return false;
    return true;
}

/** Re-export for convenience. */
export type ToolForPermission = Pick<ToolDef, 'name'> & { kind?: ToolKind };
