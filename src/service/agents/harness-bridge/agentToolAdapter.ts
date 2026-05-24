/**
 * Adapts legacy AgentTool (SDK-based) to harness ToolDef.
 *
 * AgentTool has: description, inputSchema, execute(input?) => Promise<any>
 * ToolDef needs:  name, description, inputSchema, execute(args, ctx) => Promise<ToolResult>
 */

import type { AgentTool } from '@/service/tools/types';
import { ok, fail } from '@/service/agents/harness/tool/types';
import type { ToolDef, ToolExecCtx } from '@/service/agents/harness/tool/types';

export function adaptAgentTool(name: string, tool: AgentTool): ToolDef {
    return {
        name,
        description: tool.description,
        inputSchema: tool.inputSchema as ToolDef['inputSchema'],
        async execute(args: unknown, _ctx: ToolExecCtx) {
            try {
                const data = await tool.execute(args);
                return ok(data);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return fail(`${name}: ${msg}`, true);
            }
        },
    };
}

export function adaptAgentTools(tools: Record<string, AgentTool>): ToolDef[] {
    return Object.entries(tools).map(([name, tool]) => adaptAgentTool(name, tool));
}
