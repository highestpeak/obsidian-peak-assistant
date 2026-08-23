/**
 * SubAgentDispatcher — spins up an isolated AgentLoop for a delegated task
 * and returns a compact summary to the parent. See spec §3.5.
 *
 * Isolation guarantees:
 *  - child gets fresh messages[] (system prompt + single user prompt)
 *  - child runs against its own TierController (clone of parent bindings)
 *  - parent context only ever grows by the size of the returned summary
 *  - child failures surface as `error` on the summary, never thrown
 */

import { runAgentLoop } from '../loop/AgentLoop';
import { TierController } from '../tier/TierController';
import type { ModelTier } from '../tier/types';
import { PermissionGuard } from '../permission/PermissionGuard';
import type {
    DispatcherCtx,
    DispatchOptions,
    SubAgentDefinition,
    SubAgentDispatchSummary,
} from './types';

export class SubAgentDispatcher {
    private dispatchCounter = 0;

    constructor(private readonly ctx: DispatcherCtx) {}

    async dispatch(
        def: SubAgentDefinition,
        prompt: string,
        opts: DispatchOptions = {},
    ): Promise<SubAgentDispatchSummary> {
        const startedAt = Date.now();
        this.dispatchCounter += 1;
        const loopId = opts.loopId ?? `${this.ctx.parentLoopId}::sub-${def.name}-${this.dispatchCounter}`;

        const childController = this.buildChildController(def);
        const guard = def.permission ? new PermissionGuard(def.permission) : undefined;

        try {
            const result = await runAgentLoop({
                loopId,
                systemPrompt: def.systemPrompt,
                initialMessages: [{ role: 'user', content: prompt }],
                tools: def.tools,
                tierController: childController,
                budget: { maxSteps: def.maxTurns ?? 5 },
                abortSignal: opts.abortSignal,
                trace: this.ctx.trace,
                hooks: this.ctx.hooks,
                permission: guard,
				debugTrace: this.ctx.debugTrace,
				debugSurface: this.ctx.debugSurface,
				debugCapabilityId: `subagent.${def.name}`,
            });
            return {
                name: def.name,
                finalText: result.finalText,
                finishReason: result.finishReason,
                steps: result.steps.length,
                totalTokens: result.totalTokens,
                totalToolCalls: result.totalToolCalls,
                durationMs: result.durationMs,
                error: result.error,
            };
        } catch (err) {
            return {
                name: def.name,
                finalText: '',
                finishReason: 'error',
                steps: 0,
                totalTokens: 0,
                totalToolCalls: 0,
                durationMs: Date.now() - startedAt,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /**
     * Build a fresh TierController for the child. We do NOT share the parent
     * controller because escalations within the subagent must not leak back.
     */
    private buildChildController(def: SubAgentDefinition): TierController {
        const parentBindings = this.ctx.tierController.getBindings();
        let preferred: ModelTier | undefined;
        const tierField = def.tier ?? 'inherit';
        if (tierField === 'inherit') {
            preferred = this.ctx.tierController.currentTier();
        } else {
            preferred = tierField;
        }
        // Fall back to parent's current tier if the requested tier is not
        // bound — keeps the child usable on partially-configured installs.
        const policy = preferred ? { preferred } : {};
        return new TierController({
            bindings: parentBindings,
            policy,
            trace: this.ctx.trace,
            loopId: `${this.ctx.parentLoopId}::sub-${def.name}`,
        });
    }
}
