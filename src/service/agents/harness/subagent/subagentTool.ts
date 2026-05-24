/**
 * Adapter: wrap a SubAgentDefinition as a ToolDef so the parent AgentLoop
 * sees subagents through the unified tool-calling interface. See spec §3.5
 * decision note: "selected: subagent as parent loop tool, not handoff".
 *
 * The parent never imports SubAgentDispatcher directly — only the tool. This
 * keeps the parent's mental model simple: "I have a tool, I call it with a
 * prompt, I get a summary string back."
 */

import { z } from 'zod';
import type { SubAgentDispatcher } from './SubAgentDispatcher';
import type { SubAgentDefinition } from './types';
import type { ToolDef } from '../tool/types';

const SUBAGENT_TOOL_PREFIX = 'subagent.';

export function subagentToolName(def: SubAgentDefinition): string {
    return `${SUBAGENT_TOOL_PREFIX}${def.name}`;
}

export function buildSubagentTool(
    def: SubAgentDefinition,
    dispatcher: SubAgentDispatcher,
): ToolDef<{ prompt: string }, { summary: string; finishReason: string; steps: number; tokens: number; error?: string }> {
    return {
        name: subagentToolName(def),
        description: `Delegate to subagent "${def.name}": ${def.description}`,
        inputSchema: z.object({
            prompt: z
                .string()
                .min(1)
                .describe('Task description for the subagent. It runs in isolated context.'),
        }),
        kind: 'meta',
        async execute({ prompt }, ctx) {
            const result = await dispatcher.dispatch(def, prompt, {
                abortSignal: ctx.signal,
                loopId: `${ctx.loopId}::sub-${def.name}-step${ctx.stepIndex}`,
            });
            if (result.error) {
                return {
                    ok: false,
                    error: `subagent "${def.name}" failed: ${result.error}`,
                    recoverable: result.finishReason !== 'abort',
                };
            }
            return {
                ok: true,
                data: {
                    summary: result.finalText,
                    finishReason: result.finishReason,
                    steps: result.steps,
                    tokens: result.totalTokens,
                },
            };
        },
    };
}
