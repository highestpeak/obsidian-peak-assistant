/**
 * Wraps existing MCP AgentTool adapter as harness ToolDef[].
 *
 * Reuses `mcpToolToAgentTool` for JSON-schema → zod conversion and the
 * MCPClientManager singleton for actual transport. Error normalization:
 * MCP throws → `{ ok: false, recoverable: true }`. We never re-throw.
 */

import { MCPClientManager } from '@/service/mcp/MCPClientManager';
import { mcpToolToAgentTool } from '@/service/mcp/MCPToolAdapter';
import type { ToolDef, ToolExecCtx, ToolResult } from './types';

interface McpToolDescriptor {
    name: string;
    description?: string;
    inputSchema?: unknown;
}

function adaptOne(serverName: string, serverId: string, mcpTool: McpToolDescriptor): ToolDef {
    const { name, tool: agentTool } = mcpToolToAgentTool(serverName, serverId, mcpTool);
    return {
        name,
        description: agentTool.description,
        inputSchema: agentTool.inputSchema as ToolDef['inputSchema'],
        async execute(args: unknown, _ctx: ToolExecCtx): Promise<ToolResult> {
            try {
                const data = await agentTool.execute(args);
                return { ok: true, data };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { ok: false, error: `mcp ${name}: ${message}`, recoverable: true };
            }
        },
    };
}

/** Adapt a single connected MCP server's discovered tools. */
export function adaptMcpServer(serverId: string, serverName: string, tools: McpToolDescriptor[]): ToolDef[] {
    return tools.map((t) => adaptOne(serverName, serverId, t));
}

/** Adapt every discovered MCP tool across all connected servers. */
export function adaptAllMcpTools(): ToolDef[] {
    const manager = MCPClientManager.getInstance();
    const out: ToolDef[] = [];
    for (const { serverId, serverName, tools } of manager.getAllDiscoveredTools()) {
        for (const t of tools) {
            out.push(adaptOne(serverName, serverId, t));
        }
    }
    return out;
}
