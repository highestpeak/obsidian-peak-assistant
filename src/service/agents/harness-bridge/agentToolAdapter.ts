/**
 * Adapts legacy AgentTool (SDK-based) to harness ToolDef.
 *
 * AgentTool has: description, inputSchema, execute(input?) => Promise<any>
 * ToolDef needs:  name, description, inputSchema, execute(args, ctx) => Promise<ToolResult>
 */

import type { AgentTool } from '@/service/tools/types';
import { ok, fail } from '@/service/agents/harness/tool/types';
import type { ToolDef, ToolExecCtx, ToolSource } from '@/service/agents/harness/tool/types';

/**
 * Bridge a legacy AgentTool into a harness ToolDef. Callers can override
 * the origin discriminator (`source`) when adapting tools that came from a
 * non-local origin (e.g. an MCP-derived AgentTool). Defaults to `'local'`
 * because in-tree chat/agent tools are the common case.
 */
export function adaptAgentTool(name: string, tool: AgentTool, source: ToolSource = 'local'): ToolDef {
    return {
        name,
        description: tool.description,
        inputSchema: tool.inputSchema as unknown as ToolDef['inputSchema'],
        source,
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

export function adaptAgentTools(tools: Record<string, AgentTool>, source: ToolSource = 'local'): ToolDef[] {
    return Object.entries(tools).map(([name, tool]) => adaptAgentTool(name, tool, source));
}
