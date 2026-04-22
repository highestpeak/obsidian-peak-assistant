/**
 * Adapts AgentTool instances (Zod-based) into an Agent SDK MCP server.
 *
 * This lets agents that previously used Vercel AI SDK's `Experimental_Agent`
 * with inline tools migrate to `queryWithProfile()` with MCP servers.
 *
 * Provider v2 Task 6.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { AgentTool } from '@/service/tools/types';
import type { ZodObject, ZodRawShape } from 'zod/v3';

/**
 * Convert a record of AgentTool instances into an Agent SDK MCP server config.
 *
 * Each tool's `inputSchema` must be a `z.object(...)` — the `.shape` is
 * extracted and passed to the SDK's `tool()` builder.
 *
 * @param serverName - MCP server name (e.g. 'doc', 'followup')
 * @param tools - Record<toolName, AgentTool>
 * @returns MCP server config for `queryWithProfile({ mcpServers: { [name]: server } })`
 */
export function agentToolsToMcpServer(
	serverName: string,
	tools: Record<string, AgentTool>,
) {
	const sdkTools = Object.entries(tools).map(([name, agentTool]) => {
		// Extract the raw Zod shape from z.object(...)
		const zodObj = agentTool.inputSchema as ZodObject<ZodRawShape>;
		const shape = zodObj.shape ?? {};

		return tool(
			name,
			agentTool.description,
			shape,
			async (input, _extra) => {
				const result = await agentTool.execute(input);
				const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
				return {
					content: [{ type: 'text' as const, text }],
				};
			},
		);
	});

	return createSdkMcpServer({
		name: serverName,
		version: '1.0.0',
		tools: sdkTools,
	});
}

/**
 * Build the `allowedTools` list for a given MCP server name and tool record.
 * Returns tool names in `mcp__<serverName>__<toolName>` format.
 */
export function mcpToolNames(serverName: string, tools: Record<string, unknown>): string[] {
	return Object.keys(tools).map((name) => `mcp__${serverName}__${name}`);
}
