/**
 * Singleton managing connections to external MCP servers.
 *
 * Supports stdio (local process) and SSE (remote) transports.
 * Each connected server's tools are discoverable via getAllDiscoveredTools().
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { MCPServerConfig, MCPConnectionStatus, MCPConnectionInfo } from '@/core/types/mcp';

interface MCPToolDef {
	name: string;
	description?: string;
	inputSchema?: unknown;
}

interface MCPConnection {
	client: Client;
	transport: StdioClientTransport | SSEClientTransport;
	config: MCPServerConfig;
	status: MCPConnectionStatus;
	tools: MCPToolDef[];
	error?: string;
}

export class MCPClientManager {
	private static instance: MCPClientManager | null = null;
	private connections = new Map<string, MCPConnection>();

	private constructor() {}

	static getInstance(): MCPClientManager {
		if (!MCPClientManager.instance) {
			MCPClientManager.instance = new MCPClientManager();
		}
		return MCPClientManager.instance;
	}

	async connect(config: MCPServerConfig): Promise<void> {
		if (this.connections.has(config.id)) {
			await this.disconnect(config.id);
		}

		const client = new Client(
			{ name: 'peak-assistant', version: '1.0.0' },
			{ capabilities: {} },
		);

		const conn: MCPConnection = {
			client,
			transport: null as unknown as MCPConnection['transport'],
			config,
			status: 'connecting',
			tools: [],
		};
		this.connections.set(config.id, conn);

		try {
			let transport: MCPConnection['transport'];

			if (config.transport === 'stdio') {
				if (!config.command) throw new Error('stdio transport requires command');
				transport = new StdioClientTransport({
					command: config.command,
					args: config.args ?? [],
					env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
				});
			} else if (config.transport === 'sse') {
				if (!config.url) throw new Error('SSE transport requires url');
				transport = new SSEClientTransport(
					new URL(config.url),
				);
			} else {
				throw new Error(`Unknown transport: ${config.transport}`);
			}

			conn.transport = transport;
			await client.connect(transport);
			conn.status = 'connected';

			// Discover tools
			const toolsResult = await client.listTools();
			conn.tools = (toolsResult.tools ?? []) as MCPToolDef[];
		} catch (e) {
			conn.status = 'error';
			conn.error = e instanceof Error ? e.message : String(e);
			throw e;
		}
	}

	async disconnect(serverId: string): Promise<void> {
		const conn = this.connections.get(serverId);
		if (!conn) return;
		try {
			await conn.client.close();
		} catch { /* ignore close errors */ }
		this.connections.delete(serverId);
	}

	async callTool(serverId: string, toolName: string, args: unknown): Promise<unknown> {
		const conn = this.connections.get(serverId);
		if (!conn || conn.status !== 'connected') {
			throw new Error(`MCP server "${serverId}" is not connected`);
		}
		const result = await conn.client.callTool({
			name: toolName,
			arguments: args as Record<string, unknown>,
		});
		// Extract text content from MCP result
		if (Array.isArray(result.content)) {
			const textParts = result.content
				.filter((c: any) => c.type === 'text')
				.map((c: any) => c.text);
			return textParts.join('\n');
		}
		return result;
	}

	getConnectionInfo(serverId: string): MCPConnectionInfo | undefined {
		const conn = this.connections.get(serverId);
		if (!conn) return undefined;
		return {
			serverId,
			status: conn.status,
			toolCount: conn.tools.length,
			error: conn.error,
		};
	}

	getAllConnectionInfo(): MCPConnectionInfo[] {
		return Array.from(this.connections.values()).map(conn => ({
			serverId: conn.config.id,
			status: conn.status,
			toolCount: conn.tools.length,
			error: conn.error,
		}));
	}

	getDiscoveredTools(serverId: string): MCPToolDef[] {
		return this.connections.get(serverId)?.tools ?? [];
	}

	getAllDiscoveredTools(): Array<{ serverId: string; serverName: string; tools: MCPToolDef[] }> {
		return Array.from(this.connections.values())
			.filter(c => c.status === 'connected')
			.map(c => ({
				serverId: c.config.id,
				serverName: c.config.name,
				tools: c.tools,
			}));
	}

	async dispose(): Promise<void> {
		const ids = [...this.connections.keys()];
		await Promise.allSettled(ids.map(id => this.disconnect(id)));
		MCPClientManager.instance = null;
	}
}
