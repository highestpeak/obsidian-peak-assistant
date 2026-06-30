/**
 * Single-hook execution. Centralised so that exception handling and the
 * matcher-filter logic stay consistent across HookBus.fire callers.
 */

import type { HookConfig, HookContext, HookEvent, HookResult } from './types';

export function matcherApplies(
    config: HookConfig,
    toolName: string | undefined,
): boolean {
    if (!config.matcher) return true;
    if (toolName === undefined) return true; // session events ignore matcher
    if (typeof config.matcher === 'string') return config.matcher === toolName;
    return config.matcher.test(toolName);
}

export async function runHook<E extends HookEvent>(
    config: HookConfig<E>,
    ctx: HookContext<E>,
): Promise<HookResult> {
    if (!config.handler) return { kind: 'continue' };
    try {
        const out = await config.handler(ctx);
        if (!out) return { kind: 'continue' };
        return out;
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[HookBus] handler threw for event ${config.event}:`, err);
        // Defensive: a throwing hook should not silently let a guarded
        // operation through. Treat it as a block so the loop can react.
        return { kind: 'block', reason: `hook handler error: ${reason}` };
    }
}
