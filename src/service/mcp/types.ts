/**
 * Configuration and status types for external MCP server connections.
 */

export interface MCPServerConfig {
	id: string;
	name: string;
	enabled: boolean;
	transport: 'stdio' | 'sse';
	// stdio transport
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	// SSE transport
	url?: string;
	headers?: Record<string, string>;
}

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MCPConnectionInfo {
	serverId: string;
	status: MCPConnectionStatus;
	toolCount: number;
	error?: string;
}
