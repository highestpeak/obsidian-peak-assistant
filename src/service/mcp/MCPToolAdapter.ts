/**
 * Converts MCP tool definitions to the AgentTool interface used by the agent system.
 *
 * MCP tools use JSON Schema for input definitions. This adapter converts them
 * to Zod schemas (via a simplified JSON Schema -> Zod converter) so they
 * integrate seamlessly with the existing AgentTool contract.
 *
 * Tool names are namespaced: mcp_{serverName}_{toolName} to avoid collisions.
 */

import { z } from 'zod/v3';
import type { AgentTool } from '@/service/tools/types';
import type { MCPClientManager } from './MCPClientManager';
import type { ToolDef, ToolExecCtx } from '@/service/agents/harness/tool/types';
import { ok, fail } from '@/service/agents/harness/tool/types';

/**
 * Simplified JSON Schema to Zod conversion for MCP tool input schemas.
 * Handles the common cases: object with string/number/boolean/array properties.
 */
function jsonSchemaToZod(schema: any): z.ZodType {
	if (!schema || schema.type !== 'object') {
		return z.object({}).passthrough();
	}

	const shape: Record<string, z.ZodType> = {};
	const properties = schema.properties ?? {};
	const required = new Set(schema.required ?? []);

	for (const [key, prop] of Object.entries(properties) as [string, any][]) {
		let fieldSchema: z.ZodType;
		switch (prop.type) {
			case 'string':
				fieldSchema = z.string();
				if (prop.description) fieldSchema = (fieldSchema as z.ZodString).describe(prop.description);
				break;
			case 'number':
			case 'integer':
				fieldSchema = z.number();
				if (prop.description) fieldSchema = (fieldSchema as z.ZodNumber).describe(prop.description);
				break;
			case 'boolean':
				fieldSchema = z.boolean();
				if (prop.description) fieldSchema = (fieldSchema as z.ZodBoolean).describe(prop.description);
				break;
			case 'array':
				fieldSchema = z.array(z.any());
				if (prop.description) fieldSchema = (fieldSchema as z.ZodArray<z.ZodAny>).describe(prop.description);
				break;
			default:
				fieldSchema = z.any();
				break;
		}
		if (!required.has(key)) {
			fieldSchema = fieldSchema.optional();
		}
		shape[key] = fieldSchema;
	}

	return z.object(shape).passthrough();
}

/**
 * Sanitize a server name for use in tool namespacing.
 * Replaces non-alphanumeric characters with underscores.
 */
function sanitizeName(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Convert a single MCP tool definition to an AgentTool.
 * Tool name is namespaced: mcp_{serverName}_{toolName}
 */
export function mcpToolToAgentTool(
	manager: MCPClientManager,
	serverName: string,
	serverId: string,
	mcpTool: { name: string; description?: string; inputSchema?: any },
): { name: string; tool: AgentTool } {
	const safeName = sanitizeName(serverName);
	const toolName = `mcp_${safeName}_${mcpTool.name}`;

	return {
		name: toolName,
		tool: {
			description: mcpTool.description ?? `MCP tool from ${serverName}`,
			inputSchema: jsonSchemaToZod(mcpTool.inputSchema),
			execute: async (input) => {
				const result = await manager.callTool(serverId, mcpTool.name, input);
				return result;
			},
		},
	};
}

/**
 * Get all MCP tools from all connected servers as AgentTool record.
 * Keys are namespaced: mcp_{serverName}_{toolName}
 */
export function getAllMcpAgentTools(manager: MCPClientManager): Record<string, AgentTool> {
	const allTools: Record<string, AgentTool> = {};

	for (const { serverId, serverName, tools } of manager.getAllDiscoveredTools()) {
		for (const mcpTool of tools) {
			const { name, tool } = mcpToolToAgentTool(manager, serverName, serverId, mcpTool);
			allTools[name] = tool;
		}
	}

	return allTools;
}

/**
 * T5 ToolDef Envelope — direct MCP → ToolDef path.
 *
 * Produces a harness ToolDef tagged with `source: 'mcp'`. Name is
 * namespaced `mcp_<server>_<tool>` matching the AgentTool adapter above so
 * the two envelopes reference the same underlying MCP endpoint by name.
 *
 * The permission `kind` defaults to `'edit'` because MCP tools frequently
 * mutate external systems and the server's declared metadata does not
 * currently carry a read/edit hint. Individual servers can be pinned to
 * `'read'` later when we surface per-tool metadata; erring on the safer
 * side is intentional so PermissionGuard treats MCP calls as gated by
 * default.
 */
export function mcpToolToToolDef(
	manager: MCPClientManager,
	serverName: string,
	serverId: string,
	mcpTool: { name: string; description?: string; inputSchema?: any },
): ToolDef {
	const safeName = sanitizeName(serverName);
	const toolName = `mcp_${safeName}_${mcpTool.name}`;
	const inputSchema = jsonSchemaToZod(mcpTool.inputSchema);
	return {
		name: toolName,
		description: mcpTool.description ?? `MCP tool from ${serverName}`,
		inputSchema,
		source: 'mcp',
		kind: 'edit',
		async execute(args: unknown, _ctx: ToolExecCtx) {
			try {
				const data = await manager.callTool(serverId, mcpTool.name, args);
				return ok(data);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return fail(`${toolName}: ${msg}`, true);
			}
		},
	};
}

/**
 * Return every discovered MCP tool as an array of harness ToolDefs
 * (source='mcp'). Parallel to `getAllMcpAgentTools` — one flow to the
 * legacy AgentTool bridge, one direct T5 path. Consumers can pick either.
 */
export function getAllMcpToolDefs(manager: MCPClientManager): ToolDef[] {
	const out: ToolDef[] = [];
	for (const { serverId, serverName, tools } of manager.getAllDiscoveredTools()) {
		for (const mcpTool of tools) {
			out.push(mcpToolToToolDef(manager, serverName, serverId, mcpTool));
		}
	}
	return out;
}
