/**
 * HookBus — registry + dispatcher for harness hooks. See spec §3.6.
 *
 * Hooks are evaluated in registration order. The first hook that returns a
 * non-`continue` outcome short-circuits the chain:
 *   - block  → return immediately; caller halts the operation.
 *   - modify → return immediately; subsequent hooks DO NOT see the modified
 *              result. (Avoids chained mutation cascades.)
 *
 * This bus is intentionally tiny (no Node `events`) so it works in browser
 * / worker contexts that Obsidian sometimes runs in.
 */

import { matcherApplies, runHook } from './runHook';
import type {
    HookConfig,
    HookContext,
    HookEvent,
    HookHandler,
    HookResult,
} from './types';

export class HookBus {
    private configs: HookConfig[] = [];

    register<E extends HookEvent>(config: HookConfig<E>): void {
        this.configs.push(config as HookConfig);
    }

    /** Convenience: register an inline handler with optional matcher. */
    on<E extends HookEvent>(
        event: E,
        handler: HookHandler<E>,
        matcher?: string | RegExp,
    ): void {
        this.register({ event, handler, matcher } as HookConfig<E>);
    }

    /** Number of registered configs (used by tests). */
    size(): number {
        return this.configs.length;
    }

    clear(): void {
        this.configs = [];
    }

    /**
     * Fire all matching handlers for an event. Returns the first non-continue
     * result, or `{ kind: 'continue' }` if every handler passes.
     *
     * `toolName` is only used to filter tool-scoped hooks; pass undefined for
     * session events.
     */
    async fire<E extends HookEvent>(
        event: E,
        ctx: HookContext<E>,
        toolName?: string,
    ): Promise<HookResult> {
        for (const config of this.configs) {
            if (config.event !== event) continue;
            if (!matcherApplies(config, toolName)) continue;
            const result = await runHook(config as HookConfig<E>, ctx);
            if (result.kind !== 'continue') return result;
        }
        return { kind: 'continue' };
    }
}
